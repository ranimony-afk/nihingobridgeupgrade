import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";

export const dynamic = "force-dynamic";

/** GET — full session state: current card, rating previews, progress, recent answers. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const state = await SessionService.getSessionState(id);

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
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "abandon") {
      const session = await SessionService.abandonSession(id, body?.reason);
      if (!session) {
        return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, session });
    }

    if (action === "complete") {
      const session = await SessionService.completeSession(id);
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
