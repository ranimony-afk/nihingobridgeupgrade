import { NextRequest, NextResponse } from "next/server";
import { SessionService, DEFAULT_SESSION_CONFIG } from "@/services/srs/sessionService";
import { SESSION_QUEUE_ORDERS, SessionQueueOrder, SessionStatus } from "@/types/srs";
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

/** GET /api/srs/sessions — session history + resumable pointer. */
export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: history, resume pointer and daily-budget usage are one
   * learner's own. An omitted `userId` resolves to the actor; a foreign one is
   * refused instead of served. */
  const auth = await authenticateActor("Failed to list sessions");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const identity = resolveQueryIdentity(auth.actor, sp.getAll("userId"));
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);
    const userId = identity.userId;
    const statusParam = sp.get("status") as SessionStatus | null;

    const [sessions, resumable] = await Promise.all([
      SessionService.listSessions({
        userId,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 15,
        status: statusParam || undefined,
      }),
      SessionService.getResumableSession(userId),
    ]);

    return NextResponse.json({
      success: true,
      count: sessions.length,
      sessions,
      resumable,
      dailyNewUsed: await SessionService.getDailyNewUsed(userId),
      defaults: DEFAULT_SESSION_CONFIG,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list sessions";
    console.error("GET /api/srs/sessions error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** POST /api/srs/sessions — plan a queue and open a resumable session. */
export async function POST(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: a planned session belongs to the verified actor. */
  const auth = await authenticateActor("Failed to plan session");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      userId,
      deckId,
      newLimit,
      reviewLimit,
      maxCards,
      order,
      dailyNewBudget,
    } = body;

    const identity = resolveSelfIdentity(auth.actor, userId);
    if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

    if (order && !SESSION_QUEUE_ORDERS.includes(order)) {
      return NextResponse.json(
        { success: false, error: `order must be one of: ${SESSION_QUEUE_ORDERS.join(", ")}` },
        { status: 400 }
      );
    }

    const dueHorizon = body?.dueHorizon === "day" ? "day" : "now";

    const { session, skipped } = await SessionService.planSession({
      userId: identity.userId,
      deckId: deckId ?? null,
      newLimit,
      reviewLimit,
      maxCards,
      order: order as SessionQueueOrder | undefined,
      dailyNewBudget,
      dueHorizon,
    });

    return NextResponse.json(
      { success: true, session, skipped, sessionId: session.id },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to plan session";
    console.error("POST /api/srs/sessions error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
