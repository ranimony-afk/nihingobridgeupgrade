import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";

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
  try {
    const { id: sessionId } = await params;
    const result = await SessionService.undo({ sessionId });

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
