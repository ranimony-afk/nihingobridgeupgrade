import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/services/srs/syncService";
import { SyncPlatform } from "@/types/srs";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";
import { authenticateActor } from "@/app/api/_shared/authorizationResponse";

export const dynamic = "force-dynamic";

/**
 * POST /api/srs/sync/push
 *
 * A device pushes review events collected offline. Events are REPLAYED through
 * the card's registered scheduler rather than having state overwritten, so
 * server truth is never clobbered and the algorithm always owns scheduling.
 *
 * Idempotency: each event carries a device-generated `clientId`. Retrying the
 * same push is a no-op for already-applied events.
 */
export async function POST(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: replaying offline reviews writes scheduling state, review
   * rows and XP for ONE learner. The body supplies `deviceId` only — there is
   * deliberately no identity claim to spoof. */
  const auth = await authenticateActor("Sync push failed");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const deviceId = body?.deviceId;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 }
      );
    }

    const events = Array.isArray(body.events) ? body.events : [];
    for (const ev of events) {
      if (!ev?.clientId) {
        return NextResponse.json(
          { success: false, error: "every event requires a clientId (idempotency key)" },
          { status: 400 }
        );
      }
      if (!ev?.cardId) {
        return NextResponse.json(
          { success: false, error: "every event requires a cardId" },
          { status: 400 }
        );
      }
    }

    const result = await SyncService.push(
      {
        deviceId,
        deviceName: body.deviceName,
        platform: body.platform as SyncPlatform | undefined,
        appVersion: body.appVersion,
        events,
      },
      auth.actor.id
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync push failed";
    console.error("POST /api/srs/sync/push error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
