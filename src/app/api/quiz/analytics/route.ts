import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userAnalytics as userAnalyticsTable, testSessions as testSessionsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { JLPTLevel } from "@/types/quiz";
import { TestService } from "@/services/jlpt/testService";
import { resolveQueryIdentity } from "@/lib/auth/learningIdentity";
import {
  authenticateActor,
  queryIdentityFailureResponse,
} from "@/app/api/_shared/authorizationResponse";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/quiz/analytics — one learner's quiz analytics and recent sessions.
 *
 * Phase 26F-E2. Before this, the handler took `?userId=` from the query string,
 * defaulted it to `"anonymous-user"`, and used it directly as the only
 * predicate on two reads:
 *
 *     const userId = searchParams.get("userId") || "anonymous-user";
 *     db.select().from(userAnalytics).where(eq(userAnalytics.userId, userId))
 *     db.select().from(testSessions).where(eq(testSessions.userId, userId))
 *
 * which returned any learner's aggregate analytics plus their ten most recent
 * test sessions to an anonymous caller.
 *
 * Ownership rules are identical to `GET /api/jlpt/progress`, and the predicate
 * below is built from the verified actor's id (`identity.userId`) rather than
 * from the request. The database read is unchanged otherwise.
 */
export async function GET(request: NextRequest) {
  /* Authorization before the query string or the seed check runs. */
  const auth = await authenticateActor("Failed to fetch analytics");
  if (!auth.ok) return auth.response;

  const identity = resolveQueryIdentity(
    auth.actor,
    request.nextUrl.searchParams.getAll("userId")
  );
  if (!identity.ok) return queryIdentityFailureResponse(identity.reason);

  const level = (request.nextUrl.searchParams.get("level") as JLPTLevel) || "N5";

  try {
    await TestService.ensureSeeded();

    /* Verified actor id — the only identity these reads may be scoped to. */
    const userId = identity.userId;

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

    return NextResponse.json(
      {
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
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logOperationFailure("error", "QuizAnalytics.read", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch analytics", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE }
    );
  }
}
