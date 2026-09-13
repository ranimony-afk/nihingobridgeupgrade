/**
 * Canonical radical & component domain service.
 *
 * Composes repository records into stable API contracts. No Drizzle imports.
 */

import { RadicalRepository } from "@/repositories/RadicalRepository";
import type {
  ComponentIndexResponse,
  RadicalDetail,
  RadicalIndexResponse,
  RadicalKanjiItem,
  RadicalSummary,
} from "@/types/radical-v2";

const KANJI_LIST_LIMIT = 60;
const MAX_MEANINGS = 3;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class RadicalService {
  constructor(private readonly repository = new RadicalRepository()) {}

  /** The full radical index, grouped by the radical's own stroke count. */
  async getIndex(): Promise<RadicalIndexResponse> {
    const records = await this.repository.listWithCounts();

    const summaries: RadicalSummary[] = records.map((record) => ({
      number: record.number,
      character: record.character,
      variants: toStringArray(record.variants),
      strokeCount: record.strokeCount,
      meaning: record.meaning,
      reading: record.reading,
      kanjiCount: Number(record.kanjiCount ?? 0),
      componentCount: Number(record.componentCount ?? 0),
    }));

    const byStroke = new Map<number, RadicalSummary[]>();
    for (const summary of summaries) {
      const bucket = byStroke.get(summary.strokeCount) ?? [];
      bucket.push(summary);
      byStroke.set(summary.strokeCount, bucket);
    }

    const groups = [...byStroke.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([strokeCount, group]) => ({ strokeCount, radicals: group }));

    return { apiVersion: "v2", total: summaries.length, groups };
  }

  async getByNumber(number: number): Promise<RadicalDetail | null> {
    const record = await this.repository.findByNumber(number);
    if (!record) return null;

    const [byRadical, byComponent, importRun] = await Promise.all([
      this.repository.findKanjiByRadicalNumber(number, KANJI_LIST_LIMIT),
      this.repository.findKanjiByRadicalComponent(record.id, KANJI_LIST_LIMIT),
      record.importRunId === null
        ? Promise.resolve(null)
        : this.repository.findImportRun(record.importRunId),
    ]);

    const meanings = await this.repository.findEnglishMeanings([
      ...byRadical.map((k) => k.id),
      ...byComponent.map((k) => k.id),
    ]);

    const toItem = (kanji: {
      id: number;
      literal: string;
      strokeCount: number | null;
      grade: number | null;
      frequencyRank: number | null;
    }): RadicalKanjiItem => ({
      literal: kanji.literal,
      meanings: (meanings.get(kanji.id) ?? []).slice(0, MAX_MEANINGS),
      strokeCount: kanji.strokeCount,
      grade: kanji.grade,
      frequencyRank: kanji.frequencyRank,
    });

    return {
      apiVersion: "v2",
      number: record.number,
      character: record.character,
      variants: toStringArray(record.variants),
      strokeCount: record.strokeCount,
      meaning: record.meaning,
      reading: record.reading,
      kanjiByRadical: byRadical.map(toItem),
      kanjiByComponent: byComponent.map(toItem),
      provenance: importRun
        ? {
            source: importRun.source,
            license: importRun.license,
            attribution: importRun.attribution,
          }
        : null,
    };
  }

  /** Components actually present in the corpus, for a multi-radical picker. */
  async getComponentIndex(): Promise<ComponentIndexResponse> {
    const records = await this.repository.listComponentOptions();
    return {
      apiVersion: "v2",
      total: records.length,
      components: records.map((record) => ({
        component: record.component,
        radicalNumber: record.radicalNumber === null ? null : Number(record.radicalNumber),
        strokeCount: record.strokeCount === null ? null : Number(record.strokeCount),
        meaning: record.meaning,
        kanjiCount: Number(record.kanjiCount ?? 0),
      })),
    };
  }

  /** Kanji containing every supplied component (AND). */
  async findByAllComponents(components: string[], limit: number) {
    const kanji = await this.repository.findKanjiByAllComponents(components, limit);
    const meanings = await this.repository.findEnglishMeanings(kanji.map((k) => k.id));
    return kanji.map((item) => ({
      literal: item.literal,
      meanings: (meanings.get(item.id) ?? []).slice(0, MAX_MEANINGS),
      strokeCount: item.strokeCount,
      grade: item.grade,
      frequencyRank: item.frequencyRank,
    }));
  }
}
