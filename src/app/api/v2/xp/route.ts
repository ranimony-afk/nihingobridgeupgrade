import { NextRequest, NextResponse } from "next/server";
import { XPEngine, type XPEventType } from "@/services/gamification/xp-engine";

export const dynamic = "force-dynamic";

/** GET: XP profile, history, leaderboard, or breakdown. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view"); // "profile", "history", "leaderboard", "breakdown"

  switch (view) {
    case "history":
      return NextResponse.json({ success: true, data: await XPEngine.getHistory(learnerId, Number(p.get("limit") ?? "20")) });
    case "leaderboard":
      return NextResponse.json({ success: true, data: await XPEngine.getLeaderboard(Number(p.get("limit") ?? "20")) });
    case "breakdown":
      return NextResponse.json({ success: true, data: await XPEngine.getBreakdown(learnerId) });
    default:
      return NextResponse.json({ success: true, data: await XPEngine.getProfile(learnerId) });
  }
}

/** POST: Emit an XP event. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { learnerId = "demo-learner", type, amount, sourceId, description, count } = body;

  if (!type) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "type is required" } },
      { status: 400 },
    );
  }

  const result = await XPEngine.emit(learnerId, {
    type: type as XPEventType,
    amount, sourceId, description, count,
  });

  return NextResponse.json({ success: true, data: result });
}
