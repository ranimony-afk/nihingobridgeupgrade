import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const testData = await TestService.getTestById(id);

    if (!testData) {
      return NextResponse.json(
        { success: false, error: "Test not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      test: testData.test,
      questions: testData.questions,
    });
  } catch (error: any) {
    console.error("GET /api/jlpt/tests/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve test" },
      { status: 500 }
    );
  }
}
