import { NextRequest, NextResponse } from "next/server";
import { StreakService } from "@/services/gamification/streaks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view");

  if (view === "week") return NextResponse.json({ success: true, data: await StreakService.getWeek(learnerId) });
  if (view === "today") return NextResponse.json({ success: true, data: await StreakService.getTodayGoal(learnerId) });

  const streak = await StreakService.getStreak(learnerId);
  const today = await StreakService.getTodayGoal(learnerId);
  return NextResponse.json({ success: true, data: { streak, today } });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  switch (action) {
    case "setTarget":
      return NextResponse.json({ success: true, data: await StreakService.setDailyTarget(learnerId, body.targetXp ?? 20) });
    case "purchaseFreeze":
      return NextResponse.json({ success: true, data: await StreakService.purchaseFreeze(learnerId) });
    default:
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } }, { status: 400 });
  }
}
