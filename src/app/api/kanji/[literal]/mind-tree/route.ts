import { NextResponse } from "next/server";

import { buildMindTree } from "@/services/knowledge/mind-tree";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ literal: string }> };

/**
 * GET /api/kanji/語/mind-tree?depth=2&vocabulary=12&derivatives=8
 *
 * The response is a tree (nodes + edges) built exclusively from the canonical
 * knowledge graph in PostgreSQL. No layout or relationship data is hard coded.
 */
export async function GET(request: Request, context: RouteContext) {
  const { literal } = await context.params;
  const decoded = decodeURIComponent(literal).trim();
  if (!decoded) {
    return NextResponse.json({ error: "literal is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const depthParam = Number(url.searchParams.get("depth") ?? "2");
  const vocabularyParam = Number(url.searchParams.get("vocabulary") ?? "12");
  const derivativesParam = Number(url.searchParams.get("derivatives") ?? "8");

  const tree = await buildMindTree(decoded, {
    depth: Number.isFinite(depthParam) ? depthParam : 2,
    vocabularyLimit: Number.isFinite(vocabularyParam) ? vocabularyParam : 12,
    derivativesLimit: Number.isFinite(derivativesParam) ? derivativesParam : 8,
  });

  if (!tree) {
    return NextResponse.json({ error: `kanji '${decoded}' not found` }, { status: 404 });
  }

  return NextResponse.json(tree);
}
