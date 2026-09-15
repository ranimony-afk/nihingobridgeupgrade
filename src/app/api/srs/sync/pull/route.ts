import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/services/srs/syncService";

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
  try {
    const sp = request.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");

    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const wantsSnapshot = sp.get("snapshot") === "1";
    const cursor = wantsSnapshot ? null : sp.get("cursor");

    const result = wantsSnapshot
      ? await SyncService.snapshot({ deviceId })
      : await SyncService.pull({
          deviceId,
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
