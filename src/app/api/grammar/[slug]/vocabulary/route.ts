import type { NextRequest } from "next/server";

import { jsonOk, notFound, optionsHandler, withHeaders, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getGrammarPoint } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/grammar/[slug]/vocabulary
 * Dictionary entries whose writing realises one of the point's patterns.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:vocabulary:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const point = await getGrammarPoint(decoded);
  if (!point) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  return withHeaders(
    jsonOk(
      {
        point: { id: point.id, slug: point.slug, title: point.title },
        vocabulary: point.vocabulary,
      },
      { meta: { total: point.vocabulary.length } },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
