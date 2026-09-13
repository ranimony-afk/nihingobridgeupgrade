import type { NextRequest } from "next/server";

import { badRequest, jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getGrammarStructures } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/** GET /api/grammar/[slug]/structures — ordered structural slots of a point. */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:structures:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const result = await getGrammarStructures(decoded);
  if (!result) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  return withHeaders(
    jsonOk(result, { meta: { total: result.structures.length } }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
