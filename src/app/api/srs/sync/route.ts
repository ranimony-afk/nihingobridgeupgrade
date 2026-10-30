import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/services/srs/syncService";
import { SyncPlatform } from "@/types/srs";
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

/** GET — device roster, sync log, and aggregate sync totals. */
export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: the device roster and sync log are one learner's own. */
  const auth = await authenticateActor("Failed to load sync status");
  if (!auth.ok) return auth.response;

  try {
    const identity = resolveQueryIdentity(
      auth.actor,
      request.nextUrl.searchParams.getAll("userId")
    );
    if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

    const status = await SyncService.getStatus(identity.userId);
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sync status";
    console.error("GET /api/srs/sync error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** POST — register (or re-register) a device. Idempotent per (user, deviceId). */
export async function POST(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: a device is registered into the ACTOR's roster. A body
   * `userId` may restate the actor but never name another learner. */
  const auth = await authenticateActor("Failed to register device");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    if (!body?.deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const identity = resolveSelfIdentity(auth.actor, body.userId);
    if (!identity.ok) return selfIdentityFailureResponse(identity.reason);

    const { device, created } = await SyncService.registerDevice({
      userId: identity.userId,
      deviceId: body.deviceId,
      name: body.name,
      platform: body.platform as SyncPlatform | undefined,
      appVersion: body.appVersion,
    });

    return NextResponse.json({ success: true, created, device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register device";
    console.error("POST /api/srs/sync error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

/** DELETE — revoke a device so it can no longer synchronize. */
export async function DELETE(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();

  /* Phase 26F-E4: revoking is an owner-only write on the actor's own roster. */
  const auth = await authenticateActor("Failed to revoke device");
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const device = await SyncService.revokeDevice(auth.actor.id, deviceId);
    if (!device) {
      return NextResponse.json({ success: false, error: "Device not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Device revoked", device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke device";
    console.error("DELETE /api/srs/sync error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
