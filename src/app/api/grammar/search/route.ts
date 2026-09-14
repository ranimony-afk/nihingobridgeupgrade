import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, withHeaders, jsonError, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { searchGrammar } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar/search?q=conditional&limit=24
 *
 * Scored search across title, Japanese pattern, English gloss and explanation.
 * Each hit reports `matchedOn` and `score` so clients can rank / highlight.
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`grammar:search:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(jsonError(429, "rate_limited", "Too many requests"), limiter.headers);
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length === 0) {
    return withHeaders(
      badRequest("Query parameter 'q' is required", [{ path: "q", message: "must not be empty" }]),
      limiter.headers,
    );
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 24;
  const started = Date.now();

  const result = await searchGrammar(query, limit);

  return withHeaders(
    jsonOk(
      { query: result.query, hits: result.hits },
      { meta: { tookMs: Date.now() - started, total: result.hits.length } },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
