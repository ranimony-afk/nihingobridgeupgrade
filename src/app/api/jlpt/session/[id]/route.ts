import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/jlpt/session/[id] — restore a session the caller owns.
 *
 * Phase 26F-E2. Before this, `TestService.getSessionState(id)` selected on the
 * primary key alone, so any caller with a session id could read another
 * learner's exam: the session row, every saved answer, and the question set.
 *
 * Authorization is now two-layered:
 *   1. here — no anonymous caller proceeds at all;
 *   2. in the service — the row must match `user_id = <verified actor>`.
 *
 * A session owned by someone else and a session that does not exist produce the
 * SAME 404 envelope, so this endpoint cannot be used to test whether an id
 * exists. Legacy rows written before ownership existed have a NULL owner and
 * are therefore not served to anybody (fail closed); they are never reassigned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateActor("Failed to get session state");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;

    /* Actor-scoped read: ownership is part of the query, not a later check. */
    const sessionState = await TestService.getSessionState(id, auth.actor.id);

    if (!sessionState) {
      return NextResponse.json(
        { success: false, error: "Session not found", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        success: true,
        session: sessionState.session,
        answers: sessionState.answers,
        questions: sessionState.questions,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logOperationFailure("error", "TestService.getSessionState", error);
    return NextResponse.json(
      { success: false, error: "Failed to get session state", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
