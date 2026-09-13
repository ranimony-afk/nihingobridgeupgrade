/**
 * Canonical persistence boundary for dictionary knowledge.
 *
 * This is the only Dictionary* module that imports Drizzle/database tables.
 * Services receive records from here; HTTP/UI code must not query the DB.
 */

import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { DictionaryV2SearchQuery } from "@/types/dictionary-v2";
import {
  dictionaryEntries,
  dictionaryKanji,
  dictionaryReadings,
  dictionarySenses,
  etlImportRuns,
  kanjiCharacters,
  kanjiMeanings,
  kanjiReadings,
  knowledgeEnrichments,
  sentenceLinks,
  sentences,
} from "@/db/schema";

export type DictionarySearchRecord = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  frequencyRank: number | null;
  jlptLevel: string | null;
};

export type DictionaryV2SearchRecord = DictionarySearchRecord & {
  matchRank: number;
  matchesHeadword: boolean;
  matchesReading: boolean;
  matchesEnglish: boolean;
};

export type DictionaryEntryRecord = DictionarySearchRecord & {
  source: string;
  sourceId: string;
  importRunId: number | null;
};

export type DictionaryFormRecord = {
  text: string;
  common: boolean;
  priorityTags: unknown;
  infoTags: unknown;
  position: number;
};

export type DictionarySenseRecord = {
  glosses: unknown;
  partsOfSpeech: unknown;
  fields: unknown;
  misc: unknown;
  dialects: unknown;
  info: string;
  position: number;
};

export type DictionaryEnrichmentRecord = {
  kind: string;
  variantKey: string;
  value: unknown;
  derivationMethod: string;
  derivationVersion: string;
  sourceRecordKey: string;
  source: string;
  sourceStatus: string;
  sourceIsFixture: boolean;
};

export type DictionaryImportRunRecord = {
  sourceUrl: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  isFixture: boolean;
  status: string;
};

export type DictionaryExampleRecord = {
  id: number;
  text: string;
  translation: string | null;
  translationLang: string | null;
  attribution: string;
  license: string;
};

export type DictionaryKanjiComponentRecord = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  jlptOld: number | null;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
};

export type DictionaryRelatedRecord = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  reason: "shares_kanji" | "same_reading";
};

/** Database implementation of the repository contract. */
export class DictionaryRepository {
  /**
   * Finds by literal query (not SQL LIKE wildcard semantics).
   * Results are ranked: exact headword, exact reading, headword substring,
   * reading substring, then commonness/frequency/id as deterministic ties.
   */
  async search(normalizedQuery: string, limit: number): Promise<DictionarySearchRecord[]> {
    const lowered = normalizedQuery.toLocaleLowerCase("ja-JP");
    const headwordContains = sql<boolean>`position(lower(${lowered}) in lower(${dictionaryEntries.headword})) > 0`;
    const readingContains = sql<boolean>`position(lower(${lowered}) in lower(${dictionaryEntries.primaryReading})) > 0`;
    const rank = sql<number>`
      case
        when lower(${dictionaryEntries.headword}) = lower(${lowered}) then 0
        when lower(${dictionaryEntries.primaryReading}) = lower(${lowered}) then 1
        when ${headwordContains} then 2
        when ${readingContains} then 3
        else 4
      end
    `;

    return db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
        jlptLevel: dictionaryEntries.jlptLevel,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          or(headwordContains, readingContains),
        ),
      )
      .orderBy(rank, sql`${dictionaryEntries.isCommon} desc`, asc(dictionaryEntries.frequencyRank), asc(dictionaryEntries.id))
      .limit(limit);
  }

  /**
   * v2 search across Japanese headwords, kana readings, romaji-derived kana,
   * and English glosses. `jlpt` filters source-curated levels only from a
   * successful visible enrichment provenance run.
   */
  async searchV2(
    query: DictionaryV2SearchQuery,
    allowFixtureData: boolean,
  ): Promise<DictionaryV2SearchRecord[]> {
    const terms = query.searchTerms.map((term) => term.toLocaleLowerCase("ja-JP"));
    const falsePredicate = sql<boolean>`false`;
    const any = (clauses: SQL<boolean>[]) =>
      clauses.length > 0 ? (or(...clauses) as SQL<boolean>) : falsePredicate;

    const headExact = any(
      terms.map(
        (term) => sql<boolean>`lower(${dictionaryEntries.headword}) = lower(${term})`,
      ),
    );
    const readingExact = any(
      terms.map(
        (term) => sql<boolean>`lower(${dictionaryEntries.primaryReading}) = lower(${term})`,
      ),
    );
    const englishExact = any(
      terms.map(
        (term) => sql<boolean>`exists (
          select 1
          from "dictionary_senses" as ds
          cross join lateral jsonb_array_elements_text(ds."glosses") as gloss(value)
          where ds."entry_id" = ${dictionaryEntries.id}
            and lower(gloss.value) = lower(${term})
        )`,
      ),
    );
    const headContains = any(
      terms.map(
        (term) =>
          sql<boolean>`position(lower(${term}) in lower(${dictionaryEntries.headword})) > 0`,
      ),
    );
    const readingContains = any(
      terms.map(
        (term) =>
          sql<boolean>`position(lower(${term}) in lower(${dictionaryEntries.primaryReading})) > 0`,
      ),
    );
    const englishContains = any(
      terms.map(
        (term) => sql<boolean>`exists (
          select 1
          from "dictionary_senses" as ds
          cross join lateral jsonb_array_elements_text(ds."glosses") as gloss(value)
          where ds."entry_id" = ${dictionaryEntries.id}
            and position(lower(${term}) in lower(gloss.value)) > 0
        )`,
      ),
    );

    const queryPredicate = terms.length
      ? (or(headContains, readingContains, englishContains) as SQL<boolean>)
      : undefined;

    const fixturePredicate = allowFixtureData
      ? sql<boolean>`true`
      : sql<boolean>`er."is_fixture" = false`;
    const jlptDerivedMatch = query.jlptLevel
      ? sql<boolean>`exists (
          select 1
          from "knowledge_enrichments" as ke
          inner join "etl_import_runs" as er on er."id" = ke."source_import_run_id"
          where ke."subject_type" = 'dictionary_entry'
            and ke."subject_id" = ${dictionaryEntries.id}
            and ke."kind" = 'jlpt'
            and (ke."value" ->> 'level') = ${query.jlptLevel}
            and er."status" = 'success'
            and ${fixturePredicate}
        )`
      : falsePredicate;
    const jlptPredicate = query.jlptLevel
      ? (or(eq(dictionaryEntries.jlptLevel, query.jlptLevel), jlptDerivedMatch) as SQL<boolean>)
      : undefined;

    const rank = terms.length
      ? sql<number>`
          case
            when ${headExact} then 0
            when ${readingExact} then 1
            when ${englishExact} then 2
            when ${headContains} then 3
            when ${readingContains} then 4
            when ${englishContains} then 5
            else 6
          end
        `
      : sql<number>`0`;

    return db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
        jlptLevel: dictionaryEntries.jlptLevel,
        matchRank: rank.as("match_rank"),
        matchesHeadword: headContains,
        matchesReading: readingContains,
        matchesEnglish: englishContains,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          queryPredicate,
          jlptPredicate,
        ),
      )
      .orderBy(
        sql.raw('"match_rank" asc'),
        sql`${dictionaryEntries.isCommon} desc`,
        asc(dictionaryEntries.frequencyRank),
        asc(dictionaryEntries.id),
      )
      .limit(query.limit);
  }

  /** Retrieve source-curated JLPT labels that are permitted in this runtime. */
  async findJlptLevels(
    entryIds: number[],
    allowFixtureData: boolean,
  ): Promise<Map<number, string[]>> {
    if (entryIds.length === 0) return new Map();
    const fixturePredicate = allowFixtureData
      ? sql<boolean>`true`
      : eq(etlImportRuns.isFixture, false);
    const rows = await db
      .select({
        entryId: knowledgeEnrichments.subjectId,
        level: sql<string>`(${knowledgeEnrichments.value} ->> 'level')`,
      })
      .from(knowledgeEnrichments)
      .innerJoin(
        etlImportRuns,
        eq(knowledgeEnrichments.sourceImportRunId, etlImportRuns.id),
      )
      .where(
        and(
          eq(knowledgeEnrichments.subjectType, "dictionary_entry"),
          eq(knowledgeEnrichments.kind, "jlpt"),
          inArray(knowledgeEnrichments.subjectId, entryIds),
          eq(etlImportRuns.status, "success"),
          fixturePredicate,
        ),
      )
      .orderBy(asc(knowledgeEnrichments.subjectId), asc(sql`(${knowledgeEnrichments.value} ->> 'level')`));

    const levels = new Map<number, string[]>();
    for (const row of rows) {
      if (!/^N[1-5]$/.test(row.level)) continue;
      const current = levels.get(row.entryId) ?? [];
      if (!current.includes(row.level)) current.push(row.level);
      levels.set(row.entryId, current);
    }
    return levels;
  }

  async findById(id: number): Promise<DictionaryEntryRecord | null> {
    const [entry] = await db
      .select({
        id: dictionaryEntries.id,
        source: dictionaryEntries.source,
        sourceId: dictionaryEntries.sourceId,
        importRunId: dictionaryEntries.importRunId,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
        jlptLevel: dictionaryEntries.jlptLevel,
      })
      .from(dictionaryEntries)
      .where(and(eq(dictionaryEntries.id, id), eq(dictionaryEntries.source, "jmdict")))
      .limit(1);
    return entry ?? null;
  }

  async findFirstGlosses(entryIds: number[]): Promise<Map<number, string>> {
    if (entryIds.length === 0) return new Map();
    const rows = await db
      .select({ entryId: dictionarySenses.entryId, glosses: dictionarySenses.glosses })
      .from(dictionarySenses)
      .where(inArray(dictionarySenses.entryId, entryIds))
      .orderBy(asc(dictionarySenses.entryId), asc(dictionarySenses.position));

    const glosses = new Map<number, string>();
    for (const row of rows) {
      if (glosses.has(row.entryId) || !Array.isArray(row.glosses)) continue;
      const first = row.glosses.find((value): value is string => typeof value === "string");
      if (first) glosses.set(row.entryId, first);
    }
    return glosses;
  }

  async findKanjiForms(entryId: number): Promise<DictionaryFormRecord[]> {
    return db
      .select({
        text: dictionaryKanji.text,
        common: dictionaryKanji.common,
        priorityTags: dictionaryKanji.priorityTags,
        infoTags: dictionaryKanji.infoTags,
        position: dictionaryKanji.position,
      })
      .from(dictionaryKanji)
      .where(eq(dictionaryKanji.entryId, entryId))
      .orderBy(asc(dictionaryKanji.position));
  }

  async findReadings(entryId: number): Promise<DictionaryFormRecord[]> {
    return db
      .select({
        text: dictionaryReadings.text,
        common: dictionaryReadings.common,
        priorityTags: dictionaryReadings.priorityTags,
        infoTags: dictionaryReadings.infoTags,
        position: dictionaryReadings.position,
      })
      .from(dictionaryReadings)
      .where(eq(dictionaryReadings.entryId, entryId))
      .orderBy(asc(dictionaryReadings.position));
  }

  async findSenses(entryId: number): Promise<DictionarySenseRecord[]> {
    return db
      .select({
        glosses: dictionarySenses.glosses,
        partsOfSpeech: dictionarySenses.partsOfSpeech,
        fields: dictionarySenses.fields,
        misc: dictionarySenses.misc,
        dialects: dictionarySenses.dialects,
        info: dictionarySenses.info,
        position: dictionarySenses.position,
      })
      .from(dictionarySenses)
      .where(eq(dictionarySenses.entryId, entryId))
      .orderBy(asc(dictionarySenses.position));
  }

  /**
   * Only completed enrichment source runs are visible. Fixture-derived values
   * are visible exclusively in non-production contexts for development/test.
   */
  async findEnrichments(
    entryId: number,
    allowFixtureData: boolean,
  ): Promise<DictionaryEnrichmentRecord[]> {
    const fixtureCondition = allowFixtureData
      ? undefined
      : eq(etlImportRuns.isFixture, false);

    return db
      .select({
        kind: knowledgeEnrichments.kind,
        variantKey: knowledgeEnrichments.variantKey,
        value: knowledgeEnrichments.value,
        derivationMethod: knowledgeEnrichments.derivationMethod,
        derivationVersion: knowledgeEnrichments.derivationVersion,
        sourceRecordKey: knowledgeEnrichments.sourceRecordKey,
        source: etlImportRuns.source,
        sourceStatus: etlImportRuns.status,
        sourceIsFixture: etlImportRuns.isFixture,
      })
      .from(knowledgeEnrichments)
      .innerJoin(
        etlImportRuns,
        eq(knowledgeEnrichments.sourceImportRunId, etlImportRuns.id),
      )
      .where(
        and(
          eq(knowledgeEnrichments.subjectType, "dictionary_entry"),
          eq(knowledgeEnrichments.subjectId, entryId),
          eq(etlImportRuns.status, "success"),
          fixtureCondition,
        ),
      )
      .orderBy(asc(knowledgeEnrichments.kind), asc(knowledgeEnrichments.variantKey));
  }

  /**
   * Japanese example sentences that contain any surface form of the entry,
   * each paired with its first English translation. Every row carries its
   * per-sentence CC BY attribution — a licence obligation, not decoration.
   */
  async findExamples(surfaceForms: string[], limit: number): Promise<DictionaryExampleRecord[]> {
    const forms = surfaceForms.map((form) => form.trim()).filter((form) => form.length > 0);
    if (forms.length === 0) return [];

    const containsAny = or(
      ...forms.map((form) => sql<boolean>`position(${form} in ${sentences.text}) > 0`),
    ) as SQL<boolean>;

    const rows = await db
      .select({
        id: sentences.id,
        text: sentences.text,
        attribution: sentences.attribution,
        license: sentences.license,
        charLength: sentences.charLength,
      })
      .from(sentences)
      .where(and(eq(sentences.lang, "jpn"), containsAny))
      .orderBy(asc(sentences.charLength), asc(sentences.id))
      .limit(limit);

    if (rows.length === 0) return [];

    const translationRows = await db
      .select({
        sentenceId: sentenceLinks.sentenceId,
        text: sentences.text,
        lang: sentences.lang,
      })
      .from(sentenceLinks)
      .innerJoin(sentences, eq(sentences.id, sentenceLinks.translationId))
      .where(
        and(
          inArray(
            sentenceLinks.sentenceId,
            rows.map((row) => row.id),
          ),
          eq(sentences.lang, "eng"),
        ),
      )
      .orderBy(asc(sentenceLinks.sentenceId), asc(sentences.id));

    const translations = new Map<number, { text: string; lang: string }>();
    for (const row of translationRows) {
      if (!translations.has(row.sentenceId)) {
        translations.set(row.sentenceId, { text: row.text, lang: row.lang });
      }
    }

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      translation: translations.get(row.id)?.text ?? null,
      translationLang: translations.get(row.id)?.lang ?? null,
      attribution: row.attribution,
      license: row.license,
    }));
  }

  /** Kanji character records for each distinct ideograph in the headword. */
  async findKanjiComponents(literals: string[]): Promise<DictionaryKanjiComponentRecord[]> {
    const unique = [...new Set(literals)];
    if (unique.length === 0) return [];

    const characters = await db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        jlptOld: kanjiCharacters.jlptOld,
      })
      .from(kanjiCharacters)
      .where(and(eq(kanjiCharacters.source, "kanjidic2"), inArray(kanjiCharacters.literal, unique)));

    if (characters.length === 0) return [];
    const ids = characters.map((character) => character.id);

    const [meaningRows, readingRows] = await Promise.all([
      db
        .select({ kanjiId: kanjiMeanings.kanjiId, value: kanjiMeanings.value })
        .from(kanjiMeanings)
        .where(and(inArray(kanjiMeanings.kanjiId, ids), eq(kanjiMeanings.language, "en")))
        .orderBy(asc(kanjiMeanings.kanjiId), asc(kanjiMeanings.position)),
      db
        .select({ kanjiId: kanjiReadings.kanjiId, type: kanjiReadings.type, value: kanjiReadings.value })
        .from(kanjiReadings)
        .where(and(inArray(kanjiReadings.kanjiId, ids), inArray(kanjiReadings.type, ["ja_on", "ja_kun"])))
        .orderBy(asc(kanjiReadings.kanjiId), asc(kanjiReadings.position)),
    ]);

    const meanings = new Map<number, string[]>();
    for (const row of meaningRows) {
      meanings.set(row.kanjiId, [...(meanings.get(row.kanjiId) ?? []), row.value]);
    }
    const on = new Map<number, string[]>();
    const kun = new Map<number, string[]>();
    for (const row of readingRows) {
      const target = row.type === "ja_on" ? on : kun;
      target.set(row.kanjiId, [...(target.get(row.kanjiId) ?? []), row.value]);
    }

    // Preserve the order the kanji appear in the headword.
    const byLiteral = new Map(characters.map((character) => [character.literal, character]));
    return unique
      .map((literal) => byLiteral.get(literal))
      .filter((character): character is NonNullable<typeof character> => character !== undefined)
      .map((character) => ({
        id: character.id,
        literal: character.literal,
        strokeCount: character.strokeCount,
        grade: character.grade,
        jlptOld: character.jlptOld,
        meanings: meanings.get(character.id) ?? [],
        onReadings: on.get(character.id) ?? [],
        kunReadings: kun.get(character.id) ?? [],
      }));
  }

  /**
   * Related entries: other words sharing a kanji from this headword, or
   * homophones sharing its primary reading. The entry itself is excluded.
   */
  async findRelated(
    entryId: number,
    kanjiLiterals: string[],
    primaryReading: string,
    limit: number,
  ): Promise<DictionaryRelatedRecord[]> {
    const unique = [...new Set(kanjiLiterals)];
    const clauses: SQL<boolean>[] = [];
    if (unique.length > 0) {
      clauses.push(
        or(...unique.map((literal) => sql<boolean>`position(${literal} in ${dictionaryEntries.headword}) > 0`)) as SQL<boolean>,
      );
    }
    if (primaryReading.trim().length > 0) {
      clauses.push(sql<boolean>`${dictionaryEntries.primaryReading} = ${primaryReading}`);
    }
    if (clauses.length === 0) return [];

    const sharesKanji = unique.length
      ? (or(...unique.map((literal) => sql<boolean>`position(${literal} in ${dictionaryEntries.headword}) > 0`)) as SQL<boolean>)
      : sql<boolean>`false`;

    const rows = await db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        sharesKanji,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          sql`${dictionaryEntries.id} <> ${entryId}`,
          or(...clauses),
        ),
      )
      .orderBy(sql`${dictionaryEntries.isCommon} desc`, asc(dictionaryEntries.frequencyRank), asc(dictionaryEntries.id))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      headword: row.headword,
      primaryReading: row.primaryReading,
      isCommon: row.isCommon,
      reason: row.sharesKanji ? "shares_kanji" : "same_reading",
    }));
  }

  async findImportRun(id: number): Promise<DictionaryImportRunRecord | null> {
    const [run] = await db
      .select({
        sourceUrl: etlImportRuns.sourceUrl,
        license: etlImportRuns.license,
        attribution: etlImportRuns.attribution,
        checksumSha256: etlImportRuns.checksumSha256,
        checksumVerified: etlImportRuns.checksumVerified,
        isFixture: etlImportRuns.isFixture,
        status: etlImportRuns.status,
      })
      .from(etlImportRuns)
      .where(eq(etlImportRuns.id, id))
      .limit(1);
    return run ?? null;
  }
}
