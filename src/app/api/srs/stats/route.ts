import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
