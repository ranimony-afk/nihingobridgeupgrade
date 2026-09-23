import { NextRequest, NextResponse } from "next/server";
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
  } catch (error: any) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load progress summary" },
      { status: 500 }
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
