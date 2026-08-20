/**
 * ProgressEngine — Unified learner progress tracking.
 *
 * P43: Tracks lesson completion, quiz performance, vocabulary/kanji/grammar
 * mastery, JLPT performance, and study time. Provides aggregated views
 * for dashboards and analytics.
 */

import { eq, and, sql, desc, asc, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  userProgress,
  lessonProgress,
  vocabularyProgress,
  kanjiProgress,
  grammarProgress,
  testResults,
  dailyGoals,
  xpEvents,
  streaks,
  courses,
  lessons,
  dictionaryEntries,
  kanjiEntries,
  grammarPatterns,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Complete learner progress dashboard. */
export interface ProgressDashboard {
  learnerId: string;
  /** Overall stats. */
  overall: OverallStats;
  /** Per-domain mastery breakdown. */
  mastery: MasteryOverview;
  /** Recent activity timeline. */
  recentActivity: ActivityEntry[];
  /** Study streak info. */
  streak: StreakInfo;
  /** Today's goal progress. */
  todayGoal: DailyGoalProgress;
  /** JLPT readiness summary. */
  jlptSummary: JlptProgressSummary[];
  /** Study time breakdown (last 7 days). */
  studyTime: StudyTimeEntry[];
}

export interface OverallStats {
  totalXp: number;
  level: number;
  lessonsCompleted: number;
  exercisesCompleted: number;
  wordsLearned: number;
  kanjiLearned: number;
  grammarLearned: number;
  testsCompleted: number;
  totalStudyTimeMinutes: number;
  averageAccuracy: number | null;
}

export interface MasteryOverview {
  vocabulary: DomainMastery;
  kanji: DomainMastery;
  grammar: DomainMastery;
}

export interface DomainMastery {
  total: number;
  mastered: number;
  familiar: number;
  practicing: number;
  introduced: number;
  unseen: number;
  percent: number;
  recentlyLearned: { id: string; name: string; mastery: string }[];
}

export interface ActivityEntry {
  type: "lesson" | "review" | "test" | "xp" | "achievement" | "streak";
  description: string;
  xp: number;
  timestamp: Date;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  freezeCount: number;
  totalActiveDays: number;
  isActiveToday: boolean;
}

export interface DailyGoalProgress {
  targetXp: number;
  earnedXp: number;
  percent: number;
  goalMet: boolean;
  lessonsCompleted: number;
  reviewsCompleted: number;
}

export interface JlptProgressSummary {
  level: number;
  vocabPercent: number;
  kanjiPercent: number;
  grammarPercent: number;
  overallPercent: number;
  bestTestScore: number | null;
}

export interface StudyTimeEntry {
  date: string;
  minutes: number;
  lessonsCompleted: number;
  reviewsCompleted: number;
  xpEarned: number;
}

/** Input for recording a lesson completion. */
export interface LessonCompletionInput {
  lessonId: string;
  score: number; // 0-100
  accuracy: number; // 0-100
  timeSpentSeconds: number;
  xpEarned: number;
}

// ─────────────────────────────────────────────
// ProgressEngine
// ─────────────────────────────────────────────

export const ProgressEngine = {

  /** Get the full progress dashboard for a learner. */
  async getDashboard(learnerId: string): Promise<ProgressDashboard> {
    const [overall, mastery, recent, streakInfo, todayGoal, jlpt, studyTime] = await Promise.all([
      this.getOverallStats(learnerId),
      this.getMasteryOverview(learnerId),
      this.getRecentActivity(learnerId, 10),
      this.getStreak(learnerId),
      this.getTodayGoal(learnerId),
      this.getJlptSummary(learnerId),
      this.getStudyTime(learnerId, 7),
    ]);

    return {
      learnerId, overall, mastery, recentActivity: recent,
      streak: streakInfo, todayGoal, jlptSummary: jlpt, studyTime,
    };
  },

  /** Record a lesson completion. */
  async recordLessonCompletion(learnerId: string, input: LessonCompletionInput): Promise<void> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Upsert lesson progress
    const existing = await db.select().from(lessonProgress)
      .where(and(eq(lessonProgress.learnerId, learnerId), eq(lessonProgress.lessonId, input.lessonId)))
      .limit(1);

    if (existing.length > 0) {
      const prev = existing[0]!;
      await db.update(lessonProgress).set({
        crowns: prev.crowns + 1,
        bestScore: Math.max(prev.bestScore, input.score),
        lastAccuracy: input.accuracy,
        xpEarned: prev.xpEarned + input.xpEarned,
        timeSpentSeconds: prev.timeSpentSeconds + input.timeSpentSeconds,
        attempts: prev.attempts + 1,
        lastCompletedAt: now,
        updatedAt: now,
      }).where(eq(lessonProgress.id, prev.id));
    } else {
      await db.insert(lessonProgress).values({
        id: genId("lp"),
        learnerId,
        lessonId: input.lessonId,
        crowns: 1,
        bestScore: input.score,
        lastAccuracy: input.accuracy,
        xpEarned: input.xpEarned,
        timeSpentSeconds: input.timeSpentSeconds,
        attempts: 1,
        firstCompletedAt: now,
        lastCompletedAt: now,
      });
    }

    // Record XP event
    await db.insert(xpEvents).values({
      id: genId("xp"),
      learnerId,
      amount: input.xpEarned,
      source: "lesson_complete",
      sourceId: input.lessonId,
      description: `Completed lesson (${input.score}%)`,
    });

    // Update daily goal
    await this._updateDailyGoal(learnerId, today, input.xpEarned, { lessonsCompleted: 1, timeSpentSeconds: input.timeSpentSeconds });

    // Update streak
    await this._updateStreak(learnerId, today);
  },

  /** Record a quiz/review session. */
  async recordReviewSession(learnerId: string, reviewCount: number, xpEarned: number, timeSpentSeconds: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    await db.insert(xpEvents).values({
      id: genId("xp"),
      learnerId,
      amount: xpEarned,
      source: "srs_review",
      description: `Reviewed ${reviewCount} items`,
    });

    await this._updateDailyGoal(learnerId, today, xpEarned, { reviewsCompleted: reviewCount, timeSpentSeconds });
    await this._updateStreak(learnerId, today);
  },

  // ── Aggregate queries ──

  async getOverallStats(learnerId: string): Promise<OverallStats> {
    // Total XP
    const xpRes = await db.select({ total: sql<number>`COALESCE(SUM(amount), 0)::int` })
      .from(xpEvents).where(eq(xpEvents.learnerId, learnerId));
    const totalXp = xpRes[0]?.total ?? 0;
    const level = Math.floor(totalXp / 100) + 1; // Simple: 100 XP per level

    // Lessons completed
    const lessonsRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));

    // Words/kanji/grammar learned (mastery >= introduced)
    const vocabRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(vocabularyProgress)
      .where(and(eq(vocabularyProgress.learnerId, learnerId), sql`mastery != 'unseen'`));
    const kanjiRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(kanjiProgress)
      .where(and(eq(kanjiProgress.learnerId, learnerId), sql`mastery != 'unseen'`));
    const grammarRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(grammarProgress)
      .where(and(eq(grammarProgress.learnerId, learnerId), sql`mastery != 'unseen'`));

    // Tests completed
    const testsRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(testResults).where(eq(testResults.learnerId, learnerId));

    // Total study time
    const timeRes = await db.select({ total: sql<number>`COALESCE(SUM(time_spent_seconds), 0)::int` })
      .from(dailyGoals).where(eq(dailyGoals.learnerId, learnerId));

    // Average accuracy across all vocab progress
    const accRes = await db.select({ avg: sql<number>`AVG(accuracy)` })
      .from(vocabularyProgress)
      .where(and(eq(vocabularyProgress.learnerId, learnerId), sql`accuracy IS NOT NULL`));

    return {
      totalXp, level,
      lessonsCompleted: lessonsRes[0]?.c ?? 0,
      exercisesCompleted: 0, // Would sum from test_answers
      wordsLearned: vocabRes[0]?.c ?? 0,
      kanjiLearned: kanjiRes[0]?.c ?? 0,
      grammarLearned: grammarRes[0]?.c ?? 0,
      testsCompleted: testsRes[0]?.c ?? 0,
      totalStudyTimeMinutes: Math.round((timeRes[0]?.total ?? 0) / 60),
      averageAccuracy: accRes[0]?.avg ? Math.round(Number(accRes[0].avg) * 100) / 100 : null,
    };
  },

  async getMasteryOverview(learnerId: string): Promise<MasteryOverview> {
    return {
      vocabulary: await this._domainMastery(learnerId, "vocabulary"),
      kanji: await this._domainMastery(learnerId, "kanji"),
      grammar: await this._domainMastery(learnerId, "grammar"),
    };
  },

  async getRecentActivity(learnerId: string, limit: number): Promise<ActivityEntry[]> {
    const events = await db.select().from(xpEvents)
      .where(eq(xpEvents.learnerId, learnerId))
      .orderBy(desc(xpEvents.earnedAt))
      .limit(limit);

    return events.map((e) => ({
      type: e.source === "lesson_complete" ? "lesson" as const
        : e.source === "srs_review" ? "review" as const
        : e.source === "test_complete" || e.source === "test_pass" ? "test" as const
        : "xp" as const,
      description: e.description ?? `${e.source}: +${e.amount} XP`,
      xp: e.amount,
      timestamp: e.earnedAt,
    }));
  },

  async getStreak(learnerId: string): Promise<StreakInfo> {
    const [row] = await db.select().from(streaks).where(eq(streaks.learnerId, learnerId)).limit(1);
    const today = new Date().toISOString().slice(0, 10);

    if (!row) {
      return { currentStreak: 0, longestStreak: 0, lastActivityDate: null, freezeCount: 0, totalActiveDays: 0, isActiveToday: false };
    }

    return {
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      lastActivityDate: row.lastActivityDate,
      freezeCount: row.freezeCount,
      totalActiveDays: row.totalActiveDays,
      isActiveToday: row.lastActivityDate === today,
    };
  },

  async getTodayGoal(learnerId: string): Promise<DailyGoalProgress> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(dailyGoals)
      .where(and(eq(dailyGoals.learnerId, learnerId), eq(dailyGoals.date, today)))
      .limit(1);

    if (!row) {
      return { targetXp: 20, earnedXp: 0, percent: 0, goalMet: false, lessonsCompleted: 0, reviewsCompleted: 0 };
    }

    return {
      targetXp: row.targetXp,
      earnedXp: row.earnedXp,
      percent: Math.min(Math.round((row.earnedXp / row.targetXp) * 100), 100),
      goalMet: row.goalMet,
      lessonsCompleted: row.lessonsCompleted,
      reviewsCompleted: row.reviewsCompleted,
    };
  },

  async getJlptSummary(learnerId: string): Promise<JlptProgressSummary[]> {
    const levels = [5, 4, 3, 2, 1];
    const result: JlptProgressSummary[] = [];

    for (const level of levels) {
      const vocab = await this._jlptDomainPercent(learnerId, level, "vocabulary");
      const kanji = await this._jlptDomainPercent(learnerId, level, "kanji");
      const grammar = await this._jlptDomainPercent(learnerId, level, "grammar");
      const overall = Math.round(vocab * 0.35 + kanji * 0.25 + grammar * 0.4);

      const bestTest = await db.select({ p: sql<number>`MAX(percentage)` })
        .from(testResults)
        .where(and(eq(testResults.learnerId, learnerId)));
      // Simplified — in production would filter by JLPT level

      result.push({
        level, vocabPercent: vocab, kanjiPercent: kanji,
        grammarPercent: grammar, overallPercent: overall,
        bestTestScore: bestTest[0]?.p ? Math.round(Number(bestTest[0].p)) : null,
      });
    }

    return result;
  },

  async getStudyTime(learnerId: string, days: number): Promise<StudyTimeEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);

    const rows = await db.select().from(dailyGoals)
      .where(and(eq(dailyGoals.learnerId, learnerId), gte(dailyGoals.date, sinceDate)))
      .orderBy(asc(dailyGoals.date));

    return rows.map((r) => ({
      date: r.date,
      minutes: Math.round(r.timeSpentSeconds / 60),
      lessonsCompleted: r.lessonsCompleted,
      reviewsCompleted: r.reviewsCompleted,
      xpEarned: r.earnedXp,
    }));
  },

  // ── Internal helpers ──

  async _domainMastery(learnerId: string, domain: "vocabulary" | "kanji" | "grammar"): Promise<DomainMastery> {
    const table = domain === "vocabulary" ? vocabularyProgress
      : domain === "kanji" ? kanjiProgress : grammarProgress;

    const rows = await db.select({
      mastery: table.mastery,
      count: sql<number>`count(*)::int`,
    }).from(table)
      .where(eq(table.learnerId, learnerId))
      .groupBy(table.mastery);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows) { counts[r.mastery] = r.count; total += r.count; }

    const mastered = counts["mastered"] ?? 0;
    const familiar = counts["familiar"] ?? 0;
    const practicing = counts["practicing"] ?? 0;
    const introduced = counts["introduced"] ?? 0;
    const unseen = counts["unseen"] ?? 0;
    const percent = total > 0 ? Math.round((mastered * 100 + familiar * 75 + practicing * 50 + introduced * 25) / total) : 0;

    // Get recently learned items
    const idCol = domain === "vocabulary" ? vocabularyProgress.entryId
      : domain === "kanji" ? kanjiProgress.kanjiId : grammarProgress.grammarId;
    const recent = await db.select({ id: idCol, mastery: table.mastery })
      .from(table)
      .where(and(eq(table.learnerId, learnerId), sql`mastery != 'unseen'`))
      .orderBy(desc(table.updatedAt))
      .limit(5);

    const recentlyLearned = recent.map((r) => ({
      id: String(r.id),
      name: String(r.id), // Would be enriched with actual names
      mastery: String(r.mastery),
    }));

    return { total, mastered, familiar, practicing, introduced, unseen, percent, recentlyLearned };
  },

  async _jlptDomainPercent(learnerId: string, level: number, domain: "vocabulary" | "kanji" | "grammar"): Promise<number> {
    const entityTable = domain === "vocabulary" ? dictionaryEntries
      : domain === "kanji" ? kanjiEntries : grammarPatterns;
    const progressTable = domain === "vocabulary" ? vocabularyProgress
      : domain === "kanji" ? kanjiProgress : grammarProgress;
    const idCol = domain === "vocabulary" ? vocabularyProgress.entryId
      : domain === "kanji" ? kanjiProgress.kanjiId : grammarProgress.grammarId;

    const totalRes = await db.select({ c: sql<number>`count(*)::int` })
      .from(entityTable).where(eq(entityTable.jlptLevel, level));
    const total = totalRes[0]?.c ?? 0;
    if (total === 0) return 0;

    const entityIds = await db.select({ id: entityTable.id }).from(entityTable)
      .where(eq(entityTable.jlptLevel, level));
    const ids = entityIds.map((e) => e.id);
    if (ids.length === 0) return 0;

    const mastered = await db.select({ c: sql<number>`count(*)::int` })
      .from(progressTable)
      .where(and(
        eq(progressTable.learnerId, learnerId),
        sql`${idCol} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
        sql`mastery IN ('mastered', 'familiar')`,
      ));

    return Math.round(((mastered[0]?.c ?? 0) / total) * 100);
  },

  async _updateDailyGoal(
    learnerId: string, date: string, xp: number,
    counts: { lessonsCompleted?: number; reviewsCompleted?: number; timeSpentSeconds?: number },
  ): Promise<void> {
    const [existing] = await db.select().from(dailyGoals)
      .where(and(eq(dailyGoals.learnerId, learnerId), eq(dailyGoals.date, date)))
      .limit(1);

    if (existing) {
      const newXp = existing.earnedXp + xp;
      const goalMet = newXp >= existing.targetXp;
      await db.update(dailyGoals).set({
        earnedXp: newXp,
        goalMet,
        goalMetAt: goalMet && !existing.goalMet ? new Date() : existing.goalMetAt,
        lessonsCompleted: existing.lessonsCompleted + (counts.lessonsCompleted ?? 0),
        reviewsCompleted: existing.reviewsCompleted + (counts.reviewsCompleted ?? 0),
        timeSpentSeconds: existing.timeSpentSeconds + (counts.timeSpentSeconds ?? 0),
        updatedAt: new Date(),
      }).where(eq(dailyGoals.id, existing.id));
    } else {
      const earnedXp = xp;
      await db.insert(dailyGoals).values({
        id: genId("dg"),
        learnerId,
        date,
        targetXp: 20,
        earnedXp,
        goalMet: earnedXp >= 20,
        lessonsCompleted: counts.lessonsCompleted ?? 0,
        reviewsCompleted: counts.reviewsCompleted ?? 0,
        timeSpentSeconds: counts.timeSpentSeconds ?? 0,
      });
    }
  },

  async _updateStreak(learnerId: string, today: string): Promise<void> {
    const [existing] = await db.select().from(streaks)
      .where(eq(streaks.learnerId, learnerId)).limit(1);

    if (!existing) {
      await db.insert(streaks).values({
        id: genId("str"),
        learnerId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        totalActiveDays: 1,
      });
      return;
    }

    if (existing.lastActivityDate === today) return; // Already counted today

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak: number;
    if (existing.lastActivityDate === yesterdayStr) {
      newStreak = existing.currentStreak + 1;
    } else {
      // Streak broken (check freeze)
      if (existing.freezeCount > 0) {
        newStreak = existing.currentStreak;
        await db.update(streaks).set({
          freezeCount: existing.freezeCount - 1,
          lastFreezeDate: today,
        }).where(eq(streaks.id, existing.id));
      } else {
        newStreak = 1;
      }
    }

    await db.update(streaks).set({
      currentStreak: newStreak,
      longestStreak: Math.max(existing.longestStreak, newStreak),
      lastActivityDate: today,
      totalActiveDays: existing.totalActiveDays + 1,
      updatedAt: new Date(),
    }).where(eq(streaks.id, existing.id));
  },
};
