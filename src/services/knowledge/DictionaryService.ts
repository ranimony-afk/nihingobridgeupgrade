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
  DictionaryEntryDetail,
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
  DictionaryV2SearchItem,
  DictionaryV2SearchQuery,
  DictionaryV2SearchResponse,
} from "@/types/dictionary-v2";

export type DictionaryServiceOptions = {
  /**
   * Synthetic fixture enrichments are test/dev-only. Production defaults to
   * false, even when the source entry itself is visible for fixture testing.
   */
  allowFixtureEnrichments?: boolean;
};

/**
 * Resolve fixture-enrichment visibility.
 *
 * Default: visible in development/test, hidden under NODE_ENV=production.
 *
 * `DICTIONARY_SHOW_FIXTURE_ENRICHMENTS=true` is an explicit, opt-in override
 * for environments that deliberately run a fixture-only corpus in production
 * mode (e.g. the Playwright gate, a preview stack). A real deployment must
 * leave it unset. It never affects licensing/provenance gates in the ETL.
 */
export function resolveFixtureEnrichmentVisibility(): boolean {
  const override = process.env.DICTIONARY_SHOW_FIXTURE_ENRICHMENTS;
  if (override !== undefined && override.trim() !== "") {
    return ["1", "true", "yes", "on"].includes(override.trim().toLowerCase());
  }
  return process.env.NODE_ENV !== "production";
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isKanjiLiteral(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2a6df)
  );
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
      options.allowFixtureEnrichments ?? resolveFixtureEnrichmentVisibility();
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
    return entry ? { apiVersion: "v2", ...entry } : null;
  }

  /**
   * Full detail-page aggregate: base entry + examples, kanji breakdown,
   * related entries, JLPT labels and an explicit audio state.
   */
  async getDetail(id: number): Promise<DictionaryEntryDetail | null> {
    const entry = await this.getById(id);
    if (!entry) return null;

    const surfaceForms = [
      ...entry.kanji.map((form) => form.text),
      ...entry.readings.map((form) => form.text),
    ];
    const kanjiLiterals = Array.from(entry.headword).filter(isKanjiLiteral);

    const [examples, kanjiComponents, related, jlptByEntry] = await Promise.all([
      this.repository.findExamples(surfaceForms, 5),
      this.repository.findKanjiComponents(kanjiLiterals),
      this.repository.findRelated(entry.id, kanjiLiterals, entry.primaryReading, 6),
      this.repository.findJlptLevels([entry.id], this.allowFixtureEnrichments),
    ]);

    const jlptLevels = [
      ...(entry.jlptLevel && /^N[1-5]$/.test(entry.jlptLevel) ? [entry.jlptLevel] : []),
      ...(jlptByEntry.get(entry.id) ?? []),
    ].filter((level, index, values) => values.indexOf(level) === index);

    return {
      ...entry,
      jlptLevels,
      examples,
      kanjiComponents,
      related,
      audio: {
        status: "unavailable",
        reason:
          "No licensed pronunciation audio is held for this entry. Tatoeba audio was excluded because its per-recording licences do not permit off-site reuse.",
      },
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
