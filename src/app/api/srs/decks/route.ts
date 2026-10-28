import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "anonymous-user";
    const decks = await SrsService.listDecks(userId);
    return NextResponse.json({ success: true, count: decks.length, decks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list decks";
    console.error("GET /api/srs/decks error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();
  try {
    const body = await request.json();
    const { name, description, jlptLevel, schedulerKey, schedulerParams, userId } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    const deck = await SrsService.createDeck({
      name,
      description,
      jlptLevel,
      schedulerKey,
      schedulerParams,
      ownerId: userId,
    });

    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create deck";
    console.error("POST /api/srs/decks error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
