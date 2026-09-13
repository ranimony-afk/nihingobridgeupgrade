/**
 * Canonical dictionary domain service.
 *
 * Route handlers call this service; it composes repository records into stable,
 * database-independent API contracts. It contains no Drizzle imports.
 */

import { DictionaryRepository } from "@/repositories/DictionaryRepository";
import { isKana } from "wanakana";
import type {
  DictionaryEnrichment,
  DictionaryEntry,
  DictionaryForm,
  DictionaryProvenance,
  DictionarySearchItem,
  DictionarySearchQuery,
  DictionarySearchResponse,
  DictionarySense,
} from "@/types/dictionary";
import type {
  DictionaryV2Entry,
  DictionaryV2MatchField,
  DictionaryV2RelatedItem,
  DictionaryV2SearchItem,
  DictionaryV2SearchQuery,
  DictionaryV2SearchResponse,
  JlptLevel,
} from "@/types/dictionary-v2";

export type DictionaryServiceOptions = {
  /**
   * Synthetic fixture enrichments are test/staging-only.
   *
   * Defaults to false in production so fixture data is never presented as a
   * verified source fact. It may be enabled explicitly for environments that
   * deliberately run against the synthetic fixture corpus (CI, staging).
   */
  allowFixtureEnrichments?: boolean;
};

function resolveAllowFixtureEnrichments(): boolean {
  // Explicit opt-in wins, otherwise allow outside production.
  return (
    process.env.KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS === "true" ||
    (process.env.KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS !== "false" &&
      process.env.NODE_ENV !== "production")
  );
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class DictionaryService {
  private readonly allowFixtureEnrichments: boolean;

  constructor(
    private readonly repository = new DictionaryRepository(),
    options: DictionaryServiceOptions = {},
  ) {
    this.allowFixtureEnrichments = options.allowFixtureEnrichments ?? resolveAllowFixtureEnrichments();
  }

  async search(query: DictionarySearchQuery): Promise<DictionarySearchResponse> {
    const entries = await this.repository.search(query.normalizedQuery, query.limit);
    const firstGlosses = await this.repository.findFirstGlosses(entries.map((entry) => entry.id));
    const needle = query.normalizedQuery.toLocaleLowerCase("ja-JP");

    const results: DictionarySearchItem[] = entries.map((entry) => {
      const headword = entry.headword.toLocaleLowerCase("ja-JP");
      const reading = entry.primaryReading.toLocaleLowerCase("ja-JP");
      const match =
        headword === needle || reading === needle
          ? "exact"
          : headword.startsWith(needle) || reading.startsWith(needle)
            ? "prefix"
            : "contains";

      return {
        id: entry.id,
        headword: entry.headword,
        primaryReading: entry.primaryReading,
        firstGloss: firstGlosses.get(entry.id) ?? "",
        isCommon: entry.isCommon,
        match,
      };
    });

    return { query: query.normalizedQuery, total: results.length, results };
  }

  async searchV2(query: DictionaryV2SearchQuery): Promise<DictionaryV2SearchResponse> {
    const entries = await this.repository.searchV2(query, this.allowFixtureEnrichments);
    const entryIds = entries.map((entry) => entry.id);
    const [firstGlosses, jlptByEntry] = await Promise.all([
      this.repository.findFirstGlosses(entryIds),
      this.repository.findJlptLevels(entryIds, this.allowFixtureEnrichments),
    ]);

    const literalNeedle = query.normalizedQuery?.toLocaleLowerCase("ja-JP") ?? "";
    const results: DictionaryV2SearchItem[] = entries.map((entry) => {
      const matchedFields: DictionaryV2MatchField[] = [];
      const headword = entry.headword.toLocaleLowerCase("ja-JP");
      const reading = entry.primaryReading.toLocaleLowerCase("ja-JP");
      const romajiReadingMatch =
        query.romajiKana !== null && reading.includes(query.romajiKana.toLocaleLowerCase("ja-JP"));
      const romajiHeadwordMatch =
        query.romajiKana !== null && headword.includes(query.romajiKana.toLocaleLowerCase("ja-JP"));

      if (entry.matchesHeadword) {
        if (romajiHeadwordMatch) matchedFields.push("romaji");
        else if (isKana(entry.headword)) matchedFields.push("kana");
        else matchedFields.push("japanese");
      }
      if (entry.matchesReading) {
        matchedFields.push(romajiReadingMatch ? "romaji" : "kana");
      }
      if (entry.matchesEnglish) matchedFields.push("english");

      const jlptLevels = [
        ...(entry.jlptLevel && /^N[1-5]$/.test(entry.jlptLevel) ? [entry.jlptLevel] : []),
        ...(jlptByEntry.get(entry.id) ?? []),
      ].filter((level, index, values) => values.indexOf(level) === index) as DictionaryV2SearchItem["jlptLevels"];

      const match =
        entry.matchRank <= 2 ||
        (literalNeedle.length > 0 &&
          (headword === literalNeedle || reading === literalNeedle ||
            firstGlosses.get(entry.id)?.toLocaleLowerCase("en-US") === literalNeedle))
          ? "exact"
          : entry.matchRank <= 4
            ? "prefix"
            : "contains";

      return {
        id: entry.id,
        headword: entry.headword,
        primaryReading: entry.primaryReading,
        firstGloss: firstGlosses.get(entry.id) ?? "",
        isCommon: entry.isCommon,
        match,
        matchedFields: [...new Set(matchedFields)],
        jlptLevels,
      };
    });

    return {
      apiVersion: "v2",
      query: query.normalizedQuery,
      filters: { jlpt: query.jlptLevel },
      total: results.length,
      results,
    };
  }

  async getByIdV2(id: number): Promise<DictionaryV2Entry | null> {
    const entry = await this.getById(id);
    if (!entry) return null;

    const [kanjiComponents, examples, relatedRecords, jlptByEntry] = await Promise.all([
      this.repository.findKanjiComponents(entry.headword),
      this.repository.findExamples(entry.headword, 5),
      this.repository.findRelated(id, entry.headword, entry.primaryReading, 8),
      this.repository.findJlptLevels([id], this.allowFixtureEnrichments),
    ]);

    const relatedGlosses = await this.repository.findFirstGlosses(
      relatedRecords.map((record) => record.id),
    );

    const related: DictionaryV2RelatedItem[] = relatedRecords.map((record) => ({
      id: record.id,
      headword: record.headword,
      primaryReading: record.primaryReading,
      firstGloss: relatedGlosses.get(record.id) ?? "",
      relation: record.relation,
    }));

    const jlptLevels = [
      ...(entry.jlptLevel && /^N[1-5]$/.test(entry.jlptLevel) ? [entry.jlptLevel] : []),
      ...(jlptByEntry.get(id) ?? []),
    ].filter((level, index, values) => values.indexOf(level) === index) as JlptLevel[];

    return {
      apiVersion: "v2",
      ...entry,
      jlptLevels,
      kanjiComponents,
      examples,
      related,
    };
  }

  async getById(id: number): Promise<DictionaryEntry | null> {
    const entry = await this.repository.findById(id);
    if (!entry) return null;

    const [kanjiRows, readingRows, senseRows, enrichmentRows, importRun] =
      await Promise.all([
        this.repository.findKanjiForms(entry.id),
        this.repository.findReadings(entry.id),
        this.repository.findSenses(entry.id),
        this.repository.findEnrichments(entry.id, this.allowFixtureEnrichments),
        entry.importRunId === null
          ? Promise.resolve(null)
          : this.repository.findImportRun(entry.importRunId),
      ]);

    const form = (row: {
      text: string;
      common: boolean;
      priorityTags: unknown;
      infoTags: unknown;
    }): DictionaryForm => ({
      text: row.text,
      common: row.common,
      priorityTags: asStrings(row.priorityTags),
      infoTags: asStrings(row.infoTags),
    });

    const senses: DictionarySense[] = senseRows.map((sense) => ({
      glosses: asStrings(sense.glosses),
      partsOfSpeech: asStrings(sense.partsOfSpeech),
      fields: asStrings(sense.fields),
      misc: asStrings(sense.misc),
      dialects: asStrings(sense.dialects),
      info: sense.info,
    }));

    const enrichments: DictionaryEnrichment[] = enrichmentRows.map((enrichment) => ({
      kind: enrichment.kind as DictionaryEnrichment["kind"],
      variantKey: enrichment.variantKey,
      value: asObject(enrichment.value),
      derivationMethod: enrichment.derivationMethod,
      derivationVersion: enrichment.derivationVersion,
      sourceRecordKey: enrichment.sourceRecordKey,
    }));

    const provenance: DictionaryProvenance | null = importRun
      ? {
          source: entry.source,
          sourceId: entry.sourceId,
          sourceUrl: importRun.sourceUrl,
          license: importRun.license,
          attribution: importRun.attribution,
          checksumSha256: importRun.checksumSha256,
          checksumVerified: importRun.checksumVerified,
          isFixture: importRun.isFixture,
        }
      : null;

    return {
      id: entry.id,
      headword: entry.headword,
      primaryReading: entry.primaryReading,
      isCommon: entry.isCommon,
      frequencyRank: entry.frequencyRank,
      jlptLevel: entry.jlptLevel,
      kanji: kanjiRows.map(form),
      readings: readingRows.map(form),
      senses,
      enrichments,
      provenance,
    };
  }
}
