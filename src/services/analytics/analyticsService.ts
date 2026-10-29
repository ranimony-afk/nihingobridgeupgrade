import { db } from "@/db";
import {
  xpEvents,
  xpRules,
  userAnalytics,
  srsReviews,
  testSessions,
  testAnswers,
} from "@/db/schema";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import { XpService } from "../gamification/xpService";
import { TestService } from "../jlpt/testService";
import { requireOwner } from "@/lib/auth/serviceIdentity";

export interface UserLearningSummary {
  userId: string;
  xp: {
    totalPoints: number;
    level: number;
    title: string;
    nextLevelPoints: number;
    progressPercent: number;
  };
  studyMetrics: {
    vocabularyStudied: number;
    kanjiStudied: number;
    grammarStudied: number;
    examplesStudied: number;
    srsReviewsCompleted: number;
    quizAttempts: number;
    jlptTestsCompleted: number;
    totalTimeSpentMinutes: number;
    overallAccuracy: number;
    streakDays: number;
  };
  recentActivity: Array<{
    type: string;
    source: string;
    points: number;
    occurredAt: Date;
  }>;
}

export class AnalyticsService {
  /**
   * Ensure necessary baseline rules and records are in sync.
   */
  static async ensureInitialized(): Promise<void> {
    await Promise.all([
      XpService.syncRegistry(),
      TestService.ensureSeeded(),
    ]);
  }

  /**
   * Tracks an explicit study action event (e.g. studied a vocabulary, kanji, or grammar entry).
   * Automatically awards XP via the idempotent ledger with dedupeKey.
   */
  static async trackStudyEvent(params: {
    /*
     * Phase 26F-E3: REQUIRED. This was `userId?: string` with a
     * `|| "anonymous-user"` fallback below, so a study event with no identity
     * was awarded to the shared legacy account — and the dedupe key was built
     * from the same value, making two different learners' identical study
     * events collide there.
     */
    userId: string;
    itemType: "vocabulary" | "kanji" | "grammar" | "example";
    itemId: string;
    jlptLevel?: string;
    timeSpentMs?: number;
  }): Promise<{ awarded: boolean; points: number }> {
    const userId = requireOwner(params.userId, "AnalyticsService.trackStudyEvent");
    await this.ensureInitialized();
    const dedupeKey = `study:${params.itemType}:${userId}:${params.itemId}`;

    // NOT `awardSafe`: for this route the award IS the mutation, so a failed
    // ledger write must surface to the caller instead of being swallowed and
    // reported as a successful 200. Callers whose award is a secondary effect
    // (SRS grading, session completion, …) keep using `awardSafe`.
    const res = await XpService.award({
      payload: {
        eventType: "content.read",
        userId,
        sourceType: params.itemType,
        sourceId: params.itemId,
        jlptLevel: params.jlptLevel || "N5",
      },
      dedupeKey,
    });

    return {
      awarded: !res.duplicate,
      points: res.points,
    };
  }

  /**
   * Compute comprehensive, aggregated learning progress without leaking private internals.
   */
  static async getUserProgressSummary(userId: string): Promise<UserLearningSummary> {
    /*
     * Phase 26F-E3: REQUIRED and validated before the first query. The old
     * `= "anonymous-user"` default aggregated the shared legacy account for any
     * caller that omitted the id.
     */
    const owner = requireOwner(userId, "AnalyticsService.getUserProgressSummary");
    await this.ensureInitialized();

    // 1. Live XP & Level derivation
    const xpSummary = await XpService.getSummary(owner);

    // 2. SRS Review metrics
    const [reviewStats] = await db
      .select({
        totalReviews: sql<number>`cast(count(*) as int)`,
        correctReviews: sql<number>`cast(count(*) filter (where ${srsReviews.wasCorrect} = true) as int)`,
        totalTimeMs: sql<number>`cast(coalesce(sum(${srsReviews.timeSpentMs}), 0) as int)`,
      })
      .from(srsReviews)
      .where(eq(srsReviews.userId, owner));

    // 3. Studied items by source_type from xp_events ledger
    const studiedRows = await db
      .select({
        sourceType: xpEvents.sourceType,
        count: sql<number>`cast(count(distinct ${xpEvents.sourceId}) as int)`,
      })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, owner), sql`${xpEvents.revokedAt} is null`))
      .groupBy(xpEvents.sourceType);

    const countsByType: Record<string, number> = {};
    for (const row of studiedRows) {
      countsByType[row.sourceType] = row.count;
    }

    // 4. Test Sessions (JLPT Mock exams & quizzes)
    const [testStats] = await db
      .select({
        totalSessions: sql<number>`cast(count(*) as int)`,
        completedTests: sql<number>`cast(count(*) filter (where ${testSessions.status} = 'completed' and ${testSessions.quizType} = 'jlpt_mock') as int)`,
        completedDrills: sql<number>`cast(count(*) filter (where ${testSessions.status} = 'completed' and ${testSessions.quizType} != 'jlpt_mock') as int)`,
        totalTimeSeconds: sql<number>`cast(coalesce(sum(${testSessions.totalTimeSpentSeconds}), 0) as int)`,
      })
      .from(testSessions)
      .where(eq(testSessions.userId, owner));

    // 5. Test Answer Accuracy
    const [answerStats] = await db
      .select({
        totalAnswers: sql<number>`cast(count(*) as int)`,
        correctAnswers: sql<number>`cast(count(*) filter (where ${testAnswers.isCorrect} = true) as int)`,
      })
      .from(testAnswers)
      .innerJoin(testSessions, eq(testAnswers.sessionId, testSessions.id))
      .where(eq(testSessions.userId, owner));

    // Combine accuracies
    const totalReviewAttempts = reviewStats?.totalReviews ?? 0;
    const correctReviewAttempts = reviewStats?.correctReviews ?? 0;
    const totalQuizAnswers = answerStats?.totalAnswers ?? 0;
    const correctQuizAnswers = answerStats?.correctAnswers ?? 0;

    const combinedTotal = totalReviewAttempts + totalQuizAnswers;
    const combinedCorrect = correctReviewAttempts + correctQuizAnswers;
    const overallAccuracy =
      combinedTotal > 0 ? Number(((combinedCorrect / combinedTotal) * 100).toFixed(1)) : 100.0;

    const totalTimeSpentMinutes = Math.round(
      ((reviewStats?.totalTimeMs ?? 0) / 1000 + (testStats?.totalTimeSeconds ?? 0)) / 60
    );

    // 6. Recent Clean Activity
    const recentEvents = await db
      .select({
        type: xpEvents.eventType,
        source: xpEvents.sourceType,
        points: xpEvents.points,
        occurredAt: xpEvents.occurredAt,
      })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, owner), sql`${xpEvents.revokedAt} is null`))
      .orderBy(desc(xpEvents.occurredAt))
      .limit(8);

    return {
      userId: owner,
      xp: {
        totalPoints: xpSummary.totalXp,
        level: xpSummary.level.level,
        title: xpSummary.level.title,
        nextLevelPoints: xpSummary.level.xpAtNextLevel ?? xpSummary.totalXp,
        progressPercent: xpSummary.level.progressPercent,
      },
      studyMetrics: {
        vocabularyStudied: countsByType["vocabulary"] || countsByType["dictionary"] || 0,
        kanjiStudied: countsByType["kanji"] || 0,
        grammarStudied: countsByType["grammar"] || 0,
        examplesStudied: countsByType["example"] || countsByType["sentence"] || 0,
        srsReviewsCompleted: totalReviewAttempts,
        quizAttempts: testStats?.totalSessions ?? 0,
        jlptTestsCompleted: testStats?.completedTests ?? 0,
        totalTimeSpentMinutes,
        overallAccuracy,
        streakDays: xpSummary.currentStreakDays,
      },
      recentActivity: recentEvents,
    };
  }
}
