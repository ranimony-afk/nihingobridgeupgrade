import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionState = await TestService.getSessionState(id);

    if (!sessionState) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: sessionState.session,
      answers: sessionState.answers,
      questions: sessionState.questions,
    });
  } catch (error: any) {
    console.error("GET /api/jlpt/session/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get session state" },
      { status: 500 }
    );
  }
}
