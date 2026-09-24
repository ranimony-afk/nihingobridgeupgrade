import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/**
 * GET /api/kanji/[character]/readings
 *
 * Phase 14.4F-R. On'yomi and Kun'yomi readings for the kanji, classified into
 * structured categories by the verified 14.4E reading model (okurigana stem /
 * suffix separated, primary reading flagged).
 *
 * These are *possible* readings for the character — they are NOT a claim about
 * the reading used in any particular word or sentence. Sentence-level reading
 * attribution requires canonical vocabulary linkage and is out of scope here.
 *
 * Query:
 *   type  optional filter: "on" | "kun" | "all" (default "all")
 *
 * Read-only. No canonical mutation.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  try {
    const { character } = await params;
    const decoded = decodeURIComponent(character);

    const rawType = (request.nextUrl.searchParams.get("type") || "all")
      .trim()
      .toLowerCase();

    // Map the friendly query value onto the controlled ReadingClassificationType
    // values ("ON" | "KUN" | ...). Anything unrecognised means "no filter".
    const typeFilter: "all" | "ON" | "KUN" =
      rawType === "on" ? "ON" : rawType === "kun" ? "KUN" : "all";

    const readings = await kanjiLexicalGraphService.getKanjiReadings(decoded);

    const filtered =
      typeFilter === "all" ? readings : readings.filter((r) => r.type === typeFilter);

    return NextResponse.json({
      success: true,
      character: decoded,
      appliedTypeFilter: typeFilter,
      total: filtered.length,
      readings: filtered,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load kanji readings";
    console.error("GET /api/kanji/[character]/readings error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
  }
}
