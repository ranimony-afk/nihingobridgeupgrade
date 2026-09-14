import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, paginationMeta, withHeaders, jsonError } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { grammarListQuery, parseQuery } from "@/lib/api/validate";
import { getGrammarCatalog } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar
 *
 * Canonical grammar catalogue. Stable contract for the web app and the Flutter
 * client:
 *
 *   {
 *     data: { points: GrammarPointSummary[], filters: {...} },
 *     meta: { requestId, apiVersion, tookMs, pagination }
 *   }
 *
 * Query: q, jlpt (1-5), tag, register, sort (relevance|level|order|title|examples),
 *        limit (1-200), offset
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`grammar:list:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(
      jsonError(429, "rate_limited", "Too many requests, slow down"),
      limiter.headers,
    );
  }

  const parsed = parseQuery(new URL(request.url).searchParams, grammarListQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const { q, jlpt, tag, register, sort, limit, offset } = parsed.data;
  const started = Date.now();

  const catalog = await getGrammarCatalog({
    query: q,
    jlptLevel: jlpt ?? null,
    tag: tag ?? null,
    register: register ?? null,
    sort,
    limit,
    offset,
  });

  return withHeaders(
    jsonOk(
      { points: catalog.results, filters: catalog.filters },
      {
        meta: {
          tookMs: Date.now() - started,
          pagination: paginationMeta(catalog.total, limit, offset),
        },
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
