import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userAnalytics as userAnalyticsTable, testSessions as testSessionsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { JLPTLevel } from "@/types/quiz";
import { TestService } from "@/services/jlpt/testService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await TestService.ensureSeeded();

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId") || "anonymous-user";
    const level = (searchParams.get("level") as JLPTLevel) || "N5";

    const [userRow] = await db
      .select()
      .from(userAnalyticsTable)
      .where(eq(userAnalyticsTable.userId, userId))
      .limit(1);

    const recentSessions = await db
      .select()
      .from(testSessionsTable)
      .where(eq(testSessionsTable.userId, userId))
      .orderBy(desc(testSessionsTable.startedAt))
      .limit(10);

    return NextResponse.json({
      success: true,
      analytics: userRow || {
        userId,
        jlptLevel: level,
        testsCompleted: recentSessions.filter((s) => s.status === "completed").length,
        drillsCompleted: 0,
        totalQuestionsAnswered: 0,
        totalCorrectAnswers: 0,
        averageScorePercent: 0,
        streakDays: 1,
        categoryMastery: {},
        weakGrammarPoints: [],
      },
      recentSessions,
    });
  } catch (error: any) {
    console.error("GET /api/quiz/analytics error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
