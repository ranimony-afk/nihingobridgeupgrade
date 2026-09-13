import type { NextRequest } from "next/server";

import { jsonOk, notFound, optionsHandler, paginationMeta, withHeaders, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { grammarExamplesQuery, parseQuery } from "@/lib/api/validate";
import { getGrammarExamples } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/grammar/[slug]/examples?limit=20&offset=0&maxLength=30&sort=length
 *
 * Paginated corpus evidence for one point, with the matched pattern offsets
 * (`matches`) that justify each sentence.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:examples:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();

  const parsed = parseQuery(new URL(request.url).searchParams, grammarExamplesQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const { limit, offset, maxLength, minLength, sort } = parsed.data;
  const result = await getGrammarExamples(decoded, { limit, offset, maxLength, minLength, sort });
  if (!result) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  return withHeaders(
    jsonOk(
      { point: result.point, examples: result.examples },
      { meta: { pagination: paginationMeta(result.total, limit, offset) } },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
