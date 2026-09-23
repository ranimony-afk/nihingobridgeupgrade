import { NextRequest, NextResponse } from "next/server";
import {
  UnifiedSearchService,
  ALL_SEARCH_TARGETS,
  type SearchTarget,
} from "@/services/search";

export const dynamic = "force-dynamic";

function parseTargets(raw: string | null): SearchTarget[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const valid = requested.filter((value): value is SearchTarget =>
    (ALL_SEARCH_TARGETS as readonly string[]).includes(value)
  );
  return valid.length > 0 ? valid : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const targets = parseTargets(params.get("targets") || params.get("target"));
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const offsetRaw = Number.parseInt(params.get("offset") ?? "", 10);

  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : undefined;

  try {
    const result = await UnifiedSearchService.search(query, {
      targets,
      jlptLevel: level,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Unified search request error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Search failed",
        },
      },
      { status: 500 }
    );
  }
}
