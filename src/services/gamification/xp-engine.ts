/**
 * XPEngine — Centralised XP event system.
 *
 * P48: Every meaningful activity produces an XP event.
 * Single entry point for all XP awards — no service should write
 * to xp_events directly; they call XPEngine.emit() instead.
 *
 * Responsibilities:
 *   1. Define XP amounts per event type
 *   2. Apply multipliers (double XP, streak bonus)
 *   3. Emit events to the xp_events table (append-only ledger)
 *   4. Detect level-ups
 *   5. Update daily goal XP
 *   6. Provide XP queries (total, history, leaderboard)
 */

import { eq, and, sql, desc, asc, gte } from "drizzle-orm";
import { db } from "@/db";
import { xpEvents, dailyGoals, streaks } from "@/db/schema";

// ─────────────────────────────────────────────
// XP Configuration
// ─────────────────────────────────────────────

export type XPEventType =
  | "lesson_complete"
  | "lesson_perfect"
  | "quiz_complete"
  | "test_complete"
  | "test_pass"
  | "srs_review"
  | "streak_bonus"
  | "daily_goal"
  | "achievement"
  | "story_complete"
  | "first_lesson"
  | "challenge"
  | "bonus";

/** Base XP amounts for each event type. */
const XP_AMOUNTS: Record<XPEventType, number> = {
  lesson_complete: 10,
  lesson_perfect: 25,
  quiz_complete: 15,
  test_complete: 20,
  test_pass: 30,
  srs_review: 1,      // per card reviewed
  streak_bonus: 5,     // per day of streak (scales)
  daily_goal: 10,
  achievement: 0,      // varies per achievement
  story_complete: 15,
  first_lesson: 50,    // one-time bonus
  challenge: 20,
  bonus: 0,            // arbitrary admin/promo XP
};

/** Level thresholds: XP needed to reach each level. */
function levelForXp(totalXp: number): { level: number; currentXp: number; nextLevelXp: number; progress: number } {
  // Formula: each level requires 100 × level XP
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 300 XP, Level 4: 600 XP, ...
  // Cumulative: level N requires N*(N-1)/2 * 100 XP total
  let level = 1;
  let cumulativeXp = 0;
  while (cumulativeXp + level * 100 <= totalXp) {
    cumulativeXp += level * 100;
    level++;
  }
  const currentLevelStart = cumulativeXp;
  const nextLevelXp = level * 100;
  const currentXp = totalXp - currentLevelStart;
  const progress = Math.round((currentXp / nextLevelXp) * 100);
  return { level, currentXp, nextLevelXp, progress };
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface XPEmitInput {
  type: XPEventType;
  /** Override the default XP amount (e.g., achievement-specific XP). */
  amount?: number;
  /** ID of the source entity (lesson, test, card, etc.). */
  sourceId?: string;
  /** Human-readable description. */
  description?: string;
  /** Multiplier count for SRS (e.g., 10 cards reviewed → amount * 10). */
  count?: number;
}

export interface XPEmitResult {
  eventId: string;
  type: XPEventType;
  baseAmount: number;
  multiplier: number;
  finalAmount: number;
  doubleXp: boolean;
  totalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  dailyGoalMet: boolean;
}

export interface XPProfile {
  learnerId: string;
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  levelProgress: number;
  todayXp: number;
  weekXp: number;
  monthXp: number;
  streakMultiplier: number;
}

export interface XPHistoryEntry {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  doubleXp: boolean;
  earnedAt: Date;
}

export interface LeaderboardEntry {
  learnerId: string;
  totalXp: number;
  level: number;
  rank: number;
}

// ─────────────────────────────────────────────
// XPEngine
// ─────────────────────────────────────────────

export const XPEngine = {

  /**
   * Emit an XP event. This is the SINGLE ENTRY POINT for all XP awards.
   * Applies multipliers, records the event, updates daily goal, detects level-ups.
   */
  async emit(learnerId: string, input: XPEmitInput): Promise<XPEmitResult> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Calculate base amount
    const baseAmount = input.amount ?? XP_AMOUNTS[input.type];
    const count = input.count ?? 1;
    let amount = baseAmount * count;

    // Check for active double XP
    const doubleXp = false; // In production, check learner's doubleXpUntil timestamp

    // Streak multiplier (1.0 base + 0.1 per 7-day streak milestone)
    const streakMultiplier = await this._getStreakMultiplier(learnerId);
    const multiplier = (doubleXp ? 2.0 : 1.0) * streakMultiplier;
    const finalAmount = Math.round(amount * multiplier);

    // Get XP before this event
    const previousTotal = await this._getTotalXp(learnerId);
    const previousLevel = levelForXp(previousTotal).level;

    // Record the event (append-only ledger)
    const eventId = genId("xp");
    await db.insert(xpEvents).values({
      id: eventId,
      learnerId,
      amount: finalAmount,
      source: input.type,
      sourceId: input.sourceId ?? null,
      description: input.description ?? this._defaultDescription(input.type, count, finalAmount),
      doubleXp,
    });

    // Calculate new totals
    const newTotal = previousTotal + finalAmount;
    const newLevelInfo = levelForXp(newTotal);
    const leveledUp = newLevelInfo.level > previousLevel;

    // Update daily goal
    const dailyGoalMet = await this._updateDailyGoal(learnerId, today, finalAmount);

    // If leveled up, emit a bonus event
    if (leveledUp) {
      await db.insert(xpEvents).values({
        id: genId("xp"),
        learnerId,
        amount: newLevelInfo.level * 10, // Level-up bonus
        source: "bonus",
        description: `Level up! Reached level ${newLevelInfo.level} 🎉`,
        doubleXp: false,
      });
    }

    return {
      eventId,
      type: input.type,
      baseAmount: baseAmount * count,
      multiplier: Math.round(multiplier * 100) / 100,
      finalAmount,
      doubleXp,
      totalXp: newTotal + (leveledUp ? newLevelInfo.level * 10 : 0),
      previousLevel,
      newLevel: newLevelInfo.level,
      leveledUp,
      dailyGoalMet,
    };
  },

  /** Get XP profile for a learner. */
  async getProfile(learnerId: string): Promise<XPProfile> {
    const totalXp = await this._getTotalXp(learnerId);
    const levelInfo = levelForXp(totalXp);
    const today = new Date().toISOString().slice(0, 10);

    const todayRes = await db.select({ total: sql<number>`COALESCE(SUM(amount),0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.learnerId, learnerId), sql`${xpEvents.earnedAt}::date = ${today}::date`));

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekRes = await db.select({ total: sql<number>`COALESCE(SUM(amount),0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.learnerId, learnerId), gte(xpEvents.earnedAt, weekAgo)));

    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
    const monthRes = await db.select({ total: sql<number>`COALESCE(SUM(amount),0)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.learnerId, learnerId), gte(xpEvents.earnedAt, monthAgo)));

    const streakMult = await this._getStreakMultiplier(learnerId);

    return {
      learnerId,
      totalXp,
      level: levelInfo.level,
      currentLevelXp: levelInfo.currentXp,
      nextLevelXp: levelInfo.nextLevelXp,
      levelProgress: levelInfo.progress,
      todayXp: todayRes[0]?.total ?? 0,
      weekXp: weekRes[0]?.total ?? 0,
      monthXp: monthRes[0]?.total ?? 0,
      streakMultiplier: streakMult,
    };
  },

  /** Get XP event history. */
  async getHistory(learnerId: string, limit = 20): Promise<XPHistoryEntry[]> {
    const rows = await db.select().from(xpEvents)
      .where(eq(xpEvents.learnerId, learnerId))
      .orderBy(desc(xpEvents.earnedAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      type: r.source,
      amount: r.amount,
      description: r.description,
      doubleXp: r.doubleXp,
      earnedAt: r.earnedAt,
    }));
  },

  /** Get the leaderboard (top XP earners). */
  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const rows = await db.select({
      learnerId: xpEvents.learnerId,
      totalXp: sql<number>`SUM(amount)::int`,
    })
      .from(xpEvents)
      .groupBy(xpEvents.learnerId)
      .orderBy(desc(sql`SUM(amount)`))
      .limit(limit);

    return rows.map((r, idx) => ({
      learnerId: r.learnerId,
      totalXp: r.totalXp,
      level: levelForXp(r.totalXp).level,
      rank: idx + 1,
    }));
  },

  /** Get XP breakdown by source type. */
  async getBreakdown(learnerId: string): Promise<{ source: string; total: number; count: number }[]> {
    const rows = await db.select({
      source: xpEvents.source,
      total: sql<number>`SUM(amount)::int`,
      count: sql<number>`count(*)::int`,
    })
      .from(xpEvents)
      .where(eq(xpEvents.learnerId, learnerId))
      .groupBy(xpEvents.source)
      .orderBy(desc(sql`SUM(amount)`));

    return rows;
  },

  // ── Internal ──

  async _getTotalXp(learnerId: string): Promise<number> {
    const res = await db.select({ total: sql<number>`COALESCE(SUM(amount),0)::int` })
      .from(xpEvents).where(eq(xpEvents.learnerId, learnerId));
    return res[0]?.total ?? 0;
  },

  async _getStreakMultiplier(learnerId: string): Promise<number> {
    const [streak] = await db.select().from(streaks)
      .where(eq(streaks.learnerId, learnerId)).limit(1);
    if (!streak) return 1.0;
    // +10% per 7-day milestone: 7d=1.1x, 14d=1.2x, 21d=1.3x, ...
    return 1.0 + Math.floor(streak.currentStreak / 7) * 0.1;
  },

  async _updateDailyGoal(learnerId: string, date: string, xp: number): Promise<boolean> {
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
        updatedAt: new Date(),
      }).where(eq(dailyGoals.id, existing.id));
      return goalMet;
    } else {
      const goalMet = xp >= 20;
      await db.insert(dailyGoals).values({
        id: genId("dg"),
        learnerId,
        date,
        targetXp: 20,
        earnedXp: xp,
        goalMet,
      });
      return goalMet;
    }
  },

  _defaultDescription(type: XPEventType, count: number, amount: number): string {
    const descriptions: Record<XPEventType, string> = {
      lesson_complete: `Completed lesson (+${amount} XP)`,
      lesson_perfect: `Perfect score! (+${amount} XP)`,
      quiz_complete: `Finished quiz (+${amount} XP)`,
      test_complete: `Completed test (+${amount} XP)`,
      test_pass: `Passed test! (+${amount} XP)`,
      srs_review: `Reviewed ${count} card${count > 1 ? "s" : ""} (+${amount} XP)`,
      streak_bonus: `Streak bonus! (+${amount} XP)`,
      daily_goal: `Daily goal met! (+${amount} XP)`,
      achievement: `Achievement unlocked! (+${amount} XP)`,
      story_complete: `Completed story (+${amount} XP)`,
      first_lesson: `First lesson ever! (+${amount} XP)`,
      challenge: `Challenge completed (+${amount} XP)`,
      bonus: `Bonus XP (+${amount})`,
    };
    return descriptions[type] ?? `+${amount} XP`;
  },
};
