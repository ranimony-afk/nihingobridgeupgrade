import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "anonymous-user";
    const stats = await SrsService.getStats(userId);

    return NextResponse.json({
      success: true,
      userId,
      stats,
      schedulerUsage: stats.schedulerUsage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute SRS stats";
    console.error("GET /api/srs/stats error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
