import type { NextRequest } from "next/server";

import { jsonError, jsonOk, optionsHandler, withHeaders } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { grammarGraphQuery, parseQuery } from "@/lib/api/validate";
import { getGrammarMap } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar/graph?jlpt=4&relation=similar
 *
 * Relation graph (nodes + edges) for a level/tag slice — the same shape the
 * Kanji Mind Tree uses, so clients can render a "grammar map" with one decoder.
 */
export async function GET(request: NextRequest) {
  const limiter = rateLimit(`grammar:graph:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(
      jsonError(429, "rate_limited", "Too many requests, slow down"),
      limiter.headers,
    );
  }

  const parsed = parseQuery(new URL(request.url).searchParams, grammarGraphQuery);
  if (!parsed.ok) return withHeaders(parsed.response, limiter.headers);

  const { jlpt, tag, relation, limit } = parsed.data;
  const graph = await getGrammarMap({
    jlptLevel: jlpt ?? null,
    tag: tag ?? null,
    relation: relation ?? null,
    limit,
  });

  return withHeaders(
    jsonOk(graph, {
      meta: { nodes: graph.nodes.length, edges: graph.edges.length },
    }),
    limiter.headers,
  );
}

export const OPTIONS = optionsHandler;
