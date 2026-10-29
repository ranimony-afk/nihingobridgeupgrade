import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import { getScheduler, resolveParams } from "@/services/srs/scheduler";
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

/**
 * GET /api/srs/queue
 * Returns the cards currently due, each annotated with the algorithm that
 * will schedule it and the exact parameters that will be applied.
 */
export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: the due queue is one learner's own cards. */
  const auth = await authenticateActor("Failed to load due queue");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const identity = resolveQueryIdentity(auth.actor, sp.getAll("userId"));
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const { queue, totalDue } = await SrsService.getDueQueue({
      userId: identity.userId,
      deckId: sp.get("deckId") || undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 20,
    });

    const annotated = queue.map((card) => {
      const scheduler = getScheduler(card.schedulerKey);
      // Deck-level params govern grading; card rows carry state only.
      const params = resolveParams(scheduler, null);
      return {
        ...card,
        scheduler: {
          key: scheduler.key,
          name: scheduler.name,
          shortName: scheduler.shortName,
          version: scheduler.version,
          paramsApplied: params,
        },
      };
    });

    return NextResponse.json({
      success: true,
      totalDue,
      returned: annotated.length,
      queue: annotated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load due queue";
    console.error("GET /api/srs/queue error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
