import type { NextRequest } from "next/server";

import {
  badRequest,
  jsonError,
  jsonOk,
  optionsHandler,
  paginationMeta,
  withHeaders,
} from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { parseQuery, searchQuery } from "@/lib/api/validate";
import { searchKnowledge } from "@/services/search/postgres-search";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=water&mode=auto&types=kanji,vocabulary,grammar&jlpt=5
 *
 * Unified PostgreSQL search. Modes:
 *   exact      equality against primary/secondary/aliases
 *   full_text  GIN tsvector + plainto_tsquery('simple', ...)
 *   fuzzy      pg_trgm similarity + word_similarity
 *   auto       exact > prefix > full-text > fuzzy
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`search:${clientId(request)}`, { limit: 180 });
  if (!limiter.allowed) {
    return withHeaders(
      jsonError(429, "rate_limited", "Too many search requests, slow down"),
      limiter.headers,
    );
  }

  const parsed = parseQuery(new URL(request.url).searchParams, searchQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const { q, mode, types, jlpt, limit, offset, threshold } = parsed.data;
  if (types.length === 0) {
    return withHeaders(badRequest("At least one search type is required"), limiter.headers);
  }

  const result = await searchKnowledge({
    query: q,
    mode,
    types,
    jlptLevel: jlpt ?? null,
    limit,
    offset,
    fuzzyThreshold: threshold,
  });

  return withHeaders(
    jsonOk(
      {
        query: result.query,
        normalizedQuery: result.normalizedQuery,
        mode: result.mode,
        types: result.types,
        hits: result.hits,
        facets: result.facets,
      },
      {
        meta: {
          tookMs: result.tookMs,
          pagination: paginationMeta(result.total, result.limit, result.offset),
          engine: "postgresql",
          strategies: ["exact", "prefix", "full_text", "fuzzy"],
        },
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
