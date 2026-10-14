import { NextRequest, NextResponse } from "next/server";
import { errorBody, isKanjiRouteCharacter } from "@/lib/api/routeParams";
import { kanjiVisualService } from "@/services/knowledge/kanjiVisualService";

// The largest renderable route-valid asset in the pinned r20240807 corpus is
// 6,294 UTF-8 bytes; 16 KiB leaves >2x headroom while bounding the response.
export const MAX_STROKE_ORDER_SVG_BYTES = 16 * 1024;

/** GET /api/kanji/[character]/stroke-order — render the existing KanjiVG service output. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  let character: string;
  try {
    // Next supplies the already-decoded route segment; do not decode it twice.
    character = (await params).character;
  } catch {
    return NextResponse.json(
      errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"),
      { status: 400 }
    );
  }

  if (!isKanjiRouteCharacter(character)) {
    return NextResponse.json(
      errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"),
      { status: 400 }
    );
  }

  try {
    const diagramSvg = kanjiVisualService.renderStrokeOrderDiagram(character);
    if (typeof diagramSvg !== "string" || diagramSvg.trim().length === 0) {
      return NextResponse.json(
        errorBody(
          "STROKE_ORDER_UNAVAILABLE",
          "No usable KanjiVG stroke-order asset is available for this character"
        ),
        { status: 404 }
      );
    }

    if (Buffer.byteLength(diagramSvg, "utf8") > MAX_STROKE_ORDER_SVG_BYTES) {
      return NextResponse.json(
        errorBody(
          "STROKE_ORDER_TOO_LARGE",
          "The stroke-order diagram exceeds the supported size limit"
        ),
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, character, diagramSvg });
  } catch {
    console.error("GET /api/kanji/[character]/stroke-order failed");
    return NextResponse.json(
      errorBody("STROKE_ORDER_RENDER_FAILED", "Could not render the stroke-order diagram"),
      { status: 500 }
    );
  }
}
