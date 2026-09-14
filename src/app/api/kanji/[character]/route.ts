import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

export const dynamic = "force-dynamic";

/**
 * GET /api/kanji/[character]
 * One kanji plus its assembled mind tree: components at depth 1 and the family
 * of kanji sharing those components at depth 2.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  try {
    const { character } = await params;
    const decoded = decodeURIComponent(character);

    const detail = await KnowledgeService.getKanjiDetail(decoded);
    if (!detail) {
      return NextResponse.json({ success: false, error: "Kanji not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load kanji detail";
    console.error("GET /api/kanji/[character] error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
