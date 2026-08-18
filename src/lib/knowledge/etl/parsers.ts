import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { parse as parseCsv } from "csv-parse";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import type { Readable } from "node:stream";
import type {
  ImportRecord,
  ImportedCollocation,
  ImportedGrammarPoint,
  ImportedIdiom,
  ImportedKanji,
  ImportedLexeme,
  ImportedName,
} from "@/lib/knowledge/etl/types";
import { childNodes, childTexts, firstChildText, streamXmlElements, type XmlNode } from "@/lib/knowledge/etl/xml";

const EMPTY_XML_NODE: XmlNode = {
  name: "",
  attributes: {},
  text: "",
  children: [],
};

function sourceStream(filePath: string): Readable {
  const source = createReadStream(filePath);
  return filePath.endsWith(".gz") ? source.pipe(createGunzip()) : source;
}

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[|,;]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function numberValue(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function nodeTexts(node: XmlNode, name: string): string[] {
  return childTexts(node, name).map((value) => value.trim()).filter(Boolean);
}

function priorityRank(priorities: string[]): number {
  if (priorities.some((priority) => /(^|:)(news1|ichi1|spec1|gai1)(:|$)/.test(priority))) return 100;
  if (priorities.some((priority) => /1$/.test(priority))) return 50;
  return priorities.length > 0 ? 10 : 0;
}

export async function parseJmdict(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  await streamXmlElements(filePath, "entry", async (entry) => {
    const externalId = firstChildText(entry, "ent_seq");
    if (!externalId) return;

    const spellings = childNodes(entry, "k_ele").flatMap((element, index) => {
      const spelling = firstChildText(element, "keb");
      if (!spelling) return [];
      const priorities = nodeTexts(element, "ke_pri");
      return [{
        spelling,
        priority: priorityRank(priorities),
        isPrimary: index === 0,
        information: nodeTexts(element, "ke_inf"),
      }];
    });

    const readings = childNodes(entry, "r_ele").flatMap((element, index) => {
      const reading = firstChildText(element, "reb");
      if (!reading) return [];
      const priorities = nodeTexts(element, "re_pri");
      return [{
        reading,
        noKanji: childNodes(element, "re_nokanji").length > 0,
        isPrimary: index === 0,
        information: [...nodeTexts(element, "re_inf"), ...priorities],
      }];
    });

    const senses = childNodes(entry, "sense").map((sense, position) => ({
      position,
      partOfSpeech: nodeTexts(sense, "pos"),
      fields: nodeTexts(sense, "field"),
      dialects: nodeTexts(sense, "dial"),
      misc: nodeTexts(sense, "misc"),
      appliesToSpellings: nodeTexts(sense, "stagk"),
      appliesToReadings: nodeTexts(sense, "stagr"),
      glosses: childNodes(sense, "gloss")
        .map((gloss, glossPosition) => {
          const text = clean(gloss.text);
          return text
            ? {
                language: gloss.attributes["xml:lang"] ?? gloss.attributes.lang ?? "eng",
                gloss: text,
                type: gloss.attributes.g_type,
                gender: gloss.attributes.g_gend,
                position: glossPosition,
              }
            : null;
        })
        .filter((gloss): gloss is NonNullable<typeof gloss> => Boolean(gloss)),
    }));

    const primaryGloss = senses.flatMap((sense) => sense.glosses).find((gloss) => gloss.language === "eng")?.gloss;
    const record: ImportedLexeme = {
      externalId,
      spellings,
      readings,
      senses,
      common: spellings.some((form) => form.priority >= 50),
    };

    if (record.spellings.length === 0 && record.readings.length === 0) return;
    if (!primaryGloss && record.senses.length === 0) return;
    await emit({ kind: "lexeme", value: record });
  });
}

export async function parseKanjidic2(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  await streamXmlElements(filePath, "character", async (character) => {
    const literal = firstChildText(character, "literal");
    if (!literal) return;
    const misc = childNodes(character, "misc")[0] ?? EMPTY_XML_NODE;
    const radical = childNodes(character, "radical")[0] ?? EMPTY_XML_NODE;
    const readingMeaning = childNodes(character, "reading_meaning")[0] ?? EMPTY_XML_NODE;
    const rmgroup = childNodes(readingMeaning, "rmgroup")[0];

    const readings = rmgroup
      ? childNodes(rmgroup, "reading").flatMap((reading) => {
          const value = clean(reading.text);
          const kind = reading.attributes.r_type;
          return value && kind ? [{ reading: value, kind, status: reading.attributes.r_status }] : [];
        })
      : [];
    const meanings = rmgroup
      ? childNodes(rmgroup, "meaning").flatMap((meaning, position) => {
          const value = clean(meaning.text);
          return value ? [{ language: meaning.attributes.m_lang ?? "en", meaning: value, position }] : [];
        })
      : [];
    const components = radical
      ? childNodes(radical, "rad_value").flatMap((value, position) => {
          const componentLiteral = clean(value.text);
          return componentLiteral
            ? [{ componentLiteral, componentType: value.attributes.rad_type ?? "radical", position }]
            : [];
        })
      : [];

    const record: ImportedKanji = {
      externalId: literal.codePointAt(0)?.toString(16).toUpperCase() ?? literal,
      literal,
      radical: components.find((component) => component.componentType === "classical")?.componentLiteral,
       grade: numberValue(firstChildText(misc, "grade")),
       strokeCount: numberValue(firstChildText(misc, "stroke_count")),
       frequencyRank: numberValue(firstChildText(misc, "freq")),
       jlptLevel: clean(firstChildText(misc, "jlpt")) ? `N${firstChildText(misc, "jlpt")}` : undefined,
       joyo: Boolean(firstChildText(misc, "grade")),
      readings,
      meanings,
      components,
    };
    await emit({ kind: "kanji", value: record });
  });
}

export async function parseJmnedict(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  await streamXmlElements(filePath, "entry", async (entry) => {
    const externalId = firstChildText(entry, "ent_seq");
    if (!externalId) return;
    const kanji = firstChildText(childNodes(entry, "k_ele")[0] ?? EMPTY_XML_NODE, "keb") ?? undefined;
    const reading = firstChildText(childNodes(entry, "r_ele")[0] ?? EMPTY_XML_NODE, "reb");
    if (!reading) return;

    const translations = childNodes(entry, "trans").flatMap((translation) =>
      childNodes(translation, "trans_det").flatMap((detail) => {
        const text = clean(detail.text);
        return text ? [{ language: detail.attributes["xml:lang"] ?? detail.attributes.lang ?? "eng", text }] : [];
      }),
    );
    const nameTypes = childNodes(entry, "trans").flatMap((translation) => nodeTexts(translation, "name_type"));
    const record: ImportedName = { externalId, kanji, reading, nameTypes, translations };
    await emit({ kind: "name", value: record });
  });
}

export async function parseTatoebaSentences(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  const reader = createInterface({ input: sourceStream(filePath), crlfDelay: Infinity });
  for await (const line of reader) {
    const [externalId, language, ...textParts] = line.split("\t");
    const text = textParts.join("\t").trim();
    if (!externalId || !language || !text) continue;
    await emit({ kind: "sentence", value: { externalId, language, text } });
  }
}

export async function parseFrequencyTsv(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  const reader = createInterface({ input: sourceStream(filePath), crlfDelay: Infinity });
  for await (const line of reader) {
    const [spelling, rank, jlptLevel] = line.split("\t");
    const frequencyRank = numberValue(rank);
    if (!spelling?.trim() || !frequencyRank) continue;
    await emit({ kind: "frequency", value: { spelling: spelling.trim(), frequencyRank, jlptLevel: clean(jlptLevel) } });
  }
}

export async function parseUnidicCsv(filePath: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  const records = sourceStream(filePath).pipe(
    parseCsv({ columns: true, bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }),
  );
  for await (const row of records as AsyncIterable<Record<string, string>>) {
    const sentenceExternalId = row.sentence_id ?? row.sentenceId ?? row.sid;
    const surface = row.surface ?? row.form;
    const position = numberValue(row.position ?? row.token_index ?? row.index);
    if (!sentenceExternalId || !surface || position === undefined) continue;
    await emit({
      kind: "sentence_token",
      value: {
        sentenceExternalId,
        position,
        surface,
        lemma: clean(row.lemma ?? row.lemma_form),
        reading: clean(row.reading),
        pronunciation: clean(row.pronunciation),
        partOfSpeech: clean(row.pos ?? row.part_of_speech),
        inflectionType: clean(row.inflection_type),
        inflectionForm: clean(row.inflection_form),
        startOffset: numberValue(row.start_offset),
        endOffset: numberValue(row.end_offset),
        features: Object.fromEntries(Object.entries(row).filter(([, value]) => Boolean(value))),
      },
    });
  }
}

async function forEachJsonRecord(filePath: string, onValue: (value: Record<string, unknown>) => Promise<void>): Promise<void> {
  if (filePath.endsWith(".json") || filePath.endsWith(".json.gz")) {
    const jsonParser = parser();
    const arrayStreamer = streamArray();
    const nodeSource = sourceStream(filePath) as unknown as {
      pipe: (destination: unknown) => { pipe: (nextDestination: unknown) => unknown };
    };
    nodeSource.pipe(jsonParser).pipe(arrayStreamer);
    for await (const chunk of arrayStreamer as unknown as AsyncIterable<{ value: Record<string, unknown> }>) {
      await onValue(chunk.value);
    }
    return;
  }

  const reader = createInterface({ input: sourceStream(filePath), crlfDelay: Infinity });
  for await (const line of reader) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const value = JSON.parse(trimmed) as Record<string, unknown>;
    await onValue(value);
  }
}

function jsonGlosses(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, position) => {
    if (typeof item === "string") return [{ language: "eng", gloss: item, position }];
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const gloss = clean(String(row.gloss ?? row.text ?? ""));
    return gloss ? [{ language: String(row.language ?? "eng"), gloss, type: clean(String(row.type ?? "")), position }] : [];
  });
}

export async function parseJsonKnowledgeDataset(
  key: string,
  filePath: string,
  emit: (record: ImportRecord) => Promise<void>,
): Promise<void> {
  await forEachJsonRecord(filePath, async (row) => {
    const externalId = clean(String(row.id ?? row.externalId ?? row.ent_seq ?? ""));

    if (key === "jmdict_furigana") {
      const lexemeExternalId = clean(String(row.id ?? row.ent_seq ?? row.lexemeId ?? ""));
      const reading = clean(String(row.reading ?? row.kana ?? ""));
      const furigana = Array.isArray(row.furigana)
        ? row.furigana.flatMap((piece) => {
            if (!piece || typeof piece !== "object") return [];
            const part = piece as Record<string, unknown>;
            const ruby = clean(String(part.ruby ?? part.kanji ?? ""));
            const rt = clean(String(part.rt ?? part.reading ?? ""));
            return ruby && rt ? [{ ruby, rt }] : [];
          })
        : [];
      if (lexemeExternalId && reading && furigana.length > 0) {
        await emit({ kind: "furigana", value: { lexemeExternalId, reading, furigana } });
      }
      return;
    }

    if (key === "pitch_accent") {
      const lexemeExternalId = clean(String(row.lexemeId ?? row.id ?? row.ent_seq ?? ""));
      const reading = clean(String(row.reading ?? row.kana ?? ""));
      const rawPatterns = Array.isArray(row.pitchAccents ?? row.pitch_accent) ? (row.pitchAccents ?? row.pitch_accent) as unknown[] : [];
      const pitchAccents = rawPatterns.flatMap((item) => {
        if (typeof item === "number") return [{ pattern: item, morae: [], source: "pitch_accent" }];
        if (!item || typeof item !== "object") return [];
        const accent = item as Record<string, unknown>;
        const pattern = numberValue(accent.pattern ?? accent.drop ?? accent.position);
        return pattern === undefined ? [] : [{ pattern, morae: stringArray(accent.morae), source: clean(String(accent.source ?? "pitch_accent")) }];
      });
      if (lexemeExternalId && reading && pitchAccents.length > 0) {
        await emit({ kind: "pitch", value: { lexemeExternalId, reading, pitchAccents } });
      }
      return;
    }

    if (key === "grammar") {
      const grammar: ImportedGrammarPoint = {
        externalId: externalId ?? crypto.randomUUID(),
        pattern: String(row.pattern ?? row.grammar ?? "").trim(),
        title: String(row.title ?? row.pattern ?? "").trim(),
        explanation: String(row.explanation ?? row.meaning ?? "").trim(),
        jlptLevel: clean(String(row.jlptLevel ?? row.jlpt ?? "")),
        formation: clean(String(row.formation ?? "")),
        examples: Array.isArray(row.examples)
          ? row.examples.flatMap((example, position) => {
              if (!example || typeof example !== "object") return [];
              const item = example as Record<string, unknown>;
              const japanese = clean(String(item.japanese ?? item.jp ?? ""));
              return japanese ? [{ japanese, english: clean(String(item.english ?? item.en ?? "")), explanation: clean(String(item.explanation ?? "")), position }] : [];
            })
          : [],
      };
      if (grammar.pattern && grammar.explanation) await emit({ kind: "grammar", value: grammar });
      return;
    }

    if (key === "idioms") {
      const idiom: ImportedIdiom = {
        externalId: externalId ?? crypto.randomUUID(),
        expression: String(row.expression ?? row.idiom ?? "").trim(),
        reading: clean(String(row.reading ?? "")),
        meaning: String(row.meaning ?? row.definition ?? "").trim(),
        register: clean(String(row.register ?? "")),
        jlptLevel: clean(String(row.jlptLevel ?? row.jlpt ?? "")),
      };
      if (idiom.expression && idiom.meaning) await emit({ kind: "idiom", value: idiom });
      return;
    }

    if (key === "collocations") {
      const collocation: ImportedCollocation = {
        externalId: externalId ?? crypto.randomUUID(),
        headword: String(row.headword ?? row.base ?? "").trim(),
        collocate: String(row.collocate ?? row.word ?? "").trim(),
        relation: clean(String(row.relation ?? "")),
        frequency: numberValue(row.frequency),
        example: clean(String(row.example ?? "")),
      };
      if (collocation.headword && collocation.collocate) await emit({ kind: "collocation", value: collocation });
      return;
    }

    if (key === "open_audio") {
      const entityExternalId = clean(String(row.entityExternalId ?? row.entityId ?? ""));
      const url = clean(String(row.url ?? ""));
      if (externalId && entityExternalId && url && row.license && row.attribution) {
        await emit({
          kind: "audio",
          value: {
            externalId,
            entityType: String(row.entityType ?? "sentence"),
            entityExternalId,
            url,
            mimeType: clean(String(row.mimeType ?? "")),
            durationMilliseconds: numberValue(row.durationMilliseconds),
            speaker: clean(String(row.speaker ?? "")),
            license: String(row.license),
            attribution: String(row.attribution),
            checksum: clean(String(row.checksum ?? "")),
          },
        });
      }
      return;
    }

    if (key === "jlpt_vocabulary") {
      const spelling = clean(String(row.spelling ?? row.kanji ?? row.word ?? ""));
      const reading = clean(String(row.reading ?? row.kana ?? ""));
      const glosses = jsonGlosses(row.glosses ?? row.meanings ?? row.meaning ? (row.glosses ?? row.meanings ?? [row.meaning]) : []);
      if (externalId && (spelling || reading) && glosses.length > 0) {
        await emit({
          kind: "lexeme",
          value: {
            externalId,
            spellings: spelling ? [{ spelling, priority: 0, isPrimary: true, information: [] }] : [],
            readings: reading ? [{ reading, noKanji: !spelling, isPrimary: true, information: [] }] : [],
            senses: [{ position: 0, partOfSpeech: stringArray(row.partOfSpeech), fields: [], dialects: [], misc: [], appliesToSpellings: [], appliesToReadings: [], glosses }],
            jlptLevel: clean(String(row.jlptLevel ?? row.jlpt ?? "")),
            frequencyRank: numberValue(row.frequencyRank ?? row.frequency),
          },
        });
      }
    }
  });
}

async function walkSvgFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [] as string[];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkSvgFiles(path)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".svg") files.push(path);
  }
  return files;
}

export async function parseKanjiVgDirectory(directory: string, emit: (record: ImportRecord) => Promise<void>): Promise<void> {
  for (const filePath of await walkSvgFiles(directory)) {
    const filename = basename(filePath, ".svg");
    const codepoint = Number.parseInt(filename.replace(/^0+/, "") || "0", 16);
    if (!Number.isFinite(codepoint) || codepoint <= 0) continue;
    const literal = String.fromCodePoint(codepoint);
    const source = await readFile(filePath, "utf8");
    const pathMatches = [...source.matchAll(/<path[^>]*?(?:id="[^"]*?s(\d+)"[^>]*?)?d="([^"]+)"[^>]*>/g)];
    let strokeNumber = 0;
    for (const match of pathMatches) {
      strokeNumber = Number(match[1] ?? strokeNumber + 1);
      const svgPath = match[2];
      if (!svgPath) continue;
      await emit({
        kind: "kanji_stroke",
        value: {
          literal,
          strokeNumber,
          svgPath,
          sourceFile: filePath,
        },
      });
    }
  }
}
