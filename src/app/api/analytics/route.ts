import { NextRequest, NextResponse } from "next/server";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";
import { AnalyticsService } from "@/services/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const userId = params.get("userId") || "anonymous-user";

  try {
    const summary = await AnalyticsService.getUserProgressSummary(userId);
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    // `error.message` here was doubly unsafe: the message carries the failing
    // SQL and its bound parameters, and reading `.message` on a thrown `null`
    // or `undefined` threw inside the catch, bypassing sanitization entirely.
    // The thrown value is now only classified — never read, never logged.
    logOperationFailure("error", "AnalyticsService.getUserProgressSummary", error);
    return NextResponse.json(
      { success: false, error: "Failed to load progress summary", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, itemType, itemId, jlptLevel, timeSpentMs } = body;

    if (!itemType || !itemId) {
      return NextResponse.json(
        { success: false, error: "itemType and itemId are required" },
        { status: 400 }
      );
    }

    const result = await AnalyticsService.trackStudyEvent({
      userId,
      itemType,
      itemId,
      jlptLevel,
      timeSpentMs,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("POST /api/analytics error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to track study event" },
      { status: 500 }
    );
  }
}
