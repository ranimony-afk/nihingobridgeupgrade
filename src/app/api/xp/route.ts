import { NextRequest, NextResponse } from "next/server";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";
import { XpService } from "@/services/gamification/xpService";
import { listRules, XP_RULE_COUNT, xpAtLevel, MAX_LEVEL } from "@/services/gamification/xpRegistry";
import { XpEventPayload, XpEventType, XP_EVENT_TYPES } from "@/types/gamification";

export const dynamic = "force-dynamic";

/** GET /api/xp — summary: total, level, trend, sources, cap usage, ledger. */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const userId = sp.get("userId") || "anonymous-user";
    const historyDays = sp.get("historyDays") ? parseInt(sp.get("historyDays")!, 10) : 14;

    const summary = await XpService.getSummary(userId, historyDays);

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
 */
export async function POST(request: NextRequest) {
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

  try {
    const payload: XpEventPayload = {
      ...(body as unknown as XpEventPayload),
      eventType: eventType as XpEventType,
      userId: (body.userId as string) || "anonymous-user",
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

/** DELETE /api/xp?dedupeKey=... — revoke a previously granted award. */
export async function DELETE(request: NextRequest) {
  try {
    const dedupeKey = request.nextUrl.searchParams.get("dedupeKey");
    if (!dedupeKey) {
      return NextResponse.json({ success: false, error: "dedupeKey is required" }, { status: 400 });
    }

    const result = await XpService.revokeByDedupeKey(
      dedupeKey,
      request.nextUrl.searchParams.get("reason") || "manual-revoke"
    );

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
