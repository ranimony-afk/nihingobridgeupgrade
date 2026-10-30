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
  } catch (error) {
    // Never surface driver text: a failed query message includes the SQL and
    // its bound parameters. Clients get a stable message, operators the class.
    console.error(
      "GET /api/questions/[id] failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch question",
        code: "INTERNAL_ERROR",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
