import { RadicalService } from "@/services/knowledge/RadicalService";
import type { RadicalApiError } from "@/types/radical-v2";

export const dynamic = "force-dynamic";

const radicalService = new RadicalService();

function errorResponse(
  code: RadicalApiError["error"]["code"],
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } } satisfies RadicalApiError, { status });
}

/** GET /api/v2/radicals/:number — radical detail plus the kanji that use it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number: rawNumber } = await params;

  if (!/^\d+$/.test(rawNumber)) {
    return errorResponse("INVALID_NUMBER", "Radical number must be an integer 1–214.", 400);
  }

  const number = Number.parseInt(rawNumber, 10);
  if (number < 1 || number > 214) {
    return errorResponse("INVALID_NUMBER", "Radical number must be an integer 1–214.", 400);
  }

  try {
    const detail = await radicalService.getByNumber(number);
    if (!detail) return errorResponse("NOT_FOUND", "Radical not found.", 404);
    return Response.json(detail, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch (error) {
    console.error("v2 radical detail error", error);
    return errorResponse("INTERNAL_ERROR", "Unable to load the radical.", 500);
  }
}
