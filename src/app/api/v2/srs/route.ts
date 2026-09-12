import { NextRequest, NextResponse } from "next/server";
import { SRSService } from "@/services/srs/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const learnerId = p.get("learnerId") ?? "demo-learner";
  const view = p.get("view"); // "decks", "session", "stats", "forecast", "history"
  const deckId = p.get("deckId");

  if (view === "session" && deckId) {
    const session = await SRSService.getSession(deckId, learnerId);
    return NextResponse.json({ success: true, data: session });
  }
  if (view === "stats" && deckId) {
    return NextResponse.json({ success: true, data: await SRSService.getDeckStats(deckId) });
  }
  if (view === "forecast" && deckId) {
    return NextResponse.json({ success: true, data: await SRSService.getForecast(deckId) });
  }
  if (view === "history") {
    return NextResponse.json({ success: true, data: await SRSService.getReviewHistory(learnerId) });
  }

  const decks = await SRSService.getDecks(learnerId);
  return NextResponse.json({ success: true, data: decks });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, learnerId = "demo-learner" } = body;

  try {
    switch (action) {
      case "createDeck":
        return NextResponse.json({ success: true, data: await SRSService.createDeck(learnerId, body) }, { status: 201 });
      case "addCard":
        return NextResponse.json({ success: true, data: await SRSService.addCard(body.deckId, body) }, { status: 201 });
      case "review":
        return NextResponse.json({ success: true, data: await SRSService.submitReview(learnerId, body) });
      case "deleteDeck":
        return NextResponse.json({ success: true, data: { deleted: await SRSService.deleteDeck(body.deckId, learnerId) } });
      default:
        return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action: ${action}` } }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } }, { status: 500 });
  }
}
