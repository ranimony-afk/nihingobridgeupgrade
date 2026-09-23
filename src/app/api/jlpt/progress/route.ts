import { NextRequest, NextResponse } from "next/server";
import { JLPTKnowledgeService } from "@/services/jlpt/knowledge";
import type { JLPTLevel } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const userId = params.get("userId") || "anonymous-user";
  const levelRaw = (params.get("level") || "N5").toUpperCase();
  const level = (["N5", "N4", "N3", "N2", "N1"].includes(levelRaw)
    ? levelRaw
    : "N5") as JLPTLevel;

  try {
    const progress = await JLPTKnowledgeService.getUserProgress(userId, level);
    return NextResponse.json({
      success: true,
      data: progress,
    });
  } catch (error: any) {
    console.error("GET /api/jlpt/progress error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load progress" },
      { status: 500 }
    );
  }
}
