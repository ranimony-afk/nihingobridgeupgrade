import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import {
  detectSearchScript,
  sanitizeSearchQuery,
} from "@/services/search/matcher";
import {
  errorBody,
  isBooleanFlagInputValid,
  MAX_SEARCH_QUERY_LENGTH,
  parseBooleanFlag,
  parseLimit,
  parseOffset,
} from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";
const JLPT_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);

/** GET /api/dictionary/search — bounded, read-only lookup. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(params.get("q") ?? "");
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const rawCommon = params.get("common");
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");

  if (!query) {
    return NextResponse.json(errorBody("MISSING_QUERY", "Query parameter 'q' is required"), {
      status: 400,
    });
  }
  if (Array.from(query).length > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      errorBody("QUERY_TOO_LONG", `Query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`),
      { status: 400 }
    );
  }
  if (level && !JLPT_LEVELS.has(level)) {
    return NextResponse.json(errorBody("INVALID_JLPT_LEVEL", "JLPT level must be N5 through N1"), {
      status: 400,
    });
  }
  if (!isBooleanFlagInputValid(rawCommon)) {
    return NextResponse.json(errorBody("INVALID_BOOLEAN", "common must be 'true' or 'false'"), {
      status: 400,
    });
  }
  // Malformed numeric values fail closed to the documented default. Valid high
  // values are clamped by the shared helper; the service applies its own cap.
  if (
    (rawLimit !== null && !/^-?\d+$/.test(rawLimit)) ||
    (rawOffset !== null && !/^-?\d+$/.test(rawOffset))
  ) {
    return NextResponse.json(errorBody("INVALID_PAGINATION", "limit and offset must be integers"), {
      status: 400,
    });
  }
  if ((rawLimit !== null && Number(rawLimit) < 1) || (rawOffset !== null && Number(rawOffset) < 0)) {
    return NextResponse.json(
      errorBody("INVALID_PAGINATION", "limit must be positive and offset must be non-negative"),
      { status: 400 }
    );
  }

  try {
    const result = await DictionaryService.searchEntries({
      query,
      jlptLevel: level,
      isCommon: parseBooleanFlag(rawCommon),
      limit: parseLimit(rawLimit),
      offset: parseOffset(rawOffset),
    });

    return NextResponse.json({
      success: true,
      data: {
        query,
        detectedScript: detectSearchScript(query),
        appliedJlptLevel: level ?? null,
        ...result,
      },
    });
  } catch {
    // Do not return database/SQL exception messages to an API caller.
    console.error("GET /api/dictionary/search failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Dictionary search failed"), {
      status: 500,
    });
  }
}
