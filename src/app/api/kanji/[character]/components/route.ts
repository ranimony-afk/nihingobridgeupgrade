import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/**
 * GET /api/kanji/[character]/components
 *
 * Phase 14.4F-R. Structural decomposition for the kanji, assembled from the
 * verified 14.4E knowledge graph:
 *
 *   components — composition parts (kanji_composition), each with its role
 *   radicals   — canonical radical primitives (kanji_radicals)
 *
 * Both are returned because they are distinct relationships in the 14.4E model:
 * a radical is a canonical indexing primitive, whereas a component is a
 * structural part of this specific character. They overlap but are not
 * interchangeable, and callers generally need both to render a decomposition.
 *
 * Read-only. No canonical mutation.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  try {
    const { character } = await params;
    const decoded = decodeURIComponent(character);

    const [components, radicals] = await Promise.all([
      kanjiLexicalGraphService.getKanjiComponents(decoded),
      kanjiLexicalGraphService.getKanjiRadicals(decoded),
    ]);

    return NextResponse.json({
      success: true,
      character: decoded,
      componentCount: components.length,
      components,
      radicals,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load kanji components";
    console.error("GET /api/kanji/[character]/components error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
  }
}
