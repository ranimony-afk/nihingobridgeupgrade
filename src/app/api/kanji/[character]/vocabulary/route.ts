import { NextRequest, NextResponse } from "next/server";
import { kanjiLexicalGraphService } from "@/services/knowledge/kanjiLexicalGraphService";
import {
  errorBody,
  isBooleanFlagInputValid,
  isKanjiRouteCharacter,
  parseBooleanFlag,
  parseLimit,
} from "@/lib/api/routeParams";

export const dynamic = "force-dynamic";

/** GET /api/kanji/[character]/vocabulary — bounded vocabulary collection. */
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

  const search = request.nextUrl.searchParams;
  const rawLimit = search.get("limit");
  const rawCommon = search.get("commonOnly");
  if (rawLimit !== null && !/^-?\d+$/.test(rawLimit)) {
    return NextResponse.json(errorBody("INVALID_PAGINATION", "limit must be an integer"), {
      status: 400,
    });
  }
  if (rawLimit !== null && Number(rawLimit) < 1) {
    return NextResponse.json(errorBody("INVALID_PAGINATION", "limit must be positive"), {
      status: 400,
    });
  }
  if (!isBooleanFlagInputValid(rawCommon)) {
    return NextResponse.json(
      errorBody("INVALID_BOOLEAN", "commonOnly must be 'true' or 'false'"),
      { status: 400 }
    );
  }

  try {
    const vocabulary = await kanjiLexicalGraphService.getKanjiVocabulary(character, {
      limit: parseLimit(rawLimit),
      isCommonOnly: parseBooleanFlag(rawCommon),
    });
    return NextResponse.json({
      success: true,
      character,
      total: vocabulary.length,
      vocabulary,
    });
  } catch {
    console.error("GET /api/kanji/[character]/vocabulary failed");
    return NextResponse.json(errorBody("INTERNAL_ERROR", "Failed to load kanji vocabulary"), {
      status: 500,
    });
  }
}
