import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import {
  detectSearchScript,
  sanitizeSearchQuery,
} from "@/services/search/matcher";
import { parseLimit, parseOffset, parseBooleanFlag, errorBody } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/**
 * GET /api/dictionary/search
 *
 * Phase 14.4F-R. Explicit dictionary search contract (see
 * docs/architecture/DICTIONARY-SEARCH-ARCHITECTURE.md).
 *
 * Distinguished from /api/dictionary by intent, not by implementation:
 *   /api/dictionary         — general listing / level filtering / autocomplete
 *   /api/dictionary/search  — query-driven lookup with an explicit, echoed
 *                             classification so clients can render the match
 *                             mode instead of guessing at it
 *
 * Query:
 *   q            required, non-empty after sanitisation
 *   level|jlpt   optional JLPT filter (N5..N1)
 *   common       "true" | "false"
 *   limit        1..200 (default 50); the underlying service clamps to 100
 *   offset       0..100000
 *
 * Read-only. No canonical mutation. Ranking is deterministic and performed by
 * the existing dictionary service — no AI ranking is applied here.
 *
 * Note on pagination: request bounds are enforced in two layers. This route
 * rejects out-of-range values via parseLimit; DictionaryService then applies its
 * own tighter ceiling. The response echoes the values actually applied, so
 * clients should read them back rather than assume their request was honoured.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(params.get("q") ?? "");
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const isCommon = parseBooleanFlag(params.get("common"));
  const limit = parseLimit(params.get("limit"));
  const offset = parseOffset(params.get("offset"));

  if (!query) {
    return NextResponse.json(errorBody("MISSING_QUERY", "Query parameter 'q' is required"), {
      status: 400,
    });
  }

  try {
    // Classification is computed here and echoed so the client contract is
    // explicit and testable, rather than re-derived client-side.
    const detectedScript = detectSearchScript(query);

    const result = await DictionaryService.searchEntries({
      query,
      jlptLevel: level,
      isCommon,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: {
        query,
        detectedScript,
        appliedJlptLevel: level ?? null,
        // `limit`/`offset` are intentionally NOT set here: DictionaryService
        // clamps them (its own ceiling is 100, lower than MAX_PAGE_LIMIT) and
        // echoes the values it actually applied. Response values are therefore
        // authoritative rather than a restatement of the request.
        ...result,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dictionary search failed";
    console.error("GET /api/dictionary/search error:", error);
    return NextResponse.json(errorBody("INTERNAL_ERROR", message), { status: 500 });
  }
}
