import { NextRequest, NextResponse } from "next/server";
import { SessionService } from "@/services/srs/sessionService";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";

export const dynamic = "force-dynamic";

/** GET — full post-session report: pacing, accuracy, per-scheduler breakdown, forecast. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();
  try {
    const { id } = await params;
    const summary = await SessionService.getSummary(id);

    if (!summary) {
      return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build summary";
    console.error("GET /api/srs/sessions/[id]/summary error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
