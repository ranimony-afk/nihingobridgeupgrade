import { KanjiSearch, KanjiSearchError } from "@/services/knowledge/KanjiSearch";
import { KanjiService } from "@/services/knowledge/KanjiService";
import type { KanjiApiError } from "@/types/kanji-v2";

export const dynamic = "force-dynamic";

const kanjiSearch = new KanjiSearch();
const kanjiService = new KanjiService();

function invalid(message: string): Response {
  return Response.json(
    { error: { code: "INVALID_QUERY", message } } satisfies KanjiApiError,
    { status: 400 },
  );
}

/**
 * GET /api/v2/kanji/search
 *
 * Query by `q` (kanji literal, English meaning, or kana/romaji reading) and/or
 * filter by `strokes`, `grade`, `radical`, `jlpt`, `component`. Supports
 * `limit`/`offset` pagination.
 *
 * This handler has no database access; it delegates to the canonical service.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = kanjiSearch.parse({
      q: params.get("q"),
      limit: params.get("limit"),
      offset: params.get("offset"),
      strokes: params.get("strokes"),
      grade: params.get("grade"),
      radical: params.get("radical"),
      jlpt: params.get("jlpt"),
      component: params.get("component"),
      components: params.get("components"),
    });

    const payload = await kanjiService.search(query);
    return Response.json(payload, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (error) {
    if (error instanceof KanjiSearchError) return invalid(error.message);
    console.error("v2 kanji search error", error);
    return Response.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Unable to search kanji." },
      } satisfies KanjiApiError,
      { status: 500 },
    );
  }
}
