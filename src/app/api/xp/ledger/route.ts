import { NextRequest, NextResponse } from "next/server";
import { resolveQueryIdentity } from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  queryIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";
import { XpService } from "@/services/gamification/xpService";
import { levelForXp, xpAtLevel, MAX_LEVEL } from "@/services/gamification/xpRegistry";

export const dynamic = "force-dynamic";

/**
 * GET /api/xp/ledger — paginated raw XP event feed, plus the level curve.
 *
 * Authorization (Phase 26C): the ledger is the rawest per-user disclosure in the
 * app — every event id, rule, source id, breakdown and timestamp — so it is
 * scoped exactly like the Phase 26B read routes. The caller must hold a
 * verified identity and may read only its OWN ledger; an omitted `userId`
 * resolves to the actor, a foreign one is 403, an empty/blank/repeated one is
 * 400. Authentication runs before the query string is read and before any
 * database access, and the `anonymous-user` fallback is gone.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateActor("Failed to load XP ledger");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const identity = resolveQueryIdentity(auth.actor, params.getAll("userId"));
  if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

  try {
    const { entries, total } = await XpService.getLedger({
      userId: identity.userId,
      limit: params.get("limit") ? parseInt(params.get("limit")!, 10) : 50,
      offset: params.get("offset") ? parseInt(params.get("offset")!, 10) : 0,
      eventType: params.get("eventType") || undefined,
    });

    const totalXp = await XpService.getTotalXp(identity.userId);

    /* First 20 levels of the curve, so the UI can chart progression. */
    const curve = Array.from({ length: Math.min(20, MAX_LEVEL) }, (_, i) => {
      const level = i + 1;
      return { level, xpRequired: xpAtLevel(level) };
    });

    return NextResponse.json({
      success: true,
      entries,
      total,
      totalXp,
      level: levelForXp(totalXp),
      curve,
    });
  } catch (error) {
    // `error.message` here was doubly unsafe: the message carries the failing
    // SQL and its bound parameters (including the user id), and reading
    // `.message` on a thrown `null` or `undefined` threw inside the catch,
    // bypassing sanitization entirely. The thrown value is now only
    // classified — never read, never echoed.
    logOperationFailure("error", "XpService.getLedger", error);
    return NextResponse.json(
      { success: false, error: "Failed to load XP ledger", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
