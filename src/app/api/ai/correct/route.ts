import { NextRequest, NextResponse } from "next/server";
import { CorrectionService } from "@/services/ai/correction";

export const dynamic = "force-dynamic";

/**
 * Japanese text correction endpoint.
 *
 * POST /api/ai/correct
 * {
 *   "text": "私は猫を好きです",
 *   "intendedMeaning": "I like cats",
 *   "learnerId": "demo-learner",
 *   "level": "N5"
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { text, intendedMeaning, learnerId, level } = body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "text is required" } },
      { status: 400 },
    );
  }

  const result = await CorrectionService.correct({
    text: text.trim(),
    learnerId: learnerId ?? undefined,
    intendedMeaning: intendedMeaning ?? undefined,
    level: level ?? "N5",
  });

  return NextResponse.json({ success: true, data: result });
}
