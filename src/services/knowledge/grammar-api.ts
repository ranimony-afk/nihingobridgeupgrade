import "server-only";

import {
  countGrammarExamples,
  getGrammarGraph,
  getGrammarLevels,
  getRelatedPoints,
  listGrammarExamples,
  listGrammarPointsBySlugs,
  searchGrammarPoints,
  type ExampleFilters,
  type GrammarGraph,
  type GrammarLevelSummary,
} from "@/repositories/grammar";
import { getGrammarPointBySlug } from "@/repositories/grammar";
import type { GrammarExample, GrammarPointDetail, GrammarPointSummary, GrammarRelatedPoint } from "@/types/grammar";

/**
 * Grammar API service layer.
 *
 * The HTTP routes stay thin: validation + envelope live in `src/lib/api`, data
 * access lives in `src/repositories/grammar`, and every rule about what a
 * client is allowed to ask for lives here so the Flutter client and the web app
 * get identical behaviour.
 */

export interface ExamplesResult {
  point: { id: number; slug: string; title: string };
  examples: GrammarExample[];
  total: number;
}

export async function getGrammarExamples(
  slug: string,
  filters: ExampleFilters & { limit?: number; offset?: number } = {},
): Promise<ExamplesResult | null> {
  let point: GrammarPointDetail | null = null;
  try {
    point = await getGrammarPointBySlug(slug);
  } catch {
    return null;
  }
  if (!point) return null;

  let examples: GrammarExample[] = [];
  let total = 0;
  try {
    [examples, total] = await Promise.all([
      listGrammarExamples(point.id, filters),
      countGrammarExamples(point.id, filters),
    ]);
  } catch {
    examples = [];
    total = 0;
  }

  return {
    point: { id: point.id, slug: point.slug, title: point.title },
    examples,
    total,
  };
}

export async function getRelatedGrammarPoints(
  slug: string,
  options: { relation?: string; depth?: number; limit?: number } = {},
): Promise<{ root: string; related: GrammarRelatedPoint[] } | null> {
  try {
    return await getRelatedPoints(slug, options);
  } catch {
    return null;
  }
}

export async function getGrammarMap(options: {
  jlptLevel?: number | null;
  tag?: string | null;
  relation?: string | null;
  limit?: number;
}): Promise<GrammarGraph> {
  try {
    return await getGrammarGraph(options);
  } catch {
    return { nodes: [], edges: [] };
  }
}

export async function getGrammarLevelSummary(): Promise<GrammarLevelSummary[]> {
  try {
    return await getGrammarLevels();
  } catch {
    return [];
  }
}

export interface GrammarSearchHit extends GrammarPointSummary {
  matchedOn: "title" | "pattern" | "gloss" | "explanation";
  score: number;
}

export async function searchGrammar(
  query: string,
  limit = 24,
): Promise<{ query: string; hits: GrammarSearchHit[] }> {
  let hits: Array<{ point: GrammarPointSummary; matchedOn: string; score: number }> = [];
  try {
    hits = await searchGrammarPoints(query, limit);
  } catch {
    hits = [];
  }
  return {
    query,
    hits: hits.map((hit) => ({
      ...hit.point,
      matchedOn: hit.matchedOn as GrammarSearchHit["matchedOn"],
      score: hit.score,
    })),
  };
}

export interface BatchOptions {
  include?: Array<"examples" | "related" | "kanji" | "vocabulary" | "patterns">;
  examples?: number;
}

export interface BatchItem {
  slug: string;
  point: GrammarPointSummary | null;
  detail?: Partial<GrammarPointDetail>;
}

/**
 * Batch endpoint for mobile clients: fetch several points (optionally with
 * examples / relations / cross links) in a single round trip.
 */
export async function getGrammarBatch(
  slugs: string[],
  options: BatchOptions = {},
): Promise<BatchItem[]> {
  const include = new Set(options.include ?? []);
  const exampleLimit = Math.min(options.examples ?? 3, 20);

  let summaries: GrammarPointSummary[] = [];
  try {
    summaries = await listGrammarPointsBySlugs(slugs);
  } catch {
    summaries = [];
  }
  const bySlug = new Map(summaries.map((point) => [point.slug, point]));

  const items: BatchItem[] = [];
  for (const slug of slugs) {
    const point = bySlug.get(slug) ?? null;
    if (!point) {
      items.push({ slug, point: null });
      continue;
    }

    const detail: Partial<GrammarPointDetail> = {};
    if (include.size > 0) {
      let full: GrammarPointDetail | null = null;
      try {
        full = await getGrammarPointBySlug(slug);
      } catch {
        full = null;
      }
      if (full) {
        if (include.has("patterns")) detail.patternDetails = full.patternDetails;
        if (include.has("examples")) detail.examples = full.examples.slice(0, exampleLimit);
        if (include.has("related")) detail.related = full.related;
        if (include.has("kanji")) detail.kanji = full.kanji;
        if (include.has("vocabulary")) detail.vocabulary = full.vocabulary;
      }
    }

    items.push({ slug, point, detail: include.size > 0 ? detail : undefined });
  }

  return items;
}
