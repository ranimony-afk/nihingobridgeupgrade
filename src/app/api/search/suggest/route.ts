import type { NextRequest } from "next/server";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { parseQuery, searchSuggestQuery } from "@/lib/api/validate";
import { suggestKnowledge } from "@/services/search/postgres-search";

export const dynamic = "force-dynamic";

/** GET /api/search/suggest?q=てし&types=grammar&limit=8 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`search:suggest:${clientId(request)}`, { limit: 300 });
  if (!limiter.allowed) {
    return withHeaders(
      jsonError(429, "rate_limited", "Too many suggestion requests"),
      limiter.headers,
    );
  }

  const parsed = parseQuery(new URL(request.url).searchParams, searchSuggestQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const started = Date.now();
  const suggestions = await suggestKnowledge(parsed.data.q, {
    types: parsed.data.types,
    limit: parsed.data.limit,
  });

  return withHeaders(
    jsonOk(
      { query: parsed.data.q, suggestions },
      {
        meta: {
          total: suggestions.length,
          tookMs: Date.now() - started,
          engine: "postgresql",
        },
        cacheSeconds: 30,
        staleSeconds: 120,
      },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
