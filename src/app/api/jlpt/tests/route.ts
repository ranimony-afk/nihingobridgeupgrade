import { NextRequest, NextResponse } from "next/server";
import { TestService } from "@/services/jlpt/testService";
import { JLPTLevel } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get("level") as JLPTLevel | null;

    const tests = await TestService.listTests(level || undefined);
    return NextResponse.json({ success: true, tests });
  } catch (error: any) {
    console.error("GET /api/jlpt/tests error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list tests" },
      { status: 500 }
    );
  }
}
