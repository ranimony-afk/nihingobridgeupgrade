import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const autocompleteMode = params.get("autocomplete") === "true";
  const level = params.get("level")?.trim() || params.get("jlpt")?.trim() || undefined;
  const commonOnlyRaw = params.get("common");
  const isCommon = commonOnlyRaw === "true" ? true : commonOnlyRaw === "false" ? false : undefined;

  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const offsetRaw = Number.parseInt(params.get("offset") ?? "", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : undefined;

  try {
    if (autocompleteMode) {
      const suggestions = await DictionaryService.autocomplete(query, limit ?? 8);
      return NextResponse.json({
        success: true,
        data: suggestions,
      });
    }

    const result = await DictionaryService.searchEntries({
      query,
      jlptLevel: level,
      isCommon,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("GET /api/dictionary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Dictionary search failed",
        },
      },
      { status: 500 }
    );
  }
}
