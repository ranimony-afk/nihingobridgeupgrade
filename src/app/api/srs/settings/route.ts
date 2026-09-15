import { NextRequest, NextResponse } from "next/server";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import { resolveDayWindow } from "@/services/srs/dailyQueueService";
import { DEFAULT_DAILY_SETTINGS } from "@/services/srs/dailyQueueService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "anonymous-user";
    const settings = await DailyQueueService.getSettings(userId);

    // Echo back the resolved day so the UI can explain the cutoff instantly.
    const day = resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);

    return NextResponse.json({
      success: true,
      settings,
      defaults: DEFAULT_DAILY_SETTINGS,
      resolvedDay: day,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    console.error("GET /api/srs/settings error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body?.userId || "anonymous-user";

    const settings = await DailyQueueService.updateSettings(userId, {
      timezone: body.timezone,
      dayCutoffHour: body.dayCutoffHour,
      dailyNewTarget: body.dailyNewTarget,
      dailyReviewTarget: body.dailyReviewTarget,
      maxDailyReviews: body.maxDailyReviews,
      maxDailyNew: body.maxDailyNew,
      loadBalanceBacklog: body.loadBalanceBacklog,
      forecastDays: body.forecastDays,
    });

    const day = resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);

    return NextResponse.json({
      success: true,
      message: "Daily scheduling settings updated",
      settings,
      resolvedDay: day,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    console.error("PUT /api/srs/settings error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
