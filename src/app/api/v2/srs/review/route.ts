import { NextRequest, NextResponse } from "next/server";
import { ReviewSession } from "@/services/srs/review-session";
import type { Rating } from "@/services/srs/algorithm";

export const dynamic = "force-dynamic";

/** Review session actions. */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  try {
    switch (action) {
      case "start": {
        const { sessionId, session } = await ReviewSession.start(body.deckId, learnerId);
        return NextResponse.json({ success: true, data: { sessionId, ...session } });
      }
      case "flip": {
        const card = await ReviewSession.flip(body.sessionId);
        if (!card) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "No card to flip" } }, { status: 404 });
        return NextResponse.json({ success: true, data: card });
      }
      case "rate": {
        const result = await ReviewSession.rate(body.sessionId, body.rating as Rating, learnerId);
        if (!result) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "No card to rate" } }, { status: 404 });
        // Return next card state along with rating result
        const session = await ReviewSession.getSession(body.sessionId);
        return NextResponse.json({ success: true, data: { result, session } });
      }
      case "session": {
        const session = await ReviewSession.getSession(body.sessionId);
        if (!session) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } }, { status: 404 });
        return NextResponse.json({ success: true, data: session });
      }
      case "complete": {
        const summary = await ReviewSession.complete(body.sessionId);
        if (!summary) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Session not found" } }, { status: 404 });
        return NextResponse.json({ success: true, data: summary });
      }
      case "undo": {
        const undone = await ReviewSession.undo(body.sessionId, learnerId);
        return NextResponse.json({ success: true, data: { undone } });
      }
      default:
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } }, { status: 500 });
  }
}
