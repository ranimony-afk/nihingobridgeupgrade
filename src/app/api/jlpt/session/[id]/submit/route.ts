import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    let finalAnswers;

    try {
      const body = await request.json();
      finalAnswers = body?.answers;
    } catch {
      // Body might be empty
    }

    const results = await TestService.submitSession(sessionId, finalAnswers);

    if (!results) {
      return NextResponse.json(
        { success: false, error: "Session could not be submitted" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("POST /api/jlpt/session/[id]/submit error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit session" },
      { status: 500 }
    );
  }
}
