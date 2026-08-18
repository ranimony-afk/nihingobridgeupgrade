import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  knowledgeAudioAssets,
  knowledgeCollocations,
  knowledgeDatasets,
  knowledgeGrammarExamples,
  knowledgeGrammarPoints,
  knowledgeIdioms,
  knowledgeImportRuns,
  knowledgeKanji,
  knowledgeKanjiComponents,
  knowledgeKanjiMeanings,
  knowledgeKanjiReadings,
  knowledgeKanjiStrokes,
  knowledgeLexemeGlosses,
  knowledgeLexemeReadings,
  knowledgeLexemeSenses,
  knowledgeLexemeSpellings,
  knowledgeLexemes,
  knowledgeNames,
  knowledgeSentenceTokens,
  knowledgeSentenceTranslations,
  knowledgeSentences,
  knowledgeValidationIssues,
} from "@/db/schema";
import { env } from "@/lib/env";
import { findDatasetDefinition, syncKnowledgeDatasetRegistry, type KnowledgeDatasetKey } from "@/lib/knowledge/datasets";
import {
  parseFrequencyTsv,
  parseJmdict,
  parseJmnedict,
  parseJsonKnowledgeDataset,
  parseKanjidic2,
  parseKanjiVgDirectory,
  parseTatoebaSentences,
  parseUnidicCsv,
} from "@/lib/knowledge/etl/parsers";
import type { ImportRecord, ImportedLexeme } from "@/lib/knowledge/etl/types";
import { validateKnowledgeImportRun } from "@/lib/knowledge/validation";

export type KnowledgeImportOptions = {
  datasetKey: KnowledgeDatasetKey;
  inputPath: string;
  sourceVersion: string;
  mode?: "incremental" | "replace";
};

export type KnowledgeImportResult = {
  runId: string;
  status: "completed" | "skipped" | "failed";
  recordsRead: number;
  recordsWritten: number;
  recordsSkipped: number;
  recordsFailed: number;
};

type Counters = {
  read: number;
  written: number;
  skipped: number;
  failed: number;
  issues: number;
};

function sourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function checksumPath(inputPath: string): Promise<string> {
  const digest = createHash("sha256");
  const input = createReadStream(inputPath);
  for await (const chunk of input) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

function buildSearchText(values: Array<string | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ").replace(/\s+/g, " ").trim();
}

function validateRecord(record: ImportRecord): string | null {
  switch (record.kind) {
    case "lexeme":
      return record.value.spellings.length === 0 && record.value.readings.length === 0
        ? "LEXEME_WITHOUT_SPELLING_OR_READING"
        : null;
    case "kanji":
      return [...record.value.literal].length !== 1 ? "INVALID_KANJI_LITERAL" : null;
    case "sentence":
      return record.value.text.length === 0 ? "EMPTY_SENTENCE" : null;
    case "grammar":
      return !record.value.pattern || !record.value.explanation ? "INCOMPLETE_GRAMMAR_POINT" : null;
    case "idiom":
      return !record.value.expression || !record.value.meaning ? "INCOMPLETE_IDIOM" : null;
    case "collocation":
      return !record.value.headword || !record.value.collocate ? "INCOMPLETE_COLLOCATION" : null;
    default:
      return null;
  }
}

export async function importKnowledgeDataset(options: KnowledgeImportOptions): Promise<KnowledgeImportResult> {
  const definition = findDatasetDefinition(options.datasetKey);
  if (!definition) throw new Error(`Unsupported knowledge dataset key: ${options.datasetKey}`);
  const metadata = await stat(options.inputPath);
  if (!metadata.isFile() && options.datasetKey !== "kanjivg") {
    throw new Error(`Knowledge input must be a file: ${options.inputPath}`);
  }

  await syncKnowledgeDatasetRegistry();
  const [dataset] = await db
    .select()
    .from(knowledgeDatasets)
    .where(eq(knowledgeDatasets.key, options.datasetKey))
    .limit(1);
  if (!dataset) throw new Error(`Dataset registry entry was not created: ${options.datasetKey}`);

  const sourceChecksum = options.datasetKey === "kanjivg"
    ? sourceHash({ directory: options.inputPath, modifiedAt: metadata.mtimeMs })
    : await checksumPath(options.inputPath);
  const mode = options.mode ?? "incremental";
  const [previous] = await db
    .select()
    .from(knowledgeImportRuns)
    .where(
      and(
        eq(knowledgeImportRuns.datasetId, dataset.id),
        eq(knowledgeImportRuns.sourceVersion, options.sourceVersion),
        eq(knowledgeImportRuns.sourceChecksum, sourceChecksum),
      ),
    )
    .limit(1);

  if (previous?.status === "completed" && mode === "incremental") {
    return {
      runId: previous.id,
      status: "skipped",
      recordsRead: previous.recordsRead,
      recordsWritten: previous.recordsWritten,
      recordsSkipped: previous.recordsSkipped,
      recordsFailed: previous.recordsFailed,
    };
  }

  const [run] = await db
    .insert(knowledgeImportRuns)
    .values({
      datasetId: dataset.id,
      sourceVersion: options.sourceVersion,
      sourceChecksum,
      sourcePath: options.inputPath,
      mode,
      status: "running",
      startedAt: new Date(),
      summary: { sourceUrl: definition.sourceUrl, fileSize: metadata.size },
    })
    .onConflictDoUpdate({
      target: [knowledgeImportRuns.datasetId, knowledgeImportRuns.sourceVersion, knowledgeImportRuns.sourceChecksum],
      set: {
        status: "running",
        sourcePath: options.inputPath,
        mode,
        recordsRead: 0,
        recordsWritten: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        cursor: null,
        startedAt: new Date(),
        finishedAt: null,
        summary: { sourceUrl: definition.sourceUrl, fileSize: metadata.size },
      },
    })
    .returning();

  const counters: Counters = { read: 0, written: 0, skipped: 0, failed: 0, issues: 0 };
  let batch: ImportRecord[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    for (const record of batch) {
      counters.read += 1;
      const issue = validateRecord(record);
      if (issue) {
        await recordIssue(run.id, counters, issue, "Record failed structural validation.", record);
        counters.failed += 1;
        continue;
      }
      try {
        const didWrite = await persistRecord(dataset.id, record);
        if (didWrite) counters.written += 1;
        else counters.skipped += 1;
      } catch (error) {
        counters.failed += 1;
        await recordIssue(
          run.id,
          counters,
          "PERSISTENCE_ERROR",
          error instanceof Error ? error.message : "Unknown persistence error.",
          record,
        );
      }
    }
    batch = [];
    await updateRun(run.id, counters);
  };

  const emit = async (record: ImportRecord) => {
    batch.push(record);
    if (batch.length >= env.KNOWLEDGE_IMPORT_BATCH_SIZE) await flush();
  };

  try {
    switch (options.datasetKey) {
      case "jmdict":
        await parseJmdict(options.inputPath, emit);
        break;
      case "kanjidic2":
        await parseKanjidic2(options.inputPath, emit);
        break;
      case "jmnedict":
        await parseJmnedict(options.inputPath, emit);
        break;
      case "tatoeba":
        await parseTatoebaSentences(options.inputPath, emit);
        break;
      case "unidic":
        await parseUnidicCsv(options.inputPath, emit);
        break;
      case "frequency":
        await parseFrequencyTsv(options.inputPath, emit);
        break;
      case "kanjivg":
        await parseKanjiVgDirectory(options.inputPath, emit);
        break;
      default:
        await parseJsonKnowledgeDataset(options.datasetKey, options.inputPath, emit);
        break;
    }
    await flush();
    const validation = await validateKnowledgeImportRun(run.id);

    await db
      .update(knowledgeImportRuns)
      .set({
        status: counters.failed > 0 || validation.issues > 0 ? "completed_with_issues" : "completed",
        recordsRead: counters.read,
        recordsWritten: counters.written,
        recordsSkipped: counters.skipped,
        recordsFailed: counters.failed,
        finishedAt: new Date(),
        summary: { sourceUrl: definition.sourceUrl, validationIssues: counters.issues + validation.issues, validationChecked: validation.checked },
      })
      .where(eq(knowledgeImportRuns.id, run.id));
    await db
      .update(knowledgeDatasets)
      .set({ latestVersion: options.sourceVersion, latestChecksum: sourceChecksum, updatedAt: new Date() })
      .where(eq(knowledgeDatasets.id, dataset.id));

    return {
      runId: run.id,
      status: "completed",
      recordsRead: counters.read,
      recordsWritten: counters.written,
      recordsSkipped: counters.skipped,
      recordsFailed: counters.failed,
    };
  } catch (error) {
    await db
      .update(knowledgeImportRuns)
      .set({
        status: "failed",
        recordsRead: counters.read,
        recordsWritten: counters.written,
        recordsSkipped: counters.skipped,
        recordsFailed: counters.failed,
        finishedAt: new Date(),
        summary: { sourceUrl: definition.sourceUrl, fatalError: error instanceof Error ? error.message : "Unknown error" },
      })
      .where(eq(knowledgeImportRuns.id, run.id));
    throw error;
  }
}

async function updateRun(runId: string, counters: Counters): Promise<void> {
  await db
    .update(knowledgeImportRuns)
    .set({
      recordsRead: counters.read,
      recordsWritten: counters.written,
      recordsSkipped: counters.skipped,
      recordsFailed: counters.failed,
    })
    .where(eq(knowledgeImportRuns.id, runId));
}

async function recordIssue(
  runId: string,
  counters: Counters,
  code: string,
  message: string,
  record: ImportRecord,
): Promise<void> {
  counters.issues += 1;
  if (counters.issues > env.KNOWLEDGE_MAX_VALIDATION_ISSUES) {
    throw new Error(`Knowledge import exceeded KNOWLEDGE_MAX_VALIDATION_ISSUES (${env.KNOWLEDGE_MAX_VALIDATION_ISSUES}).`);
  }
  await db.insert(knowledgeValidationIssues).values({
    importRunId: runId,
    severity: code === "PERSISTENCE_ERROR" ? "error" : "warning",
    code,
    recordLocator: record.kind,
    message,
    rawPayload: record as unknown as Record<string, unknown>,
  });
}

async function persistRecord(datasetId: string, record: ImportRecord): Promise<boolean> {
  switch (record.kind) {
    case "lexeme":
      await upsertLexeme(datasetId, record.value);
      return true;
    case "kanji":
      await upsertKanji(datasetId, record.value);
      return true;
    case "name":
      await upsertName(datasetId, record.value);
      return true;
    case "sentence":
      await upsertSentence(datasetId, record.value);
      return true;
    case "sentence_translation":
      return upsertSentenceTranslation(datasetId, record.value);
    case "sentence_token":
      return upsertSentenceToken(record.value);
    case "grammar":
      await upsertGrammar(datasetId, record.value);
      return true;
    case "idiom":
      await upsertIdiom(datasetId, record.value);
      return true;
    case "collocation":
      await upsertCollocation(datasetId, record.value);
      return true;
    case "kanji_stroke":
      return upsertKanjiStroke(datasetId, record.value);
    case "frequency":
      return applyFrequency(record.value);
    case "furigana":
      return applyFurigana(record.value);
    case "pitch":
      return applyPitch(record.value);
    case "audio":
      return upsertAudio(datasetId, record.value);
  }
}

async function upsertLexeme(datasetId: string, value: ImportedLexeme): Promise<void> {
  const recordHash = sourceHash(value);
  const primarySpelling = value.spellings.find((form) => form.isPrimary)?.spelling ?? value.spellings[0]?.spelling ?? null;
  const primaryReading = value.readings.find((reading) => reading.isPrimary)?.reading ?? value.readings[0]?.reading ?? null;
  const primaryGloss = value.senses.flatMap((sense) => sense.glosses).find((gloss) => gloss.language === "eng")?.gloss ?? null;
  const [lexeme] = await db
    .insert(knowledgeLexemes)
    .values({
      datasetId,
      externalId: value.externalId,
      primarySpelling,
      primaryReading,
      primaryGloss,
      common: value.common ?? false,
      jlptLevel: value.jlptLevel ?? null,
      frequencyRank: value.frequencyRank ?? null,
      searchText: buildSearchText([primarySpelling, primaryReading, primaryGloss, ...value.senses.flatMap((sense) => sense.glosses.map((gloss) => gloss.gloss))]),
      sourceHash: recordHash,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [knowledgeLexemes.datasetId, knowledgeLexemes.externalId],
      set: {
        primarySpelling,
        primaryReading,
        primaryGloss,
        common: value.common ?? false,
        jlptLevel: value.jlptLevel ?? null,
        frequencyRank: value.frequencyRank ?? null,
        searchText: buildSearchText([primarySpelling, primaryReading, primaryGloss, ...value.senses.flatMap((sense) => sense.glosses.map((gloss) => gloss.gloss))]),
        sourceHash: recordHash,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db.delete(knowledgeLexemeSpellings).where(eq(knowledgeLexemeSpellings.lexemeId, lexeme.id));
  await db.delete(knowledgeLexemeReadings).where(eq(knowledgeLexemeReadings.lexemeId, lexeme.id));
  await db.delete(knowledgeLexemeSenses).where(eq(knowledgeLexemeSenses.lexemeId, lexeme.id));

  if (value.spellings.length > 0) {
    await db.insert(knowledgeLexemeSpellings).values(value.spellings.map((form) => ({ ...form, lexemeId: lexeme.id })));
  }
  if (value.readings.length > 0) {
    await db.insert(knowledgeLexemeReadings).values(value.readings.map((reading) => ({
      lexemeId: lexeme.id,
      reading: reading.reading,
      romaji: reading.romaji ?? null,
      noKanji: reading.noKanji,
      isPrimary: reading.isPrimary,
      information: reading.information,
      furigana: reading.furigana ?? [],
      pitchAccents: reading.pitchAccents ?? [],
    })));
  }

  for (const sense of value.senses) {
    const [storedSense] = await db
      .insert(knowledgeLexemeSenses)
      .values({
        lexemeId: lexeme.id,
        position: sense.position,
        partOfSpeech: sense.partOfSpeech,
        fields: sense.fields,
        dialects: sense.dialects,
        misc: sense.misc,
        appliesToSpellings: sense.appliesToSpellings,
        appliesToReadings: sense.appliesToReadings,
        searchText: sense.glosses.map((gloss) => gloss.gloss).join(" "),
      })
      .returning({ id: knowledgeLexemeSenses.id });
    if (sense.glosses.length > 0) {
      await db.insert(knowledgeLexemeGlosses).values(sense.glosses.map((gloss) => ({ ...gloss, senseId: storedSense.id, type: gloss.type ?? null, gender: gloss.gender ?? null })));
    }
  }
}

async function upsertKanji(datasetId: string, value: Extract<ImportRecord, { kind: "kanji" }>['value']): Promise<void> {
  const [kanji] = await db
    .insert(knowledgeKanji)
    .values({
      datasetId,
      literal: value.literal,
      unicodeCodepoint: value.literal.codePointAt(0)?.toString(16).toUpperCase() ?? value.externalId,
      radical: value.radical ?? null,
      grade: value.grade ?? null,
      strokeCount: value.strokeCount ?? null,
      frequencyRank: value.frequencyRank ?? null,
      jlptLevel: value.jlptLevel ?? null,
      joyo: value.joyo ?? false,
      jinmeiyo: value.jinmeiyo ?? false,
      searchText: buildSearchText([value.literal, ...value.readings.map((reading) => reading.reading), ...value.meanings.map((meaning) => meaning.meaning)]),
      sourceHash: sourceHash(value),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: knowledgeKanji.literal,
      set: {
        datasetId,
        unicodeCodepoint: value.literal.codePointAt(0)?.toString(16).toUpperCase() ?? value.externalId,
        radical: value.radical ?? null,
        grade: value.grade ?? null,
        strokeCount: value.strokeCount ?? null,
        frequencyRank: value.frequencyRank ?? null,
        jlptLevel: value.jlptLevel ?? null,
        joyo: value.joyo ?? false,
        jinmeiyo: value.jinmeiyo ?? false,
        searchText: buildSearchText([value.literal, ...value.readings.map((reading) => reading.reading), ...value.meanings.map((meaning) => meaning.meaning)]),
        sourceHash: sourceHash(value),
        updatedAt: new Date(),
      },
    })
    .returning();
  await db.delete(knowledgeKanjiReadings).where(eq(knowledgeKanjiReadings.kanjiId, kanji.id));
  await db.delete(knowledgeKanjiMeanings).where(eq(knowledgeKanjiMeanings.kanjiId, kanji.id));
  await db.delete(knowledgeKanjiComponents).where(eq(knowledgeKanjiComponents.kanjiId, kanji.id));
  if (value.readings.length > 0) await db.insert(knowledgeKanjiReadings).values(value.readings.map((reading) => ({ ...reading, kanjiId: kanji.id, status: reading.status ?? null })));
  if (value.meanings.length > 0) await db.insert(knowledgeKanjiMeanings).values(value.meanings.map((meaning) => ({ ...meaning, kanjiId: kanji.id })));
  if (value.components.length > 0) await db.insert(knowledgeKanjiComponents).values(value.components.map((component) => ({ ...component, kanjiId: kanji.id })));
}

async function upsertName(datasetId: string, value: Extract<ImportRecord, { kind: "name" }>['value']): Promise<void> {
  await db
    .insert(knowledgeNames)
    .values({
      datasetId,
      externalId: value.externalId,
      kanji: value.kanji ?? null,
      reading: value.reading,
      nameTypes: value.nameTypes,
      translations: value.translations,
      searchText: buildSearchText([value.kanji, value.reading, ...value.translations.map((translation) => translation.text)]),
      sourceHash: sourceHash(value),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [knowledgeNames.datasetId, knowledgeNames.externalId],
      set: {
        kanji: value.kanji ?? null,
        reading: value.reading,
        nameTypes: value.nameTypes,
        translations: value.translations,
        searchText: buildSearchText([value.kanji, value.reading, ...value.translations.map((translation) => translation.text)]),
        sourceHash: sourceHash(value),
        updatedAt: new Date(),
      },
    });
}

async function upsertSentence(datasetId: string, value: Extract<ImportRecord, { kind: "sentence" }>['value']): Promise<void> {
  await db
    .insert(knowledgeSentences)
    .values({
      datasetId,
      externalId: value.externalId,
      language: value.language,
      text: value.text,
      normalizedText: value.text.normalize("NFKC"),
      reading: value.reading ?? null,
      romaji: value.romaji ?? null,
      jlptLevel: value.jlptLevel ?? null,
      difficulty: value.difficulty ?? null,
      audioUrl: value.audioUrl ?? null,
      license: value.license ?? null,
      searchText: buildSearchText([value.text, value.reading, value.romaji]),
      sourceHash: sourceHash(value),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [knowledgeSentences.datasetId, knowledgeSentences.externalId],
      set: {
        language: value.language,
        text: value.text,
        normalizedText: value.text.normalize("NFKC"),
        reading: value.reading ?? null,
        romaji: value.romaji ?? null,
        jlptLevel: value.jlptLevel ?? null,
        difficulty: value.difficulty ?? null,
        audioUrl: value.audioUrl ?? null,
        license: value.license ?? null,
        searchText: buildSearchText([value.text, value.reading, value.romaji]),
        sourceHash: sourceHash(value),
        updatedAt: new Date(),
      },
    });
}

async function upsertSentenceTranslation(datasetId: string, value: Extract<ImportRecord, { kind: "sentence_translation" }>['value']): Promise<boolean> {
  const [sentence] = await db.select().from(knowledgeSentences).where(eq(knowledgeSentences.externalId, value.sentenceExternalId)).limit(1);
  if (!sentence) return false;
  await db
    .insert(knowledgeSentenceTranslations)
    .values({
      sentenceId: sentence.id,
      datasetId,
      externalId: value.externalId ?? null,
      language: value.language,
      text: value.text,
      sourceHash: sourceHash(value),
    })
    .onConflictDoUpdate({
      target: [knowledgeSentenceTranslations.sentenceId, knowledgeSentenceTranslations.language, knowledgeSentenceTranslations.text],
      set: { externalId: value.externalId ?? null, sourceHash: sourceHash(value) },
    });
  return true;
}

async function upsertSentenceToken(value: Extract<ImportRecord, { kind: "sentence_token" }>['value']): Promise<boolean> {
  const [sentence] = await db.select().from(knowledgeSentences).where(eq(knowledgeSentences.externalId, value.sentenceExternalId)).limit(1);
  if (!sentence) return false;
  await db
    .insert(knowledgeSentenceTokens)
    .values({ ...value, sentenceId: sentence.id, lemma: value.lemma ?? null, reading: value.reading ?? null, pronunciation: value.pronunciation ?? null, partOfSpeech: value.partOfSpeech ?? null, inflectionType: value.inflectionType ?? null, inflectionForm: value.inflectionForm ?? null, startOffset: value.startOffset ?? null, endOffset: value.endOffset ?? null })
    .onConflictDoUpdate({
      target: [knowledgeSentenceTokens.sentenceId, knowledgeSentenceTokens.position],
      set: { ...value, lemma: value.lemma ?? null, reading: value.reading ?? null, pronunciation: value.pronunciation ?? null, partOfSpeech: value.partOfSpeech ?? null, inflectionType: value.inflectionType ?? null, inflectionForm: value.inflectionForm ?? null, startOffset: value.startOffset ?? null, endOffset: value.endOffset ?? null },
    });
  return true;
}

async function upsertGrammar(datasetId: string, value: Extract<ImportRecord, { kind: "grammar" }>['value']): Promise<void> {
  const [grammar] = await db
    .insert(knowledgeGrammarPoints)
    .values({
      datasetId,
      externalId: value.externalId,
      pattern: value.pattern,
      title: value.title,
      explanation: value.explanation,
      jlptLevel: value.jlptLevel ?? null,
      formation: value.formation ?? null,
      searchText: buildSearchText([value.pattern, value.title, value.explanation, value.formation]),
      sourceHash: sourceHash(value),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [knowledgeGrammarPoints.datasetId, knowledgeGrammarPoints.externalId],
      set: {
        pattern: value.pattern,
        title: value.title,
        explanation: value.explanation,
        jlptLevel: value.jlptLevel ?? null,
        formation: value.formation ?? null,
        searchText: buildSearchText([value.pattern, value.title, value.explanation, value.formation]),
        sourceHash: sourceHash(value),
        updatedAt: new Date(),
      },
    })
    .returning();
  await db.delete(knowledgeGrammarExamples).where(eq(knowledgeGrammarExamples.grammarPointId, grammar.id));
  if (value.examples.length > 0) await db.insert(knowledgeGrammarExamples).values(value.examples.map((example) => ({ ...example, grammarPointId: grammar.id, sentenceId: null, english: example.english ?? null, explanation: example.explanation ?? null })));
}

async function upsertIdiom(datasetId: string, value: Extract<ImportRecord, { kind: "idiom" }>['value']): Promise<void> {
  await db
    .insert(knowledgeIdioms)
    .values({ datasetId, externalId: value.externalId, expression: value.expression, reading: value.reading ?? null, meaning: value.meaning, register: value.register ?? null, jlptLevel: value.jlptLevel ?? null, searchText: buildSearchText([value.expression, value.reading, value.meaning]), sourceHash: sourceHash(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [knowledgeIdioms.datasetId, knowledgeIdioms.externalId],
      set: { expression: value.expression, reading: value.reading ?? null, meaning: value.meaning, register: value.register ?? null, jlptLevel: value.jlptLevel ?? null, searchText: buildSearchText([value.expression, value.reading, value.meaning]), sourceHash: sourceHash(value), updatedAt: new Date() },
    });
}

async function upsertCollocation(datasetId: string, value: Extract<ImportRecord, { kind: "collocation" }>['value']): Promise<void> {
  await db
    .insert(knowledgeCollocations)
    .values({ datasetId, externalId: value.externalId, headword: value.headword, collocate: value.collocate, relation: value.relation ?? "cooccurrence", frequency: value.frequency ?? null, example: value.example ?? null, searchText: buildSearchText([value.headword, value.collocate, value.example]), sourceHash: sourceHash(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [knowledgeCollocations.datasetId, knowledgeCollocations.externalId],
      set: { headword: value.headword, collocate: value.collocate, relation: value.relation ?? "cooccurrence", frequency: value.frequency ?? null, example: value.example ?? null, searchText: buildSearchText([value.headword, value.collocate, value.example]), sourceHash: sourceHash(value), updatedAt: new Date() },
    });
}

async function upsertKanjiStroke(datasetId: string, value: Extract<ImportRecord, { kind: "kanji_stroke" }>['value']): Promise<boolean> {
  const [kanji] = await db.select().from(knowledgeKanji).where(eq(knowledgeKanji.literal, value.literal)).limit(1);
  if (!kanji) return false;
  await db
    .insert(knowledgeKanjiStrokes)
    .values({ kanjiId: kanji.id, datasetId, strokeNumber: value.strokeNumber, svgPath: value.svgPath, element: value.element ?? null, sourceFile: value.sourceFile, sourceHash: sourceHash(value) })
    .onConflictDoUpdate({
      target: [knowledgeKanjiStrokes.kanjiId, knowledgeKanjiStrokes.datasetId, knowledgeKanjiStrokes.strokeNumber],
      set: { svgPath: value.svgPath, element: value.element ?? null, sourceFile: value.sourceFile, sourceHash: sourceHash(value) },
    });
  return true;
}

async function applyFrequency(value: Extract<ImportRecord, { kind: "frequency" }>['value']): Promise<boolean> {
  const [lexeme] = await db.select().from(knowledgeLexemes).where(eq(knowledgeLexemes.primarySpelling, value.spelling)).limit(1);
  if (!lexeme) return false;
  await db.update(knowledgeLexemes).set({ frequencyRank: value.frequencyRank, jlptLevel: value.jlptLevel ?? lexeme.jlptLevel, updatedAt: new Date() }).where(eq(knowledgeLexemes.id, lexeme.id));
  return true;
}

async function applyFurigana(value: Extract<ImportRecord, { kind: "furigana" }>['value']): Promise<boolean> {
  const [lexeme] = await db.select().from(knowledgeLexemes).where(eq(knowledgeLexemes.externalId, value.lexemeExternalId)).limit(1);
  if (!lexeme) return false;
  const [reading] = await db
    .update(knowledgeLexemeReadings)
    .set({ furigana: value.furigana })
    .where(and(eq(knowledgeLexemeReadings.lexemeId, lexeme.id), eq(knowledgeLexemeReadings.reading, value.reading)))
    .returning({ id: knowledgeLexemeReadings.id });
  return Boolean(reading);
}

async function applyPitch(value: Extract<ImportRecord, { kind: "pitch" }>['value']): Promise<boolean> {
  const [lexeme] = await db.select().from(knowledgeLexemes).where(eq(knowledgeLexemes.externalId, value.lexemeExternalId)).limit(1);
  if (!lexeme) return false;
  const [reading] = await db
    .update(knowledgeLexemeReadings)
    .set({ pitchAccents: value.pitchAccents })
    .where(and(eq(knowledgeLexemeReadings.lexemeId, lexeme.id), eq(knowledgeLexemeReadings.reading, value.reading)))
    .returning({ id: knowledgeLexemeReadings.id });
  return Boolean(reading);
}

async function upsertAudio(datasetId: string, value: Extract<ImportRecord, { kind: "audio" }>['value']): Promise<boolean> {
  const entityId = await resolveEntityId(value.entityType, value.entityExternalId);
  if (!entityId) return false;
  await db
    .insert(knowledgeAudioAssets)
    .values({ datasetId, entityType: value.entityType, entityId, url: value.url, mimeType: value.mimeType ?? null, durationMilliseconds: value.durationMilliseconds ?? null, speaker: value.speaker ?? null, license: value.license, attribution: value.attribution, checksum: value.checksum ?? null })
    .onConflictDoUpdate({
      target: knowledgeAudioAssets.url,
      set: { entityType: value.entityType, entityId, mimeType: value.mimeType ?? null, durationMilliseconds: value.durationMilliseconds ?? null, speaker: value.speaker ?? null, license: value.license, attribution: value.attribution, checksum: value.checksum ?? null },
    });
  return true;
}

async function resolveEntityId(entityType: string, externalId: string): Promise<string | null> {
  if (entityType === "lexeme") {
    const [record] = await db.select({ id: knowledgeLexemes.id }).from(knowledgeLexemes).where(eq(knowledgeLexemes.externalId, externalId)).limit(1);
    return record?.id ?? null;
  }
  if (entityType === "sentence") {
    const [record] = await db.select({ id: knowledgeSentences.id }).from(knowledgeSentences).where(eq(knowledgeSentences.externalId, externalId)).limit(1);
    return record?.id ?? null;
  }
  if (entityType === "kanji") {
    const [record] = await db.select({ id: knowledgeKanji.id }).from(knowledgeKanji).where(eq(knowledgeKanji.literal, externalId)).limit(1);
    return record?.id ?? null;
  }
  if (entityType === "grammar") {
    const [record] = await db.select({ id: knowledgeGrammarPoints.id }).from(knowledgeGrammarPoints).where(eq(knowledgeGrammarPoints.externalId, externalId)).limit(1);
    return record?.id ?? null;
  }
  return null;
}
