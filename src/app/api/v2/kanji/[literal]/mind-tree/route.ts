import { resolveKanjiSegment } from "@/lib/japanese";
import { MindTreeService } from "@/services/knowledge/MindTreeService";
import type { MindTreeApiError } from "@/types/mind-tree";

export const dynamic = "force-dynamic";

const mindTreeService = new MindTreeService();

function errorResponse(
  code: MindTreeApiError["error"]["code"],
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } } satisfies MindTreeApiError, {
    status,
  });
}

/**
 * GET /api/v2/kanji/:literal/mind-tree — relationship graph centred on one
 * kanji: classifying radical, KRADFILE components, vocabulary and related
 * kanji. Every node is projected from database relationships.
 */
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
    const tree = await mindTreeService.getByLiteral(literal);
    if (!tree) {
      return errorResponse("NOT_FOUND", "Kanji character not found.", 404);
    }
    return Response.json(tree, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    console.error("v2 kanji mind-tree error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load the mind tree.", 500);
  }
}
