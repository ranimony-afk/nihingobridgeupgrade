import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody, isKanjiRouteCharacter } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";
const MAX_COMPONENT_RESULTS = 200;

/** GET /api/kanji/[character]/components — structural parts and primary radical. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  let character: string;
  try {
    character = (await params).character;
  } catch {
    return NextResponse.json(errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"), {
      status: 400,
    });
  }
  if (!isKanjiRouteCharacter(character)) {
    return NextResponse.json(errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"), {
      status: 400,
    });
  }

  try {
    const [components, radicals] = await Promise.all([
      kanjiLexicalGraphService.getKanjiComponents(character),
      kanjiLexicalGraphService.getKanjiRadicals(character),
    ]);
    return NextResponse.json({
      success: true,
      character,
      componentCount: components.length,
      components: components.slice(0, MAX_COMPONENT_RESULTS),
      radicals,
    });
  } catch {
    console.error("GET /api/kanji/[character]/components failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Failed to load kanji components"), {
      status: 500,
    });
  }
}
