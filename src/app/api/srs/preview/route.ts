import { NextRequest, NextResponse } from "next/server";
import { previewGrade } from "@/services/srs/scheduler";
import { SRS_RATINGS, SrsRating } from "@/types/srs";

export const dynamic = "force-dynamic";

/**
 * POST /api/srs/preview
 * Pure function endpoint: simulates what a scheduler WOULD do for a given
 * state + rating, persisting nothing. Used by the scheduler lab UI so
 * learners can compare algorithms side by side without side effects.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      schedulerKey,
      params,
      rating = "good",
      repetitions,
      easeFactor,
      intervalDays,
      stabilityDays,
      difficulty,
      box,
      stepIndex,
      isLearning,
      lapses,
      lastReviewedAt,
    } = body;

    if (!SRS_RATINGS.includes(rating as SrsRating)) {
      return NextResponse.json(
        { success: false, error: `rating must be one of: ${SRS_RATINGS.join(", ")}` },
        { status: 400 }
      );
    }

    const preview = previewGrade({
      schedulerKey,
      params,
      rating,
      repetitions,
      easeFactor,
      intervalDays,
      stabilityDays,
      difficulty,
      box,
      stepIndex,
      isLearning,
      lapses,
      lastReviewedAt: lastReviewedAt ?? null,
    });

    return NextResponse.json({ success: true, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview grade";
    console.error("POST /api/srs/preview error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
