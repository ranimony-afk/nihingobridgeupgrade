import { resolveKanjiSegment } from "@/lib/japanese";
import { KanjiService } from "@/services/knowledge/KanjiService";
import type { KanjiApiError } from "@/types/kanji-v2";

export const dynamic = "force-dynamic";

const kanjiService = new KanjiService();

function errorResponse(
  code: KanjiApiError["error"]["code"],
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } } satisfies KanjiApiError, { status });
}

/** GET /api/v2/kanji/:literal — full kanji detail with components and vocabulary. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ literal: string }> },
) {
  const { literal: rawLiteral } = await params;

  // Tolerates both encoded and already-decoded route segments.
  const literal = resolveKanjiSegment(rawLiteral);
  if (literal === null) {
    return errorResponse(
      "INVALID_LITERAL",
      "Kanji literal must be exactly one CJK ideograph.",
      400,
    );
  }

  try {
    const detail = await kanjiService.getByLiteral(literal);
    if (!detail) {
      return errorResponse("NOT_FOUND", "Kanji character not found.", 404);
    }
    return Response.json(detail, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    console.error("v2 kanji detail error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load the kanji character.", 500);
  }
}
