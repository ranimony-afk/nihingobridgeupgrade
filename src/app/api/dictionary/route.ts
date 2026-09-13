import { DictionarySearch, DictionarySearchError } from "@/services/knowledge/DictionarySearch";
import { DictionaryService } from "@/services/knowledge/DictionaryService";
import type { ApiError } from "@/types/dictionary";

export const dynamic = "force-dynamic";

const search = new DictionarySearch();
const dictionaryService = new DictionaryService();

function invalid(message: string): Response {
  const payload: ApiError = { error: { code: "INVALID_QUERY", message } };
  return Response.json(payload, { status: 400 });
}

/**
 * GET /api/dictionary?q=水&limit=12
 *
 * Stable, API-first dictionary search endpoint. This handler deliberately
 * depends only on the canonical service — no UI component queries Drizzle.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = search.parse(url.searchParams.get("q"), url.searchParams.get("limit"));
    const payload = await dictionaryService.search(query);
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    if (error instanceof DictionarySearchError) return invalid(error.message);
    console.error("dictionary search error", error);
    const payload: ApiError = {
      error: { code: "INTERNAL_ERROR", message: "Unable to search the dictionary." },
    };
    return Response.json(payload, { status: 500 });
  }
}
