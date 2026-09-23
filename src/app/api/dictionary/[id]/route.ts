import { NextRequest, NextResponse } from "next/server";
import { DictionaryService } from "@/services/dictionary";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing entry identifier" },
        { status: 400 }
      );
    }

    const detail = await DictionaryService.getEntryDetail(decodeURIComponent(id));
    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error: any) {
    console.error("GET /api/dictionary/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to load entry",
        },
      },
      { status: 500 }
    );
  }
}
