import type { JLPTLevel } from "@/etl/grammar/types";
import type { PublicationStore } from "@/services/publication";

export type SearchTarget =
  | "dictionary"
  | "kanji"
  | "radicals"
  | "grammar"
  | "sentences"
  | "jlpt";

export const ALL_SEARCH_TARGETS: readonly SearchTarget[] = [
  "dictionary",
  "kanji",
  "radicals",
  "grammar",
  "sentences",
  "jlpt",
] as const;

export type SearchScript =
  | "japanese"
  | "kana"
  | "kanji"
  | "romaji"
  | "english"
  | "empty"
  | "mixed";

export interface UnifiedSearchResultItem {
  entityType: SearchTarget;
  id: string;
  displayText: string;
  reading: string | null;
  meaning: string;
  jlptLevel: string | null;
  source: string;
  relevance: number;
  matchedOn?: string;
  metadata?: Record<string, any>;
}

export interface UnifiedSearchOptions {
  targets?: SearchTarget[];
  jlptLevel?: JLPTLevel | string;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
  /**
   * 13.5F: published-content port for the dictionary overlay. Defaults
   * to the production Drizzle store; tests inject fakes.
   */
  publicationStore?: PublicationStore;
}

export interface UnifiedSearchMetrics {
  durationMs: number;
  targetDurationsMs: Partial<Record<SearchTarget, number>>;
  totalFound: number;
}

export interface UnifiedSearchResponse {
  query: string;
  detectedScript: SearchScript;
  appliedJlptLevel: string | null;
  targetsSearched: SearchTarget[];
  results: UnifiedSearchResultItem[];
  totalResults: number;
  metrics: UnifiedSearchMetrics;
}
