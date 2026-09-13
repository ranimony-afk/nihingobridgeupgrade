import "server-only";

import {
  getSearchIndexStats,
  searchPostgres,
  suggestPostgres,
} from "@/repositories/search";
import type {
  SearchEntityType,
  SearchIndexStats,
  SearchMode,
  SearchResultPage,
  SearchSuggestion,
} from "@/types/search";

export interface SearchOptions {
  query: string;
  mode?: SearchMode;
  types?: SearchEntityType[];
  jlptLevel?: number | null;
  limit?: number;
  offset?: number;
  fuzzyThreshold?: number;
}

/** Unicode-normalises input and collapses user whitespace. */
export function normalizeSearchQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export async function searchKnowledge(options: SearchOptions): Promise<SearchResultPage> {
  const started = Date.now();
  const normalizedQuery = normalizeSearchQuery(options.query);
  const mode = options.mode ?? "auto";
  const types = options.types?.length
    ? Array.from(new Set(options.types))
    : (["kanji", "dictionary", "grammar", "sentence", "course", "lesson"] as SearchEntityType[]);
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  if (!normalizedQuery) {
    return emptyResult(options.query, normalizedQuery, mode, types, limit, offset, started);
  }

  try {
    const result = await searchPostgres({
      query: normalizedQuery,
      mode,
      types,
      jlptLevel: options.jlptLevel ?? null,
      limit,
      offset,
      fuzzyThreshold: options.fuzzyThreshold,
    });
    const hasMore = offset + result.hits.length < result.total;
    return {
      query: options.query,
      normalizedQuery,
      mode,
      types,
      hits: result.hits,
      total: result.total,
      facets: result.facets,
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      tookMs: Date.now() - started,
    };
  } catch {
    // Fresh/unprovisioned environments return an empty contract rather than a
    // 500. `/api/search/stats` makes missing index infrastructure visible.
    return emptyResult(options.query, normalizedQuery, mode, types, limit, offset, started);
  }
}

export async function suggestKnowledge(
  query: string,
  options: { types?: SearchEntityType[]; limit?: number } = {},
): Promise<SearchSuggestion[]> {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];
  try {
    const hits = await suggestPostgres(normalized, options);
    return hits.map((hit) => ({
      entityType: hit.entityType,
      externalKey: hit.externalKey,
      primaryText: hit.primaryText,
      secondaryText: hit.secondaryText,
      route: hit.route,
      matchedOn: hit.matchedOn,
    }));
  } catch {
    return [];
  }
}

export async function getSearchHealth(): Promise<SearchIndexStats> {
  try {
    return await getSearchIndexStats();
  } catch {
    return {
      total: 0,
      active: 0,
      inactive: 0,
      byType: [],
      pgTrgm: false,
      fullTextIndex: false,
      trigramIndexes: 0,
      lastIndexedAt: null,
    };
  }
}

function emptyResult(
  query: string,
  normalizedQuery: string,
  mode: SearchMode,
  types: SearchEntityType[],
  limit: number,
  offset: number,
  started: number,
): SearchResultPage {
  return {
    query,
    normalizedQuery,
    mode,
    types,
    hits: [],
    total: 0,
    facets: {
      kanji: 0,
      dictionary: 0,
      grammar: 0,
      sentence: 0,
      course: 0,
      lesson: 0,
    },
    limit,
    offset,
    hasMore: false,
    nextOffset: null,
    tookMs: Date.now() - started,
  };
}
