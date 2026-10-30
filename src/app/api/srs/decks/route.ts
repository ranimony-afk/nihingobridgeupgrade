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

  /* Phase 26F-E4: decks are one learner's own. Previously an omitted `userId`
   * listed the shared sentinel's decks. */
  const auth = await authenticateActor("Failed to list decks");
  if (!auth.ok) return auth.response;

  try {
    const identity = resolveQueryIdentity(
      auth.actor,
      request.nextUrl.searchParams.getAll("userId")
    );
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const decks = await SrsService.listDecks(identity.userId);
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

  /* Phase 26F-E4: a deck is created for the verified actor. A body `userId`
   * may restate the actor but never name a different owner. */
  const auth = await authenticateActor("Failed to create deck");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { name, description, jlptLevel, schedulerKey, schedulerParams, userId } = body;

    const identity = resolveSelfIdentity(auth.actor, userId);
    if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "name is required" }, { status: 400 });
    }

    const deck = await SrsService.createDeck({
      name,
      description,
      jlptLevel,
      schedulerKey,
      schedulerParams,
      ownerId: identity.userId,
    });

    return NextResponse.json({ success: true, deck }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create deck";
    console.error("POST /api/srs/decks error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
