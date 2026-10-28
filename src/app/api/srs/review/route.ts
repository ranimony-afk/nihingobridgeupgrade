import { NextRequest, NextResponse } from "next/server";
import { SrsService } from "@/services/srs/srsService";
import { SRS_RATINGS, SrsRating } from "@/types/srs";
import {
  srsContainmentActive,
  srsContainmentResponse,
} from "@/app/api/_shared/srsContainment";

export const dynamic = "force-dynamic";

/**
 * POST /api/srs/review
 * Grades one card. The scheduler is resolved from the deck's registered key
 * at request time, so swapping algorithms requires no code path changes.
 */
export async function POST(request: NextRequest) {
  /* Phase 26F-E1 containment — see src/app/api/_shared/srsContainment.ts.
   * Denies before request parsing, service calls, DB access and XP awards. */
  if (srsContainmentActive()) return srsContainmentResponse();
  try {
    const body = await request.json();
    const { cardId, rating, timeSpentMs, userId } = body;

    if (!cardId) {
      return NextResponse.json({ success: false, error: "cardId is required" }, { status: 400 });
    }

    if (!rating || !SRS_RATINGS.includes(rating as SrsRating)) {
      return NextResponse.json(
        { success: false, error: `rating must be one of: ${SRS_RATINGS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await SrsService.gradeCard({
      cardId,
      rating: rating as SrsRating,
      timeSpentMs,
      userId,
    });

    if (!result) {
      return NextResponse.json({ success: false, error: "Card not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to grade card";
    console.error("POST /api/srs/review error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
