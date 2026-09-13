/**
 * Canonical dictionary domain service.
 *
 * Route handlers call this service; it composes repository records into stable,
 * database-independent API contracts. It contains no Drizzle imports.
 */

import { DictionaryRepository } from "@/repositories/DictionaryRepository";
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

export type DictionaryServiceOptions = {
  /**
   * Synthetic fixture enrichments are test/dev-only. Production defaults to
   * false, even when the source entry itself is visible for fixture testing.
   */
  allowFixtureEnrichments?: boolean;
};

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
    this.allowFixtureEnrichments =
      options.allowFixtureEnrichments ?? process.env.NODE_ENV !== "production";
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
