import { DictionaryService } from "@/services/knowledge/DictionaryService";
import type { ApiError } from "@/types/dictionary";

export const dynamic = "force-dynamic";

const dictionaryService = new DictionaryService();

function errorResponse(
  code: ApiError["error"]["code"],
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status });
}

/**
 * GET /api/dictionary/:id
 * Returns a canonical entry aggregate plus its source provenance.
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
    const entry = await dictionaryService.getById(id);
    if (!entry) {
      return errorResponse("NOT_FOUND", "Dictionary entry not found.", 404);
    }
    return Response.json(entry, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    console.error("dictionary entry error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load the dictionary entry.", 500);
  }
}
