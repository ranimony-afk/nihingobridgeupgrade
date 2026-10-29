import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/services/srs/syncService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";

export const dynamic = "force-dynamic";

/**
 * GET /api/srs/sync/pull?deviceId=...&cursor=...&limit=...
 *
 * Delta pull. Omit `cursor` (or pass `snapshot=1`) for a full snapshot, which a
 * fresh device uses for first-time bootstrap. The response includes the
 * scheduler registry fingerprint so the client can detect that its local
 * algorithm code is stale.
 */
export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: a pull reads one learner's cards, reviews and device row.
   * `deviceId` identifies a device WITHIN that learner; it is never identity. */
  const auth = await authenticateActor("Sync pull failed");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const wantsSnapshot = sp.get("snapshot") === "1";
    const cursor = wantsSnapshot ? null : sp.get("cursor");

    const result = wantsSnapshot
      ? await SyncService.snapshot({ deviceId, userId: auth.actor.id })
      : await SyncService.pull({
          deviceId,
          userId: auth.actor.id,
          cursor,
          limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
          includeReviews: sp.get("includeReviews") !== "0",
        });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync pull failed";
    console.error("GET /api/srs/sync/pull error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
