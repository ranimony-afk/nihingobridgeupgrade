import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/services/srs/syncService";
import { SyncPlatform } from "@/types/srs";

export const dynamic = "force-dynamic";

/** GET — device roster, sync log, and aggregate sync totals. */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "anonymous-user";
    const status = await SyncService.getStatus(userId);
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sync status";
    console.error("GET /api/srs/sync error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/** POST — register (or re-register) a device. Idempotent per (user, deviceId). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body?.deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const { device, created } = await SyncService.registerDevice({
      userId: body.userId,
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
  try {
    const sp = request.nextUrl.searchParams;
    const deviceId = sp.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ success: false, error: "deviceId is required" }, { status: 400 });
    }

    const device = await SyncService.revokeDevice(sp.get("userId") || "anonymous-user", deviceId);
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
