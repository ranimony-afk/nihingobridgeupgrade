export type SearchEntityType =
  | "kanji"
  | "dictionary"
  | "grammar"
  | "sentence"
  | "course"
  | "lesson";
export type SearchMode = "auto" | "exact" | "full_text" | "fuzzy";
export type SearchMatchKind = "exact" | "prefix" | "full_text" | "fuzzy";

export interface SearchHit {
  id: number;
  entityType: SearchEntityType;
  entityId: number;
  externalKey: string;
  route: string;
  primaryText: string;
  secondaryText: string | null;
  description: string | null;
  aliases: string[];
  jlptLevel: number | null;
  priority: number;
  matchedOn: SearchMatchKind;
  /** Comparable only inside one response; exact starts at 1000. */
  score: number;
  /** pg_trgm score (0..1), present for every mode for diagnostics. */
  similarity: number;
}

export type SearchFacets = Record<SearchEntityType, number>;

export interface SearchResultPage {
  query: string;
  normalizedQuery: string;
  mode: SearchMode;
  types: SearchEntityType[];
  hits: SearchHit[];
  total: number;
  facets: SearchFacets;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
  tookMs: number;
}

export interface SearchSuggestion {
  entityType: SearchEntityType;
  externalKey: string;
  primaryText: string;
  secondaryText: string | null;
  route: string;
  matchedOn: SearchMatchKind;
}

export interface SearchIndexStats {
  total: number;
  active: number;
  inactive: number;
  byType: Array<{
    entityType: SearchEntityType;
    total: number;
    active: number;
    lastIndexedAt: string | null;
  }>;
  pgTrgm: boolean;
  fullTextIndex: boolean;
  trigramIndexes: number;
  lastIndexedAt: string | null;
}
