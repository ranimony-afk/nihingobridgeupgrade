/**
 * StreakService — Daily goals and streak management.
 *
 * P50: Provides streak queries, daily goal configuration, and the
 * streak+goal update logic used by other services.
 */

import { eq, and, desc, asc, gte } from "drizzle-orm";
import { db } from "@/db";
import { streaks, dailyGoals } from "@/db/schema";

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface StreakView {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  isActiveToday: boolean;
  freezeCount: number;
  totalActiveDays: number;
}

export interface DailyGoalView {
  date: string;
  targetXp: number;
  earnedXp: number;
  percent: number;
  goalMet: boolean;
  goalMetAt: Date | null;
  lessonsCompleted: number;
  reviewsCompleted: number;
  testsCompleted: number;
  storiesCompleted: number;
  timeSpentSeconds: number;
}

export interface WeeklyView {
  days: DailyGoalView[];
  totalXp: number;
  daysActive: number;
  goalMetDays: number;
  averageXpPerDay: number;
}

export const StreakService = {

  async getStreak(learnerId: string): Promise<StreakView> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(streaks).where(eq(streaks.learnerId, learnerId)).limit(1);
    if (!row) return { currentStreak: 0, longestStreak: 0, lastActivityDate: null, isActiveToday: false, freezeCount: 0, totalActiveDays: 0 };
    return {
      currentStreak: row.currentStreak,
      longestStreak: row.longestStreak,
      lastActivityDate: row.lastActivityDate,
      isActiveToday: row.lastActivityDate === today,
      freezeCount: row.freezeCount,
      totalActiveDays: row.totalActiveDays,
    };
  },

  async getTodayGoal(learnerId: string): Promise<DailyGoalView> {
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.select().from(dailyGoals)
      .where(and(eq(dailyGoals.learnerId, learnerId), eq(dailyGoals.date, today))).limit(1);
    if (!row) return { date: today, targetXp: 20, earnedXp: 0, percent: 0, goalMet: false, goalMetAt: null, lessonsCompleted: 0, reviewsCompleted: 0, testsCompleted: 0, storiesCompleted: 0, timeSpentSeconds: 0 };
    return {
      date: row.date, targetXp: row.targetXp, earnedXp: row.earnedXp,
      percent: Math.min(100, Math.round((row.earnedXp / row.targetXp) * 100)),
      goalMet: row.goalMet, goalMetAt: row.goalMetAt,
      lessonsCompleted: row.lessonsCompleted, reviewsCompleted: row.reviewsCompleted,
      testsCompleted: row.testsCompleted, storiesCompleted: row.storiesCompleted,
      timeSpentSeconds: row.timeSpentSeconds,
    };
  },

  async getWeek(learnerId: string): Promise<WeeklyView> {
    const days: DailyGoalView[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const [row] = await db.select().from(dailyGoals)
        .where(and(eq(dailyGoals.learnerId, learnerId), eq(dailyGoals.date, dateStr))).limit(1);
      days.push(row ? {
        date: row.date, targetXp: row.targetXp, earnedXp: row.earnedXp,
        percent: Math.min(100, Math.round((row.earnedXp / row.targetXp) * 100)),
        goalMet: row.goalMet, goalMetAt: row.goalMetAt,
        lessonsCompleted: row.lessonsCompleted, reviewsCompleted: row.reviewsCompleted,
        testsCompleted: row.testsCompleted, storiesCompleted: row.storiesCompleted,
        timeSpentSeconds: row.timeSpentSeconds,
      } : { date: dateStr, targetXp: 20, earnedXp: 0, percent: 0, goalMet: false, goalMetAt: null, lessonsCompleted: 0, reviewsCompleted: 0, testsCompleted: 0, storiesCompleted: 0, timeSpentSeconds: 0 });
    }
    const totalXp = days.reduce((s, d) => s + d.earnedXp, 0);
    const daysActive = days.filter((d) => d.earnedXp > 0).length;
    const goalMetDays = days.filter((d) => d.goalMet).length;
    return { days, totalXp, daysActive, goalMetDays, averageXpPerDay: daysActive > 0 ? Math.round(totalXp / daysActive) : 0 };
  },

  async setDailyTarget(learnerId: string, targetXp: number): Promise<{ updated: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    const [existing] = await db.select().from(dailyGoals)
      .where(and(eq(dailyGoals.learnerId, learnerId), eq(dailyGoals.date, today))).limit(1);
    if (existing) {
      await db.update(dailyGoals).set({ targetXp, updatedAt: new Date() }).where(eq(dailyGoals.id, existing.id));
    } else {
      await db.insert(dailyGoals).values({ id: genId("dg"), learnerId, date: today, targetXp, earnedXp: 0, goalMet: false });
    }
    return { updated: true };
  },

  async purchaseFreeze(learnerId: string): Promise<{ freezeCount: number }> {
    const [row] = await db.select().from(streaks).where(eq(streaks.learnerId, learnerId)).limit(1);
    if (!row) return { freezeCount: 0 };
    await db.update(streaks).set({ freezeCount: row.freezeCount + 1, updatedAt: new Date() }).where(eq(streaks.id, row.id));
    return { freezeCount: row.freezeCount + 1 };
  },
};
