/**
 * Fake publication store + learner fixtures — Phase 13.5F.
 *
 * In-memory PublicationStore that mirrors the production Drizzle
 * predicate (contentType + status + entity match) so status-exclusion
 * and merge semantics are testable without a database. The Drizzle
 * implementation itself is proven by static predicate tests.
 */
import type {
  CanonicalDictionaryRow,
  PublicationStore,
  PublishedDictionaryOverride,
} from "@/services/publication";

export interface FakeCmsItemSeed {
  contentType: string;
  entityId: string | null;
  status: string;
  sourceRef?: string;
  provenanceType?: string;
  stagedPayload: unknown;
}

export class FakePublicationStore implements PublicationStore {
  readonly items: FakeCmsItemSeed[] = [];
  calls = 0;
  lastEntityIds: readonly string[] | null = null;
  failOnFind: Error | null = null;

  seed(item: FakeCmsItemSeed): void {
    this.items.push({
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
      ...item,
    });
  }

  async findPublishedDictionaryOverrides(
    entityIds: readonly string[]
  ): Promise<PublishedDictionaryOverride[]> {
    this.calls += 1;
    this.lastEntityIds = entityIds;
    if (this.failOnFind) throw this.failOnFind;
    // Mirror of the production predicate — see drizzlePublicationStore.
    return this.items.flatMap((item) =>
      item.contentType === "dictionary" &&
      item.status === "published" &&
      item.entityId !== null &&
      entityIds.includes(item.entityId)
        ? [
            {
              entityId: item.entityId,
              sourceRef: item.sourceRef ?? "first-party:test:v1",
              provenanceType: item.provenanceType ?? "editorial_curated",
              stagedPayload: item.stagedPayload,
            },
          ]
        : []
    );
  }
}

export function canonicalEntryFixture(
  overrides: Partial<CanonicalDictionaryRow> = {}
): CanonicalDictionaryRow {
  return {
    id: "de-water",
    headword: "水",
    reading: "みず",
    romaji: "mizu",
    jlptLevel: "N5",
    isCommon: true,
    frequencyRank: 42,
    partsOfSpeech: ["noun"],
    senses: [{ glosses: ["water"], note: null }],
    kanjiCharacters: ["水"],
    tags: ["nature"],
    sourceRef: "first-party:dictionary-core:v1",
    ...overrides,
  };
}

export function stagedPayloadFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    headword: "水",
    reading: "みず",
    romaji: "mizu",
    jlptLevel: "N5",
    isCommon: true,
    partsOfSpeech: ["noun"],
    senses: [{ glosses: ["water", "cold water"], note: "noun" }],
    kanjiCharacters: ["水"],
    tags: ["nature", "daily-life"],
    ...overrides,
  };
}

export interface FakeTranslationRow {
  id: string;
  entityType: string;
  entityId: string;
  language: string;
  translatedText: string;
  sourceType: string;
  isVerified: boolean;
  createdAt: Date;
}

export function translationRowFixture(
  overrides: Partial<FakeTranslationRow> = {}
): FakeTranslationRow {
  return {
    id: "tr-1",
    entityType: "dictionary",
    entityId: "de-water",
    language: "ta",
    translatedText: "தண்ணீர்",
    sourceType: "machine",
    isVerified: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
