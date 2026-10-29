import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";

export const dynamic = "force-dynamic";

/**
 * POST — revert the most recent answer in this session.
 * The card is restored from the review's immutable `state_before` snapshot,
 * then the review row is deleted so the derived cursor and counters revert.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: undo rewrites state, revokes XP and deletes a review row. */
  const auth = await authenticateActor("Failed to undo answer");
  if (!auth.ok) return auth.response;

  try {
    const { id: sessionId } = await params;
    const result = await SessionService.undo({ sessionId, actorUserId: auth.actor.id });

    if (!result) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to undo answer";
    console.error("POST /api/srs/sessions/[id]/undo error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
