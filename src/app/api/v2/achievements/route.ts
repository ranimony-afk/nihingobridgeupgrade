import { NextRequest, NextResponse } from "next/server";
import { AchievementEngine } from "@/services/gamification/achievements";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view"); // "all", "unseen"

  if (view === "unseen") {
    return NextResponse.json({ success: true, data: await AchievementEngine.getUnseen(learnerId) });
  }

  const all = await AchievementEngine.getAll(learnerId);
  const unlocked = all.filter((a) => a.unlocked);
  const locked = all.filter((a) => !a.unlocked);
  return NextResponse.json({
    success: true,
    data: { achievements: all, unlocked: unlocked.length, total: all.length },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  switch (action) {
    case "seed": {
      const count = await AchievementEngine.seed();
      return NextResponse.json({ success: true, data: { seeded: count } });
    }
    case "check": {
      const unlocks = await AchievementEngine.checkAndUnlock(learnerId);
      return NextResponse.json({ success: true, data: { newUnlocks: unlocks, count: unlocks.length } });
    }
    case "markSeen": {
      const updated = await AchievementEngine.markSeen(learnerId, body.achievementIds ?? []);
      return NextResponse.json({ success: true, data: { updated } });
    }
    default:
      return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } }, { status: 400 });
  }
}
