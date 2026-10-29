import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import {
  authenticateActor,
  queryIdentityFailureResponse,
  selfIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { resolveQueryIdentity, resolveSelfIdentity } from "@/lib/auth/learningIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: the actor is resolved before the query string is read, and
   * a `userId` naming anyone else is refused rather than served. */
  const auth = await authenticateActor("Failed to list cards");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const identity = resolveQueryIdentity(auth.actor, sp.getAll("userId"));
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const cards = await SrsService.queryCards({
      deckId: sp.get("deckId") || undefined,
      userId: identity.userId,
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
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: cards are created in the ACTOR's own deck. The body carries
   * no identity claim, so there is nothing to shadow the verified actor. */
  const auth = await authenticateActor("Failed to create card");
  if (!auth.ok) return auth.response;

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
      actorUserId: auth.actor.id,
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
