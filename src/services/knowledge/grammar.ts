import "server-only";

import {
  countGrammarPoints,
  getGrammarPointBySlug,
  getGrammarStats,
  listGrammarPoints,
  listGrammarTags,
} from "@/repositories/grammar";
import type { GrammarCatalog, GrammarPointDetail, GrammarStats } from "@/types/grammar";

export interface GrammarCatalogOptions {
  query?: string;
  jlptLevel?: number | null;
  tag?: string | null;
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
  const [results, total] = await Promise.all([
    listGrammarPoints(options),
    countGrammarPoints(options),
  ]);
  return {
    total,
    results,
    tookMs: Date.now() - started,
    filters: {
      query: options.query?.trim() || null,
      jlptLevel: options.jlptLevel ?? null,
      tag: options.tag ?? null,
    },
  };
}

export async function getGrammarPoint(slug: string): Promise<GrammarPointDetail | null> {
  return getGrammarPointBySlug(slug);
}

export async function getGrammarTagCloud(limit = 24) {
  const tags = await listGrammarTags();
  return tags.slice(0, limit);
}

export async function getGrammarOverview(): Promise<GrammarStats> {
  return getGrammarStats();
}
