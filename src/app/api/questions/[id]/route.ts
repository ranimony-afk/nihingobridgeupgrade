import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await TestService.getQuestionById(id);

    if (!question) {
      return NextResponse.json(
        { success: false, error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      question,
    });
  } catch (error: any) {
    console.error("GET /api/questions/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch question" },
      { status: 500 }
    );
  }
}
