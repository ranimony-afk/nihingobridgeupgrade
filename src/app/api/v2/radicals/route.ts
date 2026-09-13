import { RadicalService } from "@/services/knowledge/RadicalService";
import type { RadicalApiError } from "@/types/radical-v2";

export const dynamic = "force-dynamic";

const radicalService = new RadicalService();

/**
 * GET /api/v2/radicals            → full Kangxi radical index (grouped by strokes)
 * GET /api/v2/radicals?view=components → components present in the corpus
 */
export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get("view");

    if (view === "components") {
      const payload = await radicalService.getComponentIndex();
      return Response.json(payload, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
      });
    }

    if (view !== null && view !== "radicals") {
      return Response.json(
        {
          error: {
            code: "INVALID_QUERY",
            message: "view must be either 'radicals' or 'components'.",
          },
        } satisfies RadicalApiError,
        { status: 400 },
      );
    }

    const payload = await radicalService.getIndex();
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch (error) {
    console.error("v2 radical index error", error);
    return Response.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Unable to load radicals." },
      } satisfies RadicalApiError,
      { status: 500 },
    );
  }
}
