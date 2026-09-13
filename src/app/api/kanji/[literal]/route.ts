import { NextResponse } from "next/server";

import { getKanjiDetail, getKanjiVocabulary } from "@/services/knowledge/kanji";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ literal: string }> };

/** GET /api/kanji/語 */
export async function GET(request: Request, context: RouteContext) {
  const { literal } = await context.params;
  const decoded = decodeURIComponent(literal).trim();
  if (!decoded) {
    return NextResponse.json({ error: "literal is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const includeVocabulary = url.searchParams.get("vocabulary") !== "false";

  const detail = await getKanjiDetail(decoded);
  if (!detail) {
    return NextResponse.json({ error: `kanji '${decoded}' not found` }, { status: 404 });
  }

  const vocabulary = includeVocabulary ? await getKanjiVocabulary(decoded, 24) : null;

  return NextResponse.json({
    kanji: detail,
    vocabulary: vocabulary?.entries ?? [],
  });
}
