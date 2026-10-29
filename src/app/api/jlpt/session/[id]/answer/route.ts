import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/jlpt/session/[id]/answer — record one answer in the caller's own
 * session.
 *
 * Phase 26F-E2. Before this, `saveAnswer(sessionId, …)` inserted/updated
 * `test_answers` with no session lookup at all: any caller could write answers
 * into any learner's in-progress exam, changing their score and their XP.
 *
 * The service now resolves the session under
 * `id = :id AND user_id = :actor` before touching `test_answers`, and performs
 * no write when that resolution fails.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Authorization before the body is read. */
  const auth = await authenticateActor("Failed to save answer");
  if (!auth.ok) return auth.response;

  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { questionId, selectedAnswer, starOrderSubmitted, timeSpentSeconds, isFlagged } = body;

    if (!questionId) {
      return NextResponse.json(
        { success: false, error: "questionId is required", code: "VALIDATION_ERROR" },
        { status: 400, headers: NO_STORE }
      );
    }

    /* `false` means "not your session (or no such session)": nothing was written. */
    const saved = await TestService.saveAnswer(sessionId, auth.actor.id, {
      questionId,
      selectedAnswer,
      starOrderSubmitted,
      timeSpentSeconds: timeSpentSeconds || 0,
      isFlagged: Boolean(isFlagged),
    });

    if (!saved) {
      return NextResponse.json(
        { success: false, error: "Session not found", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { success: true, message: "Answer recorded" },
      { headers: NO_STORE }
    );
  } catch (error) {
    logOperationFailure("error", "TestService.saveAnswer", error);
    return NextResponse.json(
      { success: false, error: "Failed to save answer", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
