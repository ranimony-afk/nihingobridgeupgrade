/**
 * Canonical kanji domain service.
 *
 * Route handlers call this service; it composes repository records into stable
 * API contracts. It contains no Drizzle imports and never touches the DB.
 */

import {
  KanjiRepository,
  toNumberArray,
  toObjectArray,
  toStringArray,
} from "@/repositories/KanjiRepository";
import type { JlptLevel } from "@/types/dictionary-v2";
import type {
  KanjiDetail,
  KanjiMatchField,
  KanjiSearchItem,
  KanjiSearchQuery,
  KanjiSearchResponse,
} from "@/types/kanji-v2";

export type KanjiServiceOptions = {
  /**
   * Synthetic fixture enrichments are test/staging-only. Defaults to false in
   * production so fixture data is never presented as a verified source fact.
   */
  allowFixtureEnrichments?: boolean;
};

function resolveAllowFixtureEnrichments(): boolean {
  return (
    process.env.KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS === "true" ||
    (process.env.KNOWLEDGE_ALLOW_FIXTURE_ENRICHMENTS !== "false" &&
      process.env.NODE_ENV !== "production")
  );
}

const MAX_MEANINGS_PER_ITEM = 3;
const MAX_READINGS_PER_ITEM = 4;
const VOCABULARY_LIMIT = 10;

export class KanjiService {
  private readonly allowFixtureEnrichments: boolean;

  constructor(
    private readonly repository = new KanjiRepository(),
    options: KanjiServiceOptions = {},
  ) {
    this.allowFixtureEnrichments =
      options.allowFixtureEnrichments ?? resolveAllowFixtureEnrichments();
  }

  async search(query: KanjiSearchQuery): Promise<KanjiSearchResponse> {
    const [total, records] = await Promise.all([
      this.repository.count(query, this.allowFixtureEnrichments),
      this.repository.search(query, this.allowFixtureEnrichments),
    ]);

    const kanjiIds = records.map((record) => record.id);
    const [readingRows, meaningRows] = await Promise.all([
      this.repository.findReadings(kanjiIds),
      this.repository.findMeanings(kanjiIds),
    ]);

    const readingsByKanji = new Map<number, { on: string[]; kun: string[] }>();
    for (const row of readingRows) {
      const entry = readingsByKanji.get(row.kanjiId) ?? { on: [], kun: [] };
      if (row.type === "ja_on") entry.on.push(row.value);
      else if (row.type === "ja_kun") entry.kun.push(row.value);
      readingsByKanji.set(row.kanjiId, entry);
    }

    const meaningsByKanji = new Map<number, string[]>();
    for (const row of meaningRows) {
      if (row.language !== "en") continue;
      const current = meaningsByKanji.get(row.kanjiId) ?? [];
      current.push(row.value);
      meaningsByKanji.set(row.kanjiId, current);
    }

    // Modern N-levels require a per-kanji enrichment lookup; batched for the page.
    const jlptByKanji = new Map<number, JlptLevel[]>();
    await Promise.all(
      kanjiIds.map(async (kanjiId) => {
        const { jlptLevels } = await this.repository.findKanjiEnrichments(
          kanjiId,
          this.allowFixtureEnrichments,
        );
        jlptByKanji.set(kanjiId, jlptLevels);
      }),
    );

    const results: KanjiSearchItem[] = records.map((record) => {
      const matchedFields: KanjiMatchField[] = [];
      if (record.matchesLiteral) matchedFields.push("literal");
      if (record.matchesMeaning) matchedFields.push("meaning");
      if (record.matchesReading) matchedFields.push("reading");

      const readings = readingsByKanji.get(record.id) ?? { on: [], kun: [] };

      return {
        literal: record.literal,
        meanings: (meaningsByKanji.get(record.id) ?? []).slice(0, MAX_MEANINGS_PER_ITEM),
        onReadings: readings.on.slice(0, MAX_READINGS_PER_ITEM),
        kunReadings: readings.kun.slice(0, MAX_READINGS_PER_ITEM),
        strokeCount: record.strokeCount,
        grade: record.grade,
        frequencyRank: record.frequencyRank,
        jlptLevels: jlptByKanji.get(record.id) ?? [],
        matchedFields,
      };
    });

    return {
      apiVersion: "v2",
      query: query.normalizedQuery,
      filters: {
        strokes: query.strokes,
        grade: query.grade,
        radical: query.radical,
        jlpt: query.jlpt,
        component: query.component,
        components: query.components,
      },
      total,
      offset: query.offset,
      limit: query.limit,
      results,
    };
  }

  async getByLiteral(literal: string): Promise<KanjiDetail | null> {
    const record = await this.repository.findByLiteral(literal);
    if (!record) return null;

    const [readingRows, meaningRows, enrichments, vocabularyRecords, importRun] =
      await Promise.all([
        this.repository.findReadings([record.id]),
        this.repository.findMeanings([record.id]),
        this.repository.findKanjiEnrichments(record.id, this.allowFixtureEnrichments),
        this.repository.findVocabulary(literal, VOCABULARY_LIMIT),
        record.importRunId === null
          ? Promise.resolve(null)
          : this.repository.findImportRun(record.importRunId),
      ]);

    const onReadings: string[] = [];
    const kunReadings: string[] = [];
    const otherReadings: { type: string; value: string }[] = [];
    for (const row of readingRows) {
      if (row.type === "ja_on") onReadings.push(row.value);
      else if (row.type === "ja_kun") kunReadings.push(row.value);
      else otherReadings.push({ type: row.type, value: row.value });
    }

    const meanings = meaningRows
      .filter((row) => row.language === "en")
      .map((row) => row.value);

    const glosses = await this.repository.findFirstGlosses(
      vocabularyRecords.map((entry) => entry.id),
    );

    const radicals = [
      ...(record.radicalClassical !== null
        ? [{ system: "kangxi-classical" as const, number: record.radicalClassical }]
        : []),
      ...(record.radicalNelson !== null
        ? [{ system: "nelson_c" as const, number: record.radicalNelson }]
        : []),
    ];

    return {
      apiVersion: "v2",
      literal: record.literal,
      codepointUcs: record.codepointUcs,
      strokeCount: record.strokeCount,
      strokeMiscounts: toNumberArray(record.strokeMiscounts),
      grade: record.grade,
      frequencyRank: record.frequencyRank,
      jlptLegacy: record.jlptOld,
      jlptLevels: enrichments.jlptLevels,
      radicals,
      components: enrichments.components,
      meanings,
      onReadings,
      kunReadings,
      otherReadings,
      nanori: toStringArray(record.nanori),
      variants: toObjectArray(record.variants),
      vocabulary: vocabularyRecords.map((entry) => ({
        id: entry.id,
        headword: entry.headword,
        primaryReading: entry.primaryReading,
        firstGloss: glosses.get(entry.id) ?? "",
      })),
      provenance: importRun
        ? {
            source: record.source,
            sourceUrl: importRun.sourceUrl,
            license: importRun.license,
            attribution: importRun.attribution,
            checksumSha256: importRun.checksumSha256,
            checksumVerified: importRun.checksumVerified,
            isFixture: importRun.isFixture,
          }
        : null,
    };
  }
}
