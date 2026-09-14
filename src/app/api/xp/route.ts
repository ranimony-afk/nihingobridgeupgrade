import { NextRequest, NextResponse } from "next/server";
import { XpService } from "@/services/gamification/xpService";
import { listRules, XP_RULE_COUNT, xpAtLevel, MAX_LEVEL } from "@/services/gamification/xpRegistry";
import { XpEventPayload, XP_EVENT_TYPES } from "@/types/gamification";

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
    const message = error instanceof Error ? error.message : "Failed to load XP summary";
    console.error("GET /api/xp error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/xp — award XP for a domain event.
 * Used by clients (and the Flutter app) to report events the server
 * did not originate. Always idempotent via dedupeKey.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = body?.eventType;

    if (!eventType || !XP_EVENT_TYPES.includes(eventType)) {
      return NextResponse.json(
        { success: false, error: `eventType must be one of: ${XP_EVENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const payload: XpEventPayload = {
      ...body,
      eventType,
      userId: body.userId || "anonymous-user",
    };

    const result = await XpService.award({
      payload,
      dedupeKey: body.dedupeKey,
      params: body.params ?? null,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to award XP";
    console.error("POST /api/xp error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
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
    const message = error instanceof Error ? error.message : "Failed to revoke XP";
    console.error("DELETE /api/xp error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
