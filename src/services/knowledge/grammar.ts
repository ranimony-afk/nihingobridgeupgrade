import "server-only";

import {
  countGrammarPoints,
  getGrammarPointBySlug,
  getGrammarStats,
  listGrammarPoints,
  listGrammarTags,
} from "@/repositories/grammar";
import type {
  GrammarCatalog,
  GrammarPointDetail,
  GrammarPointSummary,
  GrammarStats,
} from "@/types/grammar";

export interface GrammarCatalogOptions {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
  register?: string | null;
  sort?: "relevance" | "level" | "order" | "title" | "examples";
  limit?: number;
  offset?: number;
}

/**
 * Grammar knowledge service.
 *
 * Pattern catalogue -> corpus evidence chain:
 *   grammar_points -> grammar_patterns -> grammar_examples -> grammar_example_matches
 * and cross-domain links into kanji (`grammar_point_kanji`) and vocabulary
 * (`grammar_point_vocabulary`).
 */
export async function getGrammarCatalog(
  options: GrammarCatalogOptions = {},
): Promise<GrammarCatalog> {
  const started = Date.now();
  let results: GrammarPointSummary[] = [];
  let total = 0;
  try {
    [results, total] = await Promise.all([
      listGrammarPoints(options),
      countGrammarPoints(options),
    ]);
  } catch {
    // Un-provisioned schema: return an empty catalogue instead of a 500.
    results = [];
    total = 0;
  }
  return {
    total,
    results,
    tookMs: Date.now() - started,
    filters: {
      query: options.query?.trim() || null,
      jlptLevel: options.jlptLevel ?? null,
      tag: options.tag ?? null,
      register: options.register ?? null,
      sort: options.sort ?? "order",
    },
  };
}

export async function getGrammarPoint(slug: string): Promise<GrammarPointDetail | null> {
  try {
    return await getGrammarPointBySlug(slug);
  } catch {
    return null;
  }
}

export async function getGrammarTagCloud(limit = 24) {
  try {
    const tags = await listGrammarTags();
    return tags.slice(0, limit);
  } catch {
    return [];
  }
}

export async function getGrammarOverview(): Promise<GrammarStats> {
  try {
    return await getGrammarStats();
  } catch {
    return {
      points: 0,
      patterns: 0,
      examples: 0,
      matches: 0,
      relations: 0,
      sources: 0,
      byLevel: [],
    };
  }
}
