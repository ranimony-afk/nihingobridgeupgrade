import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";

export const dynamic = "force-dynamic";

/** GET — full session state: current card, rating previews, progress, recent answers. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: session state is the owner's data; a foreign id is 404. */
  const auth = await authenticateActor("Failed to load session");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const state = await SessionService.getSessionState(id, auth.actor.id);

    if (!state) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load session";
    console.error("GET /api/srs/sessions/[id] error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** PATCH — complete or abandon the session. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: completing/abandoning a session is an owner-only write. */
  const auth = await authenticateActor("Failed to update session");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "abandon") {
      const session = await SessionService.abandonSession(id, auth.actor.id, body?.reason);
      if (!session) {
        return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, session });
    }

    if (action === "complete") {
      const session = await SessionService.completeSession(id, auth.actor.id);
      if (!session) {
        return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, session });
    }

    return NextResponse.json(
      { success: false, error: "action must be 'complete' or 'abandon'" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update session";
    console.error("PATCH /api/srs/sessions/[id] error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
