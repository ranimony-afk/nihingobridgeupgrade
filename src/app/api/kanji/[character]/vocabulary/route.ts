import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import {
  parseLimit,
  parseBooleanFlag,
  errorBody,
} from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/**
 * GET /api/kanji/[character]/vocabulary
 *
 * Phase 14.4F-R. Vocabulary entries containing the given kanji, derived from
 * the verified 14.4E lexical graph. Each edge carries the 0-based character
 * position of the kanji within the headword, so callers can highlight it
 * without re-deriving position.
 *
 * Query:
 *   limit       1..200 (default 50)
 *   commonOnly  "true" | "false"
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

    const sp = request.nextUrl.searchParams;
    const limit = parseLimit(sp.get("limit"));
    const isCommonOnly = parseBooleanFlag(sp.get("commonOnly"));

    const edges = await kanjiLexicalGraphService.getKanjiVocabulary(decoded, {
      limit,
      isCommonOnly,
    });

    return NextResponse.json({
      success: true,
      character: decoded,
      total: edges.length,
      vocabulary: edges,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load kanji vocabulary";
    console.error("GET /api/kanji/[character]/vocabulary error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
  }
}
