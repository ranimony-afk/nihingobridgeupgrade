import { NextRequest, NextResponse } from "next/server";
import { JLPTEngine, type JlptLevel } from "@/services/learning/jlpt-engine";

export const dynamic = "force-dynamic";

/** GET: Dashboard (all levels), single level overview, or readiness. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const level = p.get("level") ? (Number(p.get("level")) as JlptLevel) : undefined;
  const learnerId = p.get("learnerId") ?? undefined;
  const view = p.get("view"); // "dashboard", "readiness", "history"

  if (view === "dashboard" || !level) {
    const dashboard = await JLPTEngine.getDashboard(learnerId);
    return NextResponse.json({ success: true, data: dashboard });
  }

  if (view === "readiness" && learnerId) {
    const readiness = await JLPTEngine.getReadiness(level, learnerId);
    return NextResponse.json({ success: true, data: readiness });
  }

  if (view === "history" && learnerId) {
    const history = await JLPTEngine.getHistory(learnerId, level);
    return NextResponse.json({ success: true, data: history });
  }

  const overview = await JLPTEngine.getOverview(level, learnerId);
  return NextResponse.json({ success: true, data: overview });
}

/** POST: Generate mock test or grade. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, level, learnerId = "demo-learner" } = body;

  switch (action) {
    case "mockTest": {
      const test = await JLPTEngine.generateMockTest(level as JlptLevel);
      // Strip internal question data for client
      const clientSafe = {
        ...test,
        sections: test.sections.map(({ _questions, ...sec }) => sec),
        _gradeKey: Buffer.from(JSON.stringify(
          test.sections.reduce((acc, sec) => {
            acc[sec.name] = sec._questions;
            return acc;
          }, {} as Record<string, unknown>),
        )).toString("base64"),
      };
      return NextResponse.json({ success: true, data: clientSafe });
    }

    case "grade": {
      const questions = JSON.parse(Buffer.from(body._gradeKey, "base64").toString());
      const result = await JLPTEngine.gradeMockTest(
        level as JlptLevel, learnerId,
        body.answers, questions, body.timeUsedSeconds ?? 0,
      );
      return NextResponse.json({ success: true, data: result });
    }

    default:
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
        { status: 400 },
      );
  }
}
