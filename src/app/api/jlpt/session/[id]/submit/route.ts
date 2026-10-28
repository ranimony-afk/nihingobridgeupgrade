import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/jlpt/session/[id]/submit — grade the caller's own session.
 *
 * Phase 26F-E2. This was the most dangerous JLPT handler: `submitSession(id)`
 * looked the session up by primary key, wrote the final grade, updated
 * `user_analytics` for the session's owner, and awarded XP (including the daily
 * streak) to that owner's ledger — all from an unauthenticated request that
 * needed only a session id.
 *
 * The service now requires the verified actor and proves ownership before the
 * first write, so a foreign or NULL-owner session returns `null` having mutated
 * nothing: no grade, no analytics row, no XP event, no streak.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Authorization before the body is read. */
  const auth = await authenticateActor("Failed to submit session");
  if (!auth.ok) return auth.response;

  try {
    const { id: sessionId } = await params;
    let finalAnswers;

    try {
      const body = await request.json();
      finalAnswers = body?.answers;
    } catch {
      // Body might be empty
    }

    const results = await TestService.submitSession(
      sessionId,
      auth.actor.id,
      finalAnswers
    );

    if (!results) {
      return NextResponse.json(
        { success: false, error: "Session not found", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        success: true,
        results,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logOperationFailure("error", "TestService.submitSession", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit session", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
