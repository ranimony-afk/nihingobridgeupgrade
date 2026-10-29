import { NextRequest, NextResponse } from "next/server";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import {
  authenticateActor,
  queryIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { resolveQueryIdentity } from "@/lib/auth/learningIdentity";

export const dynamic = "force-dynamic";

/**
 * GET /api/srs/daily
 * The day-scoped due queue: buckets (overdue / due today / later today / new),
 * today's progress against targets, streak, forecast, and a load-balanced
 * recommendation that can be posted straight to the session planner.
 */
export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: the daily view is one learner's schedule, streak and
   * forecast. An omitted `userId` resolves to the actor; a foreign one is
   * refused instead of served. */
  const auth = await authenticateActor("Failed to build daily queue");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const identity = resolveQueryIdentity(auth.actor, sp.getAll("userId"));
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const queue = await DailyQueueService.getDailyQueue({
      userId: identity.userId,
      deckId: sp.get("deckId") || null,
      historyDays: sp.get("historyDays") ? parseInt(sp.get("historyDays")!, 10) : undefined,
    });

    return NextResponse.json({ success: true, ...queue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build daily queue";
    console.error("GET /api/srs/daily error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
