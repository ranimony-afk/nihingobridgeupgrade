import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const cards = await SrsService.queryCards({
      deckId: sp.get("deckId") || undefined,
      userId: sp.get("userId") || undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0,
    });
    return NextResponse.json({ success: true, total: cards.total, cards: cards.cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list cards";
    console.error("GET /api/srs/cards error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deckId, front, back, reading, meaning, hint, cardType, sourceType } = body;

    if (!deckId || !front || !back) {
      return NextResponse.json(
        { success: false, error: "deckId, front and back are required" },
        { status: 400 }
      );
    }

    const card = await SrsService.createCard({
      deckId,
      front,
      back,
      reading,
      meaning,
      hint,
      cardType,
      sourceType,
    });

    if (!card) {
      return NextResponse.json({ success: false, error: "Deck not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, card }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create card";
    console.error("POST /api/srs/cards error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
