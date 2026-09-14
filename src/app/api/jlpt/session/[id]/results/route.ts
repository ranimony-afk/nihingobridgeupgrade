import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { QuizEngine } from "@/services/quiz/engine";
import { JLPTLevel, Question } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const sessionState = await TestService.getSessionState(sessionId);

    if (!sessionState) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    const { session, answers, questions } = sessionState;

    let title = "JLPT Practice Quiz";
    if (session.testId) {
      const testData = await TestService.getTestById(session.testId);
      if (testData) title = testData.test.title;
    }

    const results = QuizEngine.calculateFullExamResult({
      sessionId,
      testId: session.testId,
      title,
      jlptLevel: session.jlptLevel as JLPTLevel,
      quizType: session.quizType,
      isTimed: session.isTimed,
      timeLimitSeconds: session.timeLimitSeconds,
      startedAt: session.startedAt,
      completedAt: session.completedAt || new Date(),
      questions,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer || undefined,
        starOrderSubmitted: (a.starOrderSubmitted as string[]) || undefined,
        timeSpentSeconds: a.timeSpentSeconds || 0,
        isFlagged: a.isFlagged,
      })),
    });

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("GET /api/jlpt/session/[id]/results error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve results" },
      { status: 500 }
    );
  }
}
