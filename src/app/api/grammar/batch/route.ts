import type { NextRequest } from "next/server";

import { jsonOk, optionsHandler, withHeaders, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { grammarBatchBody, parseJsonBody } from "@/lib/api/validate";
import { getGrammarBatch } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/grammar/batch
 *
 * Mobile-friendly bulk fetch (Flutter): one round trip for many points.
 *
 *   { "slugs": ["te-shimau", "node"], "include": ["examples"], "examples": 3 }
 *
 * Missing slugs are returned as `{ slug, point: null }` instead of failing the
 * whole batch.
 */
export async function POST(request: NextRequest) {
  const limiter = rateLimit(`grammar:batch:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(
      badRequest("Too many requests, slow down"),
      limiter.headers,
    );
  }

  const parsed = await parseJsonBody(request, grammarBatchBody);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const started = Date.now();
  const items = await getGrammarBatch(parsed.data.slugs, {
    include: parsed.data.include,
    examples: parsed.data.examples,
  });

  return withHeaders(
    jsonOk(
      { items },
      {
        meta: {
          tookMs: Date.now() - started,
          requested: parsed.data.slugs.length,
          resolved: items.filter((item) => item.point !== null).length,
        },
      },
    ),
    limiter.headers,
  );
}

/**
 * GET /api/grammar/batch?slugs=te-shimau,node&include=examples
 * Read-only convenience form (cacheable by CDN).
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`grammar:batch:${clientId(request)}`);
  const url = new URL(request.url);
  const slugs = (url.searchParams.get("slugs") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  if (slugs.length === 0 || slugs.length > 50) {
    return withHeaders(
      badRequest("Query parameter 'slugs' must contain 1-50 comma separated slugs"),
      limiter.headers,
    );
  }

  const include = (url.searchParams.get("include") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is "examples" | "related" | "kanji" | "vocabulary" | "patterns" =>
      ["examples", "related", "kanji", "vocabulary", "patterns"].includes(part),
    );

  const examplesParam = Number(url.searchParams.get("examples") ?? "3");
  const items = await getGrammarBatch(slugs, {
    include: include.length ? include : undefined,
    examples: Number.isFinite(examplesParam) ? examplesParam : 3,
  });

  return withHeaders(
    jsonOk(
      { items },
      { meta: { requested: slugs.length, resolved: items.filter((item) => item.point).length } },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
