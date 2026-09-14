import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";
import { SRS_RATINGS, SrsRating } from "@/types/srs";

export const dynamic = "force-dynamic";

/**
 * POST — grade the card at the session cursor.
 * Order is enforced so a stale or duplicated client cannot desync the session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { cardId, rating, timeSpentMs } = body;

    if (!cardId) {
      return NextResponse.json({ success: false, error: "cardId is required" }, { status: 400 });
    }
    if (!rating || !SRS_RATINGS.includes(rating as SrsRating)) {
      return NextResponse.json(
        { success: false, error: `rating must be one of: ${SRS_RATINGS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await SessionService.answer({
      sessionId,
      cardId,
      rating: rating as SrsRating,
      timeSpentMs,
    });

    if (!result) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record answer";
    console.error("POST /api/srs/sessions/[id]/answer error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
