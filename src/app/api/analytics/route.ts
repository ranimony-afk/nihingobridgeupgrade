import { NextRequest, NextResponse } from "next/server";
import {
  resolveQueryIdentity,
  resolveSelfIdentity,
} from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  queryIdentityFailureResponse,
  selfIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";
import { AnalyticsService } from "@/services/analytics";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics — aggregated learning progress for ONE learner.
 *
 * Authorization (Phase 26B): the caller must hold a verified identity and may
 * read only its OWN summary; an omitted `userId` resolves to the actor, a
 * foreign one is 403, an empty or repeated one is 400. Authentication runs
 * before the query string and before any database access, and the
 * `anonymous-user` fallback is gone.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateActor("Failed to load progress summary");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const identity = resolveQueryIdentity(auth.actor, params.getAll("userId"));
  if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

  try {
    const summary = await AnalyticsService.getUserProgressSummary(identity.userId);
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    // `error.message` here was doubly unsafe: the message carries the failing
    // SQL and its bound parameters, and reading `.message` on a thrown `null`
    // or `undefined` threw inside the catch, bypassing sanitization entirely.
    // The thrown value is now only classified — never read, never logged.
    logOperationFailure("error", "AnalyticsService.getUserProgressSummary", error);
    return NextResponse.json(
      { success: false, error: "Failed to load progress summary", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/analytics — record a study event (and its XP award).
 *
 * Authorization (Phase 25): the caller must hold a verified identity, and the
 * event is always recorded against THAT identity. A body `userId` naming
 * another user is refused with 403 before any write; `trackStudyEvent` derives
 * its dedupe key from the same id, so the two cannot disagree.
 */
export async function POST(request: NextRequest) {
  // Authorization first: no anonymous caller reaches the body parser, the
  // analytics aggregates, or the XP ledger behind them.
  const auth = await authenticateActor("Failed to track study event");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { userId: claimedUserId, itemType, itemId, jlptLevel, timeSpentMs } = body;

    const identity = resolveSelfIdentity(auth.actor, claimedUserId);
    if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

    if (!itemType || !itemId) {
      return NextResponse.json(
        { success: false, error: "itemType and itemId are required" },
        { status: 400 }
      );
    }

    const result = await AnalyticsService.trackStudyEvent({
      // Verified identity, not `body.userId`; no "anonymous-user" fallback.
      userId: identity.userId,
      itemType,
      itemId,
      jlptLevel,
      timeSpentMs,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    // `error: any` + `error.message` was doubly unsafe: the driver message
    // carries the failing SQL and its bound parameters, and reading `.message`
    // on a thrown `null`/`undefined` threw INSIDE the catch, escaping the
    // handler entirely. The thrown value is now only classified.
    logOperationFailure("error", "AnalyticsService.trackStudyEvent", error);
    return NextResponse.json(
      { success: false, error: "Failed to track study event", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
