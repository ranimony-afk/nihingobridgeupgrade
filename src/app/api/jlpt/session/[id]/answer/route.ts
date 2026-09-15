import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { questionId, selectedAnswer, starOrderSubmitted, timeSpentSeconds, isFlagged } = body;

    if (!questionId) {
      return NextResponse.json(
        { success: false, error: "questionId is required" },
        { status: 400 }
      );
    }

    await TestService.saveAnswer(sessionId, {
      questionId,
      selectedAnswer,
      starOrderSubmitted,
      timeSpentSeconds: timeSpentSeconds || 0,
      isFlagged: Boolean(isFlagged),
    });

    return NextResponse.json({ success: true, message: "Answer recorded" });
  } catch (error: any) {
    console.error("POST /api/jlpt/session/[id]/answer error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save answer" },
      { status: 500 }
    );
  }
}
