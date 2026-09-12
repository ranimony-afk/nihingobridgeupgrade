import { NextRequest, NextResponse } from "next/server";
import { SRSSync } from "@/services/srs/sync";

export const dynamic = "force-dynamic";

/** GET: Quick sync status check (lightweight — no data transfer). */
export async function GET(request: NextRequest) {
  const learnerId = request.nextUrl.searchParams.get("learnerId") ?? "demo-learner";
  const status = await SRSSync.syncStatus(learnerId);
  return NextResponse.json({ success: true, data: status });
}

/**
 * POST: Full sync endpoint.
 *
 * Used by both web and Flutter:
 *   - Web: calls on page load with lastSyncAt=null (full) or stored timestamp (delta)
 *   - Flutter: calls on app open and on reconnect after offline period
 *
 * Request body:
 *   {
 *     "learnerId": "user-123",
 *     "lastSyncAt": "2025-07-16T10:00:00Z" | null,
 *     "pendingReviews": [
 *       { "cardId": "card-1", "rating": "good", "reviewDurationMs": 2500,
 *         "reviewedAt": "2025-07-16T09:30:00Z", "clientReviewId": "cr-abc" }
 *     ],
 *     "clientPlatform": "flutter",
 *     "clientVersion": "1.0.0"
 *   }
 *
 * Response:
 *   {
 *     "decks": [...],
 *     "cards": [...],
 *     "reviewResults": [...],
 *     "algorithmParams": { ... },
 *     "syncedAt": "2025-07-16T10:05:00Z",
 *     "syncType": "delta",
 *     "stats": { ... }
 *   }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  const syncRequest = {
    learnerId: body.learnerId ?? "demo-learner",
    lastSyncAt: body.lastSyncAt ?? null,
    pendingReviews: body.pendingReviews ?? [],
    clientPlatform: body.clientPlatform ?? "web",
    clientVersion: body.clientVersion ?? "1.0.0",
  };

  const response = await SRSSync.sync(syncRequest);
  return NextResponse.json({ success: true, data: response });
}
