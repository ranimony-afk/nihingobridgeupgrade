/**
 * Canonical persistence boundary for kanji knowledge.
 *
 * The only Kanji* module that imports Drizzle/database tables. Services map
 * these records into stable API contracts; HTTP/UI code never queries the DB.
 */

import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionarySenses,
  etlImportRuns,
  kanjiCharacters,
  kanjiMeanings,
  kanjiReadings,
  knowledgeEnrichments,
} from "@/db/schema";
import type { JlptLevel } from "@/types/dictionary-v2";
import type { KanjiSearchQuery } from "@/types/kanji-v2";

export type KanjiSearchRecord = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
  radicalClassical: number | null;
  matchesLiteral: boolean;
  matchesMeaning: boolean;
  matchesReading: boolean;
};

export type KanjiDetailRecord = {
  id: number;
  source: string;
  literal: string;
  importRunId: number | null;
  codepointUcs: string;
  strokeCount: number | null;
  strokeMiscounts: unknown;
  radicalClassical: number | null;
  radicalNelson: number | null;
  grade: number | null;
  frequencyRank: number | null;
  jlptOld: number | null;
  nanori: unknown;
  variants: unknown;
};

export type KanjiReadingRecord = {
  kanjiId: number;
  type: string;
  value: string;
};

export type KanjiMeaningRecord = {
  kanjiId: number;
  language: string;
  value: string;
};

export type KanjiImportRunRecord = {
  sourceUrl: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  isFixture: boolean;
  status: string;
};

const KANJI_SOURCE = "kanjidic2";

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
}

function objectArray(value: unknown): { type: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.type === "string" && typeof record.value === "string"
      ? [{ type: record.type, value: record.value }]
      : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Database implementation of the kanji repository contract. */
export class KanjiRepository {
  /**
   * Build the shared filter predicate so count and page queries cannot drift.
   */
  private buildFilters(
    query: KanjiSearchQuery,
    allowFixtureData: boolean,
  ): { predicate: SQL | undefined; literalMatch: SQL<boolean>; meaningMatch: SQL<boolean>; readingMatch: SQL<boolean> } {
    const terms = [query.normalizedQuery, query.romajiKana]
      .filter((term): term is string => term !== null)
      .map((term) => term.toLocaleLowerCase("ja-JP"));

    const any = (clauses: SQL<boolean>[]) =>
      clauses.length > 0 ? (or(...clauses) as SQL<boolean>) : sql<boolean>`false`;

    const literalMatch = any(
      terms.map(
        (term) => sql<boolean>`lower(${kanjiCharacters.literal}) = lower(${term})`,
      ),
    );

    // NOTE: correlation must be written as a fully-qualified raw reference.
    // Drizzle renders `${kanjiCharacters.id}` QUALIFIED inside WHERE but
    // UNQUALIFIED ("id") inside the SELECT list, where the inner table's own
    // "id" column would shadow it and silently compare the wrong column.
    const meaningMatch = terms.length
      ? sql<boolean>`exists (
          select 1
          from "kanji_meanings" km
          where km."kanji_id" = "kanji_characters"."id"
            and km."language" = 'en'
            and (
              ${any(
                terms.map(
                  (term) => sql<boolean>`position(lower(${term}) in lower(km."value")) > 0`,
                ),
              )}
            )
        )`
      : sql<boolean>`false`;

    const readingMatch = terms.length
      ? sql<boolean>`exists (
          select 1
          from "kanji_readings" kr
          where kr."kanji_id" = "kanji_characters"."id"
            and kr."type" in ('ja_on', 'ja_kun')
            and (
              ${any(
                terms.map(
                  (term) => sql<boolean>`position(lower(${term}) in lower(kr."value")) > 0`,
                ),
              )}
            )
        )`
      : sql<boolean>`false`;

    const clauses: (SQL | undefined)[] = [
      eq(kanjiCharacters.source, KANJI_SOURCE),
      terms.length ? (or(literalMatch, meaningMatch, readingMatch) as SQL<boolean>) : undefined,
      query.strokes !== null ? eq(kanjiCharacters.strokeCount, query.strokes) : undefined,
      query.grade !== null ? eq(kanjiCharacters.grade, query.grade) : undefined,
      query.radical !== null
        ? eq(kanjiCharacters.radicalClassical, query.radical)
        : undefined,
    ];

    const fixturePredicate = allowFixtureData
      ? sql<boolean>`true`
      : sql<boolean>`er."is_fixture" = false`;

    if (query.jlpt) {
      clauses.push(
        sql<boolean>`exists (
          select 1
          from "knowledge_enrichments" ke
          inner join "etl_import_runs" er on er."id" = ke."source_import_run_id"
          where ke."subject_type" = 'kanji_character'
            and ke."subject_id" = "kanji_characters"."id"
            and ke."kind" = 'jlpt'
            and (ke."value" ->> 'level') = ${query.jlpt}
            and er."status" = 'success'
            and ${fixturePredicate}
        )`,
      );
    }

    // Component filters read the first-class kanji_components relationship
    // table (Phase 06.3) rather than scanning JSON enrichment blobs: it is
    // indexed, and it supports AND semantics across multiple components.
    if (query.component) {
      clauses.push(
        sql<boolean>`exists (
          select 1 from "kanji_components" kc
          where kc."kanji_id" = "kanji_characters"."id"
            and kc."component" = ${query.component}
        )`,
      );
    }

    if (query.components.length > 0) {
      // Require ALL supplied components — the classic multi-radical lookup.
      clauses.push(
        sql<boolean>`(
          select count(distinct kc."component")
          from "kanji_components" kc
          where kc."kanji_id" = "kanji_characters"."id"
            and kc."component" in ${query.components}
        ) = ${query.components.length}`,
      );
    }

    return { predicate: and(...clauses), literalMatch, meaningMatch, readingMatch };
  }

  async count(query: KanjiSearchQuery, allowFixtureData: boolean): Promise<number> {
    const { predicate } = this.buildFilters(query, allowFixtureData);
    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(kanjiCharacters)
      .where(predicate);
    return Number(row?.total ?? 0);
  }

  /**
   * Literal search (position(), never LIKE) across literal, English meanings
   * and Japanese readings, with deterministic ranking.
   */
  async search(
    query: KanjiSearchQuery,
    allowFixtureData: boolean,
  ): Promise<KanjiSearchRecord[]> {
    const { predicate, literalMatch, meaningMatch, readingMatch } = this.buildFilters(
      query,
      allowFixtureData,
    );

    const rank = sql<number>`
      case
        when ${literalMatch} then 0
        when ${meaningMatch} then 1
        when ${readingMatch} then 2
        else 3
      end
    `.as("match_rank");

    return db
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        strokeCount: kanjiCharacters.strokeCount,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
        radicalClassical: kanjiCharacters.radicalClassical,
        matchRank: rank,
        matchesLiteral: literalMatch,
        matchesMeaning: meaningMatch,
        matchesReading: readingMatch,
      })
      .from(kanjiCharacters)
      .where(predicate)
      .orderBy(
        sql.raw('"match_rank" asc'),
        sql`${kanjiCharacters.frequencyRank} asc`,
        asc(kanjiCharacters.literal),
      )
      .limit(query.limit)
      .offset(query.offset);
  }

  async findByLiteral(literal: string): Promise<KanjiDetailRecord | null> {
    const [record] = await db
      .select({
        id: kanjiCharacters.id,
        source: kanjiCharacters.source,
        literal: kanjiCharacters.literal,
        importRunId: kanjiCharacters.importRunId,
        codepointUcs: kanjiCharacters.codepointUcs,
        strokeCount: kanjiCharacters.strokeCount,
        strokeMiscounts: kanjiCharacters.strokeMiscounts,
        radicalClassical: kanjiCharacters.radicalClassical,
        radicalNelson: kanjiCharacters.radicalNelson,
        grade: kanjiCharacters.grade,
        frequencyRank: kanjiCharacters.frequencyRank,
        jlptOld: kanjiCharacters.jlptOld,
        nanori: kanjiCharacters.nanori,
        variants: kanjiCharacters.variants,
      })
      .from(kanjiCharacters)
      .where(
        and(eq(kanjiCharacters.source, KANJI_SOURCE), eq(kanjiCharacters.literal, literal)),
      )
      .limit(1);
    return record ?? null;
  }

  async findReadings(kanjiIds: number[]): Promise<KanjiReadingRecord[]> {
    if (kanjiIds.length === 0) return [];
    return db
      .select({
        kanjiId: kanjiReadings.kanjiId,
        type: kanjiReadings.type,
        value: kanjiReadings.value,
      })
      .from(kanjiReadings)
      .where(inArray(kanjiReadings.kanjiId, kanjiIds))
      .orderBy(asc(kanjiReadings.kanjiId), asc(kanjiReadings.position));
  }

  async findMeanings(kanjiIds: number[]): Promise<KanjiMeaningRecord[]> {
    if (kanjiIds.length === 0) return [];
    return db
      .select({
        kanjiId: kanjiMeanings.kanjiId,
        language: kanjiMeanings.language,
        value: kanjiMeanings.value,
      })
      .from(kanjiMeanings)
      .where(inArray(kanjiMeanings.kanjiId, kanjiIds))
      .orderBy(asc(kanjiMeanings.kanjiId), asc(kanjiMeanings.position));
  }

  /**
   * KRADFILE component decomposition plus any modern N-level labels, taken
   * only from successful enrichment runs visible in this runtime.
   */
  async findKanjiEnrichments(
    kanjiId: number,
    allowFixtureData: boolean,
  ): Promise<{
    components: string[];
    jlptLevels: JlptLevel[];
  }> {
    const fixturePredicate = allowFixtureData
      ? sql<boolean>`true`
      : eq(etlImportRuns.isFixture, false);

    const rows = await db
      .select({
        kind: knowledgeEnrichments.kind,
        variantKey: knowledgeEnrichments.variantKey,
        value: knowledgeEnrichments.value,
      })
      .from(knowledgeEnrichments)
      .innerJoin(
        etlImportRuns,
        eq(knowledgeEnrichments.sourceImportRunId, etlImportRuns.id),
      )
      .where(
        and(
          eq(knowledgeEnrichments.subjectType, "kanji_character"),
          eq(knowledgeEnrichments.subjectId, kanjiId),
          eq(etlImportRuns.status, "success"),
          fixturePredicate,
        ),
      );

    let components: string[] = [];
    const jlptLevels = new Set<JlptLevel>();

    for (const row of rows) {
      if (row.kind === "radical" && row.variantKey === "kradfile-components") {
        const value = row.value as { components?: unknown };
        components = stringArray(value?.components);
      }
      if (row.kind === "jlpt") {
        const level = (row.value as { level?: unknown })?.level;
        if (typeof level === "string" && /^N[1-5]$/.test(level)) {
          jlptLevels.add(level as JlptLevel);
        }
      }
    }

    return { components, jlptLevels: [...jlptLevels] };
  }

  /** Dictionary words whose headword contains this kanji. */
  async findVocabulary(literal: string, limit: number) {
    const rows = await db
      .select({
        id: dictionaryEntries.id,
        headword: dictionaryEntries.headword,
        primaryReading: dictionaryEntries.primaryReading,
        isCommon: dictionaryEntries.isCommon,
        frequencyRank: dictionaryEntries.frequencyRank,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, "jmdict"),
          sql`position(${literal} in ${dictionaryEntries.headword}) > 0`,
        ),
      )
      .orderBy(
        sql`${dictionaryEntries.isCommon} desc`,
        asc(dictionaryEntries.frequencyRank),
        asc(dictionaryEntries.id),
      )
      .limit(limit);

    return rows;
  }

  /** First English gloss for each dictionary entry id. */
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

  async findImportRun(id: number): Promise<KanjiImportRunRecord | null> {
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

/** Map raw JSON columns into typed shapes for service use. */
export { numberArray as toNumberArray, objectArray as toObjectArray, stringArray as toStringArray };
