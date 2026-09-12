import { NextRequest, NextResponse } from "next/server";
import { TestEngine } from "@/services/learning/test-engine";

export const dynamic = "force-dynamic";

/** List available tests. */
export async function GET(request: NextRequest) {
  const jlpt = request.nextUrl.searchParams.get("jlpt") ? Number(request.nextUrl.searchParams.get("jlpt")) : undefined;
  const tests = await TestEngine.listTests({ jlpt });
  return NextResponse.json({ success: true, data: tests, meta: { total: tests.length } });
}

/** Test actions: start, answer, pause, resume, complete, review. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  try {
    switch (action) {
      case "start": {
        const session = await TestEngine.start(body.testId, learnerId);
        return NextResponse.json({ success: true, data: session }, { status: 201 });
      }
      case "session": {
        const session = await TestEngine.session(body.sessionId);
        return NextResponse.json({ success: true, data: session });
      }
      case "answer": {
        const result = await TestEngine.answer(body.sessionId, {
          questionId: body.questionId,
          answer: body.answer,
          timeSpentMs: body.timeSpentMs,
        });
        return NextResponse.json({ success: true, data: result });
      }
      case "pause": {
        const result = await TestEngine.pause(body.sessionId);
        return NextResponse.json({ success: true, data: result });
      }
      case "resume": {
        const session = await TestEngine.resume(body.sessionId);
        return NextResponse.json({ success: true, data: session });
      }
      case "complete": {
        const result = await TestEngine.complete(body.sessionId);
        return NextResponse.json({ success: true, data: result });
      }
      case "score": {
        const score = await TestEngine.score(body.sessionId);
        return NextResponse.json({ success: true, data: score });
      }
      case "review": {
        const items = await TestEngine.review(body.sessionId);
        return NextResponse.json({ success: true, data: items });
      }
      case "abandon": {
        await TestEngine.abandon(body.sessionId);
        return NextResponse.json({ success: true, data: { abandoned: true } });
      }
      default:
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message } },
      { status: 500 },
    );
  }
}
