import { NextRequest, NextResponse } from "next/server";
import { ProgressEngine } from "@/services/learning/progress-engine";

export const dynamic = "force-dynamic";

/** GET: Full progress dashboard or specific view. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view"); // "dashboard", "stats", "mastery", "streak", "studyTime", "jlpt"

  switch (view) {
    case "stats":
      return NextResponse.json({ success: true, data: await ProgressEngine.getOverallStats(learnerId) });
    case "mastery":
      return NextResponse.json({ success: true, data: await ProgressEngine.getMasteryOverview(learnerId) });
    case "streak":
      return NextResponse.json({ success: true, data: await ProgressEngine.getStreak(learnerId) });
    case "studyTime": {
      const days = Number(p.get("days") ?? "7");
      return NextResponse.json({ success: true, data: await ProgressEngine.getStudyTime(learnerId, days) });
    }
    case "jlpt":
      return NextResponse.json({ success: true, data: await ProgressEngine.getJlptSummary(learnerId) });
    default: {
      const dashboard = await ProgressEngine.getDashboard(learnerId);
      return NextResponse.json({ success: true, data: dashboard });
    }
  }
}

/** POST: Record events. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  switch (action) {
    case "lessonComplete":
      await ProgressEngine.recordLessonCompletion(learnerId, {
        lessonId: body.lessonId,
        score: body.score,
        accuracy: body.accuracy,
        timeSpentSeconds: body.timeSpentSeconds,
        xpEarned: body.xpEarned,
      });
      return NextResponse.json({ success: true, data: { recorded: true } });

    case "reviewSession":
      await ProgressEngine.recordReviewSession(learnerId, body.reviewCount, body.xpEarned, body.timeSpentSeconds);
      return NextResponse.json({ success: true, data: { recorded: true } });

    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}
