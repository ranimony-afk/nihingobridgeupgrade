import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { QuizEngine } from "@/services/quiz/engine";
import { JLPTLevel, Question } from "@/types/quiz";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/jlpt/session/[id]/results — computed results for the caller's own
 * session.
 *
 * Phase 26F-E2. The handler built results from `getSessionState(id)` — a
 * primary-key read — so any caller with a session id could reconstruct another
 * learner's exam outcome, including per-question correctness.
 *
 * The read is now actor-scoped in the service; a foreign session is answered
 * exactly like a missing one.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateActor("Failed to retrieve results");
  if (!auth.ok) return auth.response;

  try {
    const { id: sessionId } = await params;

    /* Actor-scoped read: a foreign session resolves to `null`. */
    const sessionState = await TestService.getSessionState(sessionId, auth.actor.id);

    if (!sessionState) {
      return NextResponse.json(
        { success: false, error: "Session not found", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE }
      );
    }

    const { session, answers, questions } = sessionState;

    let title = "JLPT Practice Quiz";
    if (session.testId) {
      const testData = await TestService.getTestById(session.testId);
      if (testData) title = testData.test.title;
    }

    const results = QuizEngine.calculateFullExamResult({
      sessionId,
      testId: session.testId,
      title,
      jlptLevel: session.jlptLevel as JLPTLevel,
      quizType: session.quizType,
      isTimed: session.isTimed,
      timeLimitSeconds: session.timeLimitSeconds,
      startedAt: session.startedAt,
      completedAt: session.completedAt || new Date(),
      questions,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer || undefined,
        starOrderSubmitted: (a.starOrderSubmitted as string[]) || undefined,
        timeSpentSeconds: a.timeSpentSeconds || 0,
        isFlagged: a.isFlagged,
      })),
    });

    return NextResponse.json(
      {
        success: true,
        results,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logOperationFailure("error", "TestService.getSessionState", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve results", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
