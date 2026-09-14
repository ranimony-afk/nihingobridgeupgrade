import { NextRequest, NextResponse } from "next/server";
import { DailyQueueService } from "@/services/srs/dailyQueueService";

export const dynamic = "force-dynamic";

/**
 * GET /api/srs/daily
 * The day-scoped due queue: buckets (overdue / due today / later today / new),
 * today's progress against targets, streak, forecast, and a load-balanced
 * recommendation that can be posted straight to the session planner.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const queue = await DailyQueueService.getDailyQueue({
      userId: sp.get("userId") || undefined,
      deckId: sp.get("deckId") || null,
      historyDays: sp.get("historyDays") ? parseInt(sp.get("historyDays")!, 10) : undefined,
    });

    return NextResponse.json({ success: true, ...queue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build daily queue";
    console.error("GET /api/srs/daily error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
