import type { NextRequest } from "next/server";

import { jsonOk, notFound, optionsHandler, withHeaders, badRequest } from "@/lib/api/http";
import { clientId, rateLimit } from "@/lib/api/rate-limit";
import { getGrammarPoint } from "@/services/knowledge/grammar";
import type { GrammarPointDetail } from "@/types/grammar";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const ALLOWED_INCLUDES = [
  "patterns",
  "examples",
  "related",
  "kanji",
  "vocabulary",
  "structures",
  "mistakes",
] as const;
type IncludeKey = (typeof ALLOWED_INCLUDES)[number];

/**
 * GET /api/grammar/[slug]?include=examples,related
 *
 * Full grammar point. `include` lets mobile clients trim the payload
 * (default: everything).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const limiter = rateLimit(`grammar:detail:${clientId(request)}`);
  if (!limiter.allowed) {
    return withHeaders(badRequest("Too many requests, slow down"), limiter.headers);
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug).trim();
  if (!decoded) {
    return withHeaders(badRequest("Slug must not be empty"), limiter.headers);
  }

  const includeParam = new URL(request.url).searchParams.get("include");
  const include = includeParam
    ? (includeParam
        .split(",")
        .map((part) => part.trim())
        .filter((part): part is IncludeKey =>
          (ALLOWED_INCLUDES as readonly string[]).includes(part),
        ) as IncludeKey[])
    : [...ALLOWED_INCLUDES];

  const point = await getGrammarPoint(decoded);
  if (!point) return withHeaders(notFound(`grammar point '${decoded}'`), limiter.headers);

  const payload = shape(point, include);
  return withHeaders(
    jsonOk(payload, { meta: { slug: decoded, include } }),
    limiter.headers,
  );
}

function shape(point: GrammarPointDetail, include: IncludeKey[]) {
  const base = {
    id: point.id,
    slug: point.slug,
    title: point.title,
    titleEn: point.titleEn,
    summary: point.summary,
    explanation: point.explanation,
    formation: point.formation,
    notes: point.notes,
    jlptLevel: point.jlptLevel,
    register: point.register,
    exampleCount: point.exampleCount,
    tags: point.tags,
    patterns: point.patterns,
    structures: point.structures,
    mistakes: point.mistakes,
    neighbours: point.neighbours,
    provenance: point.provenance,
  };

  const extras: Partial<GrammarPointDetail> = {};
  if (include.includes("patterns")) extras.patternDetails = point.patternDetails;
  if (include.includes("examples")) extras.examples = point.examples;
  if (include.includes("related")) extras.related = point.related;
  if (include.includes("kanji")) extras.kanji = point.kanji;
  if (include.includes("vocabulary")) extras.vocabulary = point.vocabulary;

  return { ...base, ...extras };
}

export const OPTIONS = optionsHandler;
