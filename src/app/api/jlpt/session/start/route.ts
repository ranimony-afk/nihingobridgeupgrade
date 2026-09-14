import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      testId,
      quizType = "jlpt_mock",
      jlptLevel = "N5",
      sectionFilter = "all",
      isTimed = true,
      customTimeMinutes,
      questionLimit,
      questionCategories,
    } = body;

    const sessionInfo = await TestService.startSession({
      userId,
      testId,
      quizType,
      jlptLevel,
      sectionFilter,
      isTimed,
      customTimeMinutes,
      questionLimit,
      questionCategories,
    });

    return NextResponse.json({
      success: true,
      ...sessionInfo,
    });
  } catch (error: any) {
    console.error("POST /api/jlpt/session/start error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to start test session" },
      { status: 500 }
    );
  }
}
