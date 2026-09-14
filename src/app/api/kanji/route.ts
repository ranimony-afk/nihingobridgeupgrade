import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

export const dynamic = "force-dynamic";

/** GET /api/kanji — list kanji, optionally filtered by JLPT level or element. */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const result = await KnowledgeService.listKanji({
      level: sp.get("level") || undefined,
      elementId: sp.get("elementId") || undefined,
      keyword: sp.get("q") || undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 200,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0,
    });

    const elements = sp.get("includeElements") === "1"
      ? await KnowledgeService.listElements(sp.get("elementCategory") || undefined)
      : undefined;

    return NextResponse.json({
      success: true,
      total: result.total,
      kanji: result.kanji,
      ...(elements ? { elements } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kanji";
    console.error("GET /api/kanji error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
