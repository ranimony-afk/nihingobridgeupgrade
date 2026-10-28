import { NextRequest, NextResponse } from "next/server";
import {
  UnifiedSearchService,
  ALL_SEARCH_TARGETS,
  sanitizeSearchQuery,
  type SearchTarget,
} from "@/services/search";
import {
  codePointLength,
  errorBody,
  MAX_SEARCH_QUERY_LENGTH,
  parseBoundedInt,
  parseOffset,
} from "@/lib/api/routeParams";
import {
  MAX_UNIFIED_LEVEL_LENGTH,
  MAX_UNIFIED_SEARCH_RESULTS,
  MAX_UNIFIED_TARGET_PARAMETER_LENGTH,
} from "@/services/search/limits";

export const dynamic = "force-dynamic";

function parseTargets(raw: string | null): SearchTarget[] | undefined {
  if (!raw) return undefined;
  const requested = raw.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const valid = requested.filter((value): value is SearchTarget =>
    (ALL_SEARCH_TARGETS as readonly string[]).includes(value)
  );
  return valid.length > 0 ? [...new Set(valid)] : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(params.get("q") ?? "");
  const rawTargets = params.get("targets") || params.get("target");
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");

  if (codePointLength(query) > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      errorBody("QUERY_TOO_LONG", `Query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`),
      { status: 400 }
    );
  }
  if (rawTargets && rawTargets.length > MAX_UNIFIED_TARGET_PARAMETER_LENGTH) {
    return NextResponse.json(errorBody("INVALID_TARGETS", "Target list is too long"), { status: 400 });
  }
  if (level && codePointLength(level) > MAX_UNIFIED_LEVEL_LENGTH) {
    return NextResponse.json(errorBody("INVALID_JLPT_LEVEL", "Level is too long"), { status: 400 });
  }
  if (
    (rawLimit !== null && !/^\d{1,10}$/.test(rawLimit)) ||
    (rawOffset !== null && !/^\d{1,10}$/.test(rawOffset)) ||
    (rawLimit !== null && Number(rawLimit) < 1)
  ) {
    return NextResponse.json(
      errorBody("INVALID_PAGINATION", "limit must be positive and offset must be non-negative integers"),
      { status: 400 }
    );
  }

  try {
    const result = await UnifiedSearchService.search(query, {
      targets: parseTargets(rawTargets),
      jlptLevel: level,
      limit: parseBoundedInt(rawLimit, { fallback: 20, min: 1, max: MAX_UNIFIED_SEARCH_RESULTS }),
      offset: parseOffset(rawOffset),
    });
    return NextResponse.json({ success: true, data: result });
  } catch {
    // Do not expose or log exception details, SQL, or connection strings.
    console.error("GET /api/search failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Search failed"), { status: 500 });
  }
}
