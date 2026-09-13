import { DictionarySearch, DictionarySearchError } from "@/services/knowledge/DictionarySearch";
import { DictionaryService } from "@/services/knowledge/DictionaryService";
import type { DictionaryV2ApiError } from "@/types/dictionary-v2";

export const dynamic = "force-dynamic";

const search = new DictionarySearch();
const dictionaryService = new DictionaryService();

function invalid(message: string): Response {
  return Response.json(
    { error: { code: "INVALID_QUERY", message } } satisfies DictionaryV2ApiError,
    { status: 400 },
  );
}

/**
 * GET /api/v2/dictionary/search?q=<Japanese|kana|romaji|English>&jlpt=N1..N5
 *
 * `q` is optional only when `jlpt` is supplied. Results are stable v2 domain
 * contracts produced by DictionaryService; this handler has no DB access.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = search.parseV2(
      url.searchParams.get("q"),
      url.searchParams.get("limit"),
      url.searchParams.get("jlpt"),
    );
    const payload = await dictionaryService.searchV2(query);
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    if (error instanceof DictionarySearchError) return invalid(error.message);
    console.error("v2 dictionary search error", error);
    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to search the dictionary.",
        },
      } satisfies DictionaryV2ApiError,
      { status: 500 },
    );
  }
}
