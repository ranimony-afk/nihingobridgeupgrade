import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import { getScheduler, resolveParams } from "@/services/srs/scheduler";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rating = (request.nextUrl.searchParams.get("rating") || "good") as
      | "again"
      | "hard"
      | "good"
      | "easy";

    const decks = await SrsService.listDecks();
    const deck = decks.find((d) => d.id === id);

    if (!deck) {
      return NextResponse.json({ success: false, error: "Deck not found" }, { status: 404 });
    }

    const scheduler = getScheduler(deck.schedulerKey);
    const paramsApplied = resolveParams(scheduler, deck.schedulerParams);

    const preview = await SrsService.previewDeckScheduler(id, rating);

    return NextResponse.json({
      success: true,
      deck,
      scheduler: {
        key: scheduler.key,
        name: scheduler.name,
        shortName: scheduler.shortName,
        version: scheduler.version,
        description: scheduler.description,
        strengths: scheduler.strengths,
        paramFields: scheduler.paramFields,
        defaultParams: scheduler.defaultParams,
      },
      paramsApplied,
      ladder: preview?.ladder ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load deck";
    console.error("GET /api/srs/decks/[id] error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/srs/decks/[id]
 * Re-binds a deck to a different registered algorithm, or tunes its
 * parameters, at runtime. No migration and no data loss: card state columns
 * are an algorithm-agnostic superset.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, schedulerKey, schedulerParams } = body;

    const deck = await SrsService.updateDeck(id, {
      name,
      description,
      schedulerKey,
      schedulerParams,
    });

    if (!deck) {
      return NextResponse.json({ success: false, error: "Deck not found" }, { status: 404 });
    }

    const scheduler = getScheduler(deck.schedulerKey);

    return NextResponse.json({
      success: true,
      message: `Deck re-bound to ${scheduler.name} v${scheduler.version}`,
      deck,
      scheduler: {
        key: scheduler.key,
        name: scheduler.name,
        version: scheduler.version,
        paramFields: scheduler.paramFields,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update deck";
    console.error("PATCH /api/srs/decks/[id] error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
