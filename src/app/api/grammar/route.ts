import { NextResponse } from "next/server";

import { getGrammarCatalog } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar?q=conditional&jlpt=3&tag=aspect&limit=48&offset=0
 * Canonical grammar catalogue contract (web + Flutter).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jlptParam = Number(url.searchParams.get("jlpt"));
  const limitParam = Number(url.searchParams.get("limit") ?? "48");
  const offsetParam = Number(url.searchParams.get("offset") ?? "0");

  const catalog = await getGrammarCatalog({
    query: url.searchParams.get("q") ?? "",
    jlptLevel: Number.isFinite(jlptParam) && jlptParam > 0 ? jlptParam : null,
    tag: url.searchParams.get("tag"),
    limit: Number.isFinite(limitParam) ? limitParam : 48,
    offset: Number.isFinite(offsetParam) ? offsetParam : 0,
  });

  return NextResponse.json(catalog, {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
