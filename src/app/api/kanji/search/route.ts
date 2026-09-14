import { NextResponse } from "next/server";

import { searchKanji } from "@/services/knowledge/kanji";

export const dynamic = "force-dynamic";

/** GET /api/kanji/search?q=語&limit=24 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limitParam = Number(url.searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 24;

  if (!query.trim()) {
    return NextResponse.json({ query, total: 0, results: [], tookMs: 0 });
  }

  const response = await searchKanji(query, limit);
  return NextResponse.json(response, {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
