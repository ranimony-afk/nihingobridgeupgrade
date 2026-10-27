import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";
import {
  MAX_DICTIONARY_AUTOCOMPLETE_RESULTS,
  MAX_DICTIONARY_RESULTS,
} from "@/lib/dictionary/limits";
import {
  codePointLength,
  errorBody,
  isBooleanFlagInputValid,
  MAX_OFFSET,
  MAX_SEARCH_QUERY_LENGTH,
  parseBooleanFlag,
  parseBoundedInt,
} from "@/lib/api/routeParams";
import { isDictionaryJlptLevel } from "@/lib/dictionary/searchState";
import { sanitizeSearchQuery } from "@/services/search/matcher";

export const dynamic = "force-dynamic";

function validInteger(raw: string | null, minimum: number): boolean {
  return raw === null || (/^\d{1,10}$/.test(raw) && Number(raw) >= minimum);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(params.get("q") ?? "");
  const rawAutocomplete = params.get("autocomplete");
  const rawCommon = params.get("common");
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;

  if (codePointLength(query) > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      errorBody("QUERY_TOO_LONG", `Query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`),
      { status: 400 }
    );
  }
  if (level && !isDictionaryJlptLevel(level)) {
    return NextResponse.json(errorBody("INVALID_JLPT_LEVEL", "JLPT level must be N5 through N1"), { status: 400 });
  }
  if (!isBooleanFlagInputValid(rawAutocomplete) || !isBooleanFlagInputValid(rawCommon)) {
    return NextResponse.json(errorBody("INVALID_BOOLEAN", "Flags must be 'true' or 'false'"), { status: 400 });
  }
  if (!validInteger(rawLimit, 1) || !validInteger(rawOffset, 0)) {
    return NextResponse.json(
      errorBody("INVALID_PAGINATION", "limit must be a positive integer and offset a non-negative integer"),
      { status: 400 }
    );
  }

  const autocompleteMode = parseBooleanFlag(rawAutocomplete) === true;
  const limit = parseBoundedInt(rawLimit, {
    fallback: autocompleteMode ? 8 : 25,
    min: 1,
    max: autocompleteMode ? MAX_DICTIONARY_AUTOCOMPLETE_RESULTS : MAX_DICTIONARY_RESULTS,
  });
  const offset = parseBoundedInt(rawOffset, { fallback: 0, min: 0, max: MAX_OFFSET });

  try {
    if (autocompleteMode) {
      const suggestions = await DictionaryService.autocomplete(query, limit);
      return NextResponse.json({ success: true, data: suggestions });
    }

    const result = await DictionaryService.searchEntries({
      query,
      jlptLevel: level,
      isCommon: parseBooleanFlag(rawCommon),
      limit,
      offset,
    });
    return NextResponse.json({ success: true, data: result });
  } catch {
    // Never disclose SQL, connection details, or exception text to visitors.
    console.error("GET /api/dictionary failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Dictionary search failed"), { status: 500 });
  }
}
