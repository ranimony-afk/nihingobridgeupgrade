import { NextRequest, NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/auth";
import {
  resolveQueryIdentity,
  resolveSelfIdentity,
} from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  authorizationFailureResponse,
  queryIdentityFailureResponse,
  selfIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";
import { XpService } from "@/services/gamification/xpService";
import { listRules, XP_RULE_COUNT, xpAtLevel, MAX_LEVEL } from "@/services/gamification/xpRegistry";
import { XpEventPayload, XpEventType, XP_EVENT_TYPES } from "@/types/gamification";

export const dynamic = "force-dynamic";

/**
 * GET /api/xp — summary: total, level, trend, sources, cap usage, ledger.
 *
 * Authorization (Phase 26B): XP totals are one learner's data. The caller must
 * hold a verified identity and may read only its OWN ledger — an omitted
 * `userId` resolves to the actor, a foreign one is 403, an empty or repeated
 * one is 400. Authentication runs before the query string is interpreted and
 * before any database access, so an anonymous caller cannot reach the summary
 * (or use this route as a read oracle). There is no `anonymous-user` fallback
 * left on this path.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateActor("Failed to load XP summary");
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const identity = resolveQueryIdentity(auth.actor, sp.getAll("userId"));
  if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

  try {
    const historyDays = sp.get("historyDays") ? parseInt(sp.get("historyDays")!, 10) : 14;

    const summary = await XpService.getSummary(identity.userId, historyDays);

    return NextResponse.json({
      success: true,
      summary,
      rules: listRules(),
      registry: {
        ruleCount: XP_RULE_COUNT,
        eventTypes: XP_EVENT_TYPES,
        maxLevel: MAX_LEVEL,
      },
      architecture: {
        model:
          "Append-only XP ledger. Totals, levels, streaks and cap usage are derived by summing xp_events; nothing is stored as a mutable counter.",
        idempotency:
          "Each event carries a UNIQUE dedupe_key derived from its source entity, so replaying a domain event (including a Phase 11.4 sync replay) never double-awards.",
        reversal:
          "Undoing a review revokes its XP via revoked_at rather than deleting the row, keeping the ledger auditable.",
      },
    });
  } catch (error) {
    // A failing Drizzle query carries its SQL text, bound parameters, driver
    // `detail`/`hint` and connection target in `message`, and the raw object
    // carries the stack plus a `cause` chain. Neither the response nor the log
    // may echo any of it: clients get a stable message with the internal error
    // code, operators get a classified diagnostic. Same convention as
    // GET /api/questions and GET /api/search.
    logOperationFailure("error", "XpService.getSummary", error);
    return NextResponse.json(
      { success: false, error: "Failed to load XP summary", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/xp — award XP for a domain event.
 * Used by clients (and the Flutter app) to report events the server
 * did not originate. Always idempotent via dedupeKey.
 *
 * Authorization (Phase 25): the caller must hold a verified identity, and the
 * XP is always awarded to THAT identity. The body may name the caller's own id
 * (explicit self-report) but naming anyone else is refused with 403 — before
 * any read or write — instead of being written into the ledger.
 */
export async function POST(request: NextRequest) {
  // Authorization comes FIRST: before the body is parsed, so an anonymous
  // caller cannot reach validation, the ledger, or any indirect mutation, and
  // cannot use validation messages as an unauthenticated oracle.
  const auth = await authenticateActor("Failed to award XP");
  if (!auth.ok) return auth.response;

  // Body parsing is kept OUT of the mutation's try block on purpose. A
  // malformed body is a client error and must stay a 400 — it must not be
  // reported as an internal failure, and the parser's own message (which
  // quotes the offending input) must not be echoed back.
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const eventType = body?.eventType;

  if (typeof eventType !== "string" || !XP_EVENT_TYPES.includes(eventType as XpEventType)) {
    return NextResponse.json(
      { success: false, error: `eventType must be one of: ${XP_EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // The claimed id is compared against the verified actor; a foreign claim is
  // refused here, so a rejected request performs zero writes below.
  const identity = resolveSelfIdentity(auth.actor, body.userId);
  if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

  try {
    const payload: XpEventPayload = {
      ...(body as unknown as XpEventPayload),
      eventType: eventType as XpEventType,
      // Verified identity, not `body.userId`: the payload can no longer be
      // aimed at another user, and there is no "anonymous-user" fallback left
      // to write unattributable rows.
      userId: identity.userId,
    };

    const result = await XpService.award({
      payload,
      dedupeKey: body.dedupeKey as string | undefined,
      params: (body.params as Record<string, unknown> | undefined) ?? null,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    // A failed award is a server-side failure, not a client error: the ledger
    // write never happened, so this must not answer 400 or report success. The
    // thrown value carries SQL, bound parameters and the connection target, so
    // it is classified and never echoed or logged.
    logOperationFailure("error", "XpService.award", error);
    return NextResponse.json(
      { success: false, error: "Failed to award XP", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * DELETE /api/xp?dedupeKey=... — revoke a previously granted award.
 *
 * Authorization (Phase 25): authenticated callers may revoke their OWN ledger
 * event only. Ownership is read from the stored row (`XpService.findEventOwner`)
 * and compared with the verified actor; a key belonging to another user is
 * refused with 403 before the update runs, and an unknown key keeps the
 * pre-existing `{ success: true, revoked: false }` contract.
 *
 * Since Phase 26A the dedupe rule is `(user_id, dedupe_key)`, so the same key
 * may exist for several learners: ownership is resolved within the caller's
 * own ledger and the revoke is scoped to it.
 *
 * A `userId` query parameter is ignored: query strings are never identity.
 * Legacy rows written under the old `anonymous-user` fallback have no owner and
 * are therefore not revocable through this route (fail closed).
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateActor("Failed to revoke XP");
  if (!auth.ok) return auth.response;

  try {
    const dedupeKey = request.nextUrl.searchParams.get("dedupeKey");
    if (!dedupeKey) {
      return NextResponse.json({ success: false, error: "dedupeKey is required" }, { status: 400 });
    }

    /* Ownership, in two steps (Phase 26A).
     *
     * The dedupe rule is `(user_id, dedupe_key)`, so the same key may exist
     * for several learners. The scoped lookup answers "does the caller own
     * this key?" without ever being confused by somebody else's row; the
     * unscoped lookup runs only when the caller does not, and only to tell an
     * unknown key (`revoked:false`) from a foreign one (403). No branch
     * writes anything. */
    const owner = await XpService.findEventOwner(dedupeKey, auth.actor.id);
    if (owner !== null && owner !== auth.actor.id) {
      return authorizationFailureResponse(new AuthorizationError(403));
    }
    /* Phase 26F-E3: the unscoped probe has its own name now, so it cannot be
     * mistaken for an ownership check. Its result is compared to null and never
     * leaves this block — returning it would name another learner. */
    if (owner === null && (await XpService.findEventOwnerUnscoped(dedupeKey)) !== null) {
      return authorizationFailureResponse(new AuthorizationError(403));
    }

    // Scoped to the caller: revoking one user's key must not revoke another
    // user's identically-keyed event.
    const result = await XpService.revokeByDedupeKey({
      dedupeKey,
      ownerUserId: auth.actor.id,
      reason: request.nextUrl.searchParams.get("reason") || "manual-revoke",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // A failed revoke leaves the ledger untouched: report a server-side
    // failure, never a 400, and never echo the driver's message.
    logOperationFailure("error", "XpService.revokeByDedupeKey", error);
    return NextResponse.json(
      { success: false, error: "Failed to revoke XP", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
