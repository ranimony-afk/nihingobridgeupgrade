import { NextResponse } from "next/server";

import { searchDictionary } from "@/services/knowledge/vocabulary";

export const dynamic = "force-dynamic";

/** GET /api/dictionary/search?q=日本語 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limitParam = Number(url.searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 24;

  const results = query.trim() ? await searchDictionary(query, limit) : [];
  return NextResponse.json({ query, total: results.length, results });
}
