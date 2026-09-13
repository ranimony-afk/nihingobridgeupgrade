import { NextResponse } from "next/server";

import { getGrammarPoint } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/grammar/te-shimau
 * Full grammar point: patterns, corpus examples with match offsets,
 * related points and kanji/vocabulary cross links.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const point = await getGrammarPoint(decodeURIComponent(slug).trim());
  if (!point) {
    return NextResponse.json({ error: `grammar point '${slug}' not found` }, { status: 404 });
  }
  return NextResponse.json(point);
}
