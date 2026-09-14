import type { NextRequest } from "next/server";

import { badRequest, jsonOk, notFound, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getGrammarMistakes } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const SEVERITIES = ["common", "subtle", "critical"];

/**
 * GET /api/grammar/[slug]/mistakes?severity=critical
 * Curated learner errors: wrong sentence, correction and explanation.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:mistakes:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  const severityParam = new URL(request.url).searchParams.get("severity");
  const severity = severityParam && SEVERITIES.includes(severityParam) ? severityParam : undefined;

  const result = await getGrammarMistakes(decoded, { severity });
  if (!result) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  return withHeaders(
    jsonOk(result, { meta: { total: result.total, severity: severity ?? "all" } }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
