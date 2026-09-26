import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import { errorBody, isKanjiRouteCharacter } from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";
const MAX_READING_RESULTS = 200;

/** GET /api/kanji/[character]/readings — available on/kun readings only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ character: string }> }
) {
  let character: string;
  try {
    character = (await params).character;
  } catch {
    return NextResponse.json(errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"), {
      status: 400,
    });
  }
  if (!isKanjiRouteCharacter(character)) {
    return NextResponse.json(errorBody("INVALID_KANJI", "Expected one Unicode Kanji character"), {
      status: 400,
    });
  }

  const rawType = request.nextUrl.searchParams.get("type");
  const normalizedType = (rawType ?? "all").trim().toLowerCase();
  if (!new Set(["all", "on", "kun"]).has(normalizedType)) {
    return NextResponse.json(errorBody("INVALID_READING_TYPE", "type must be on, kun, or all"), {
      status: 400,
    });
  }
  const typeFilter = normalizedType === "on" ? "ON" : normalizedType === "kun" ? "KUN" : "all";

  try {
    const readings = await kanjiLexicalGraphService.getKanjiReadings(character);
    const filtered = typeFilter === "all" ? readings : readings.filter((r) => r.type === typeFilter);
    const bounded = filtered.slice(0, MAX_READING_RESULTS);
    return NextResponse.json({
      success: true,
      character,
      appliedTypeFilter: typeFilter,
      total: filtered.length,
      readings: bounded,
    });
  } catch {
    console.error("GET /api/kanji/[character]/readings failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Failed to load kanji readings"), {
      status: 500,
    });
  }
}
