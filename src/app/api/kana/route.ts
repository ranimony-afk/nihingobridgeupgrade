import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

export const dynamic = "force-dynamic";

/**
 * GET /api/kana — the full interactive chart grid.
 * Query: ?script=hiragana|katakana&category=gojuon|dakuten|handakuten|yoon
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const keyword = sp.get("q");

    if (keyword) {
      const results = await KnowledgeService.searchKana(keyword);
      return NextResponse.json({ success: true, results, count: results.length });
    }

    const chart = await KnowledgeService.getKanaChart({
      script: (sp.get("script") as "hiragana" | "katakana") || undefined,
      category: sp.get("category") || undefined,
    });

    return NextResponse.json({ success: true, ...chart });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kana chart";
    console.error("GET /api/kana error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
