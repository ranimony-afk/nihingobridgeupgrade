import { DictionaryService } from "@/services/knowledge/DictionaryService";
import type { DictionaryV2ApiError } from "@/types/dictionary-v2";

export const dynamic = "force-dynamic";

const dictionaryService = new DictionaryService();

function errorResponse(
  code: DictionaryV2ApiError["error"]["code"],
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } } satisfies DictionaryV2ApiError, { status });
}

/**
 * GET /api/v2/dictionary/entries/:id/detail
 *
 * Full detail-page aggregate: readings, meanings, JLPT, kanji breakdown,
 * example sentences (with per-sentence attribution), conjugations, related
 * entries and an explicit audio availability state.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) {
    return errorResponse("INVALID_ID", "Dictionary entry ID must be a positive integer.", 400);
  }
  const id = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(id) || id < 1) {
    return errorResponse("INVALID_ID", "Dictionary entry ID must be a positive integer.", 400);
  }

  try {
    const detail = await dictionaryService.getDetail(id);
    if (!detail) return errorResponse("NOT_FOUND", "Dictionary entry not found.", 404);
    return Response.json(
      { apiVersion: "v2", ...detail },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (error) {
    console.error("v2 dictionary detail error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load the dictionary entry.", 500);
  }
}
