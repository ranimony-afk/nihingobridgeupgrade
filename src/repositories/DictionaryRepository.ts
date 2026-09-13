/**
 * Canonical persistence boundary for dictionary knowledge.
 *
 * This is the only Dictionary* module that imports Drizzle/database tables.
 * Services receive records from here; HTTP/UI code must not query the DB.
 */

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionaryKanji,
  dictionaryReadings,
  dictionarySenses,
  etlImportRuns,
  knowledgeEnrichments,
} from "@/db/schema";

export type DictionarySearchRecord = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  frequencyRank: number | null;
  jlptLevel: string | null;
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
