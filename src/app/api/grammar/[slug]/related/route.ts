import type { NextRequest } from "next/server";

import { jsonOk, notFound, optionsHandler, withHeaders, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { grammarRelatedQuery, parseQuery } from "@/lib/api/validate";
import { getRelatedGrammarPoints } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/grammar/[slug]/related?relation=similar&depth=2&limit=24
 *
 * Breadth-first traversal of `grammar_relations`. `depth=2` also returns
 * neighbours of neighbours; each item reports its hop distance and whether the
 * relation was declared on this point (`inbound: false`) or the other one.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:related:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();

  const parsed = parseQuery(new URL(request.url).searchParams, grammarRelatedQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const { relation, depth, limit } = parsed.data;
  const result = await getRelatedGrammarPoints(decoded, { relation, depth, limit });
  if (!result) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  return withHeaders(
    jsonOk(
      { root: result.root, related: result.related },
      { meta: { depth, relation: relation ?? "all", total: result.related.length } },
    ),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
