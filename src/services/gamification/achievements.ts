/**
 * AchievementEngine — Achievement definitions, unlock detection, and awarding.
 *
 * P49: Defines achievements, checks unlock criteria against learner state,
 * awards newly unlocked achievements, and emits XP via XPEngine.
 *
 * Achievement criteria are evaluated by checking the learner's current
 * stats (XP, words learned, streak, etc.) against the achievement's
 * criteria JSONB. This runs after every significant action.
 */

import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  userAchievements,
  vocabularyProgress,
  kanjiProgress,
  grammarProgress,
  lessonProgress,
  testResults,
  streaks,
  xpEvents,
  srsReviews,
} from "@/db/schema";
import { XPEngine } from "./xp-engine";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AchievementView {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  xpReward: number;
  /** Whether this learner has unlocked it. */
  unlocked: boolean;
  unlockedAt: Date | null;
  /** Progress toward unlocking (0–100). null if already unlocked or not trackable. */
  progress: number | null;
}

export interface UnlockResult {
  achievementId: string;
  slug: string;
  title: string;
  icon: string;
  xpAwarded: number;
  /** Was this newly unlocked (true) or already unlocked (false)? */
  newUnlock: boolean;
}

/** Criteria types stored in achievements.criteria JSONB. */
type CriteriaType =
  | { type: "xp_total"; amount: number }
  | { type: "words_learned"; count: number }
  | { type: "words_mastered"; count: number }
  | { type: "kanji_learned"; count: number }
  | { type: "kanji_mastered"; count: number }
  | { type: "grammar_learned"; count: number }
  | { type: "lessons_completed"; count: number }
  | { type: "tests_completed"; count: number }
  | { type: "tests_passed"; count: number }
  | { type: "streak"; days: number }
  | { type: "reviews_completed"; count: number }
  | { type: "level_reached"; level: number }
  | { type: "first_lesson" }
  | { type: "first_review" }
  | { type: "jlpt_level_complete"; level: number; domain: string; percent: number };

// ─────────────────────────────────────────────
// Seed definitions
// ─────────────────────────────────────────────

const ACHIEVEMENT_SEEDS: Omit<typeof achievements.$inferInsert, "id" | "createdAt">[] = [
  // Learning milestones
  { slug: "first-lesson", title: "First Steps", description: "Complete your first lesson", icon: "🎯", category: "learning", criteria: { type: "first_lesson" }, xpReward: 10, sortOrder: 1, rarity: "common", isActive: true },
  { slug: "10-lessons", title: "Getting Started", description: "Complete 10 lessons", icon: "📚", category: "learning", criteria: { type: "lessons_completed", count: 10 }, xpReward: 25, sortOrder: 2, rarity: "common", isActive: true },
  { slug: "50-lessons", title: "Dedicated Student", description: "Complete 50 lessons", icon: "🎓", category: "learning", criteria: { type: "lessons_completed", count: 50 }, xpReward: 100, sortOrder: 3, rarity: "rare", isActive: true },
  { slug: "100-lessons", title: "Lesson Master", description: "Complete 100 lessons", icon: "👑", category: "learning", criteria: { type: "lessons_completed", count: 100 }, xpReward: 250, sortOrder: 4, rarity: "epic", isActive: true },

  // Vocabulary
  { slug: "10-words", title: "Word Collector", description: "Learn 10 vocabulary words", icon: "📖", category: "mastery", criteria: { type: "words_learned", count: 10 }, xpReward: 15, sortOrder: 10, rarity: "common", isActive: true },
  { slug: "100-words", title: "Vocabulary Builder", description: "Learn 100 vocabulary words", icon: "📗", category: "mastery", criteria: { type: "words_learned", count: 100 }, xpReward: 50, sortOrder: 11, rarity: "common", isActive: true },
  { slug: "500-words", title: "Word Wizard", description: "Learn 500 vocabulary words", icon: "📘", category: "mastery", criteria: { type: "words_learned", count: 500 }, xpReward: 200, sortOrder: 12, rarity: "rare", isActive: true },
  { slug: "1000-words", title: "Lexicon Legend", description: "Learn 1,000 vocabulary words", icon: "📙", category: "mastery", criteria: { type: "words_learned", count: 1000 }, xpReward: 500, sortOrder: 13, rarity: "epic", isActive: true },
  { slug: "50-words-mastered", title: "Word Master", description: "Master 50 vocabulary words", icon: "⭐", category: "mastery", criteria: { type: "words_mastered", count: 50 }, xpReward: 100, sortOrder: 14, rarity: "rare", isActive: true },

  // Kanji
  { slug: "10-kanji", title: "Kanji Beginner", description: "Learn 10 kanji", icon: "漢", category: "mastery", criteria: { type: "kanji_learned", count: 10 }, xpReward: 20, sortOrder: 20, rarity: "common", isActive: true },
  { slug: "100-kanji", title: "Kanji Explorer", description: "Learn 100 kanji", icon: "🔍", category: "mastery", criteria: { type: "kanji_learned", count: 100 }, xpReward: 100, sortOrder: 21, rarity: "rare", isActive: true },
  { slug: "500-kanji", title: "Kanji Master", description: "Learn 500 kanji", icon: "🏯", category: "mastery", criteria: { type: "kanji_mastered", count: 500 }, xpReward: 500, sortOrder: 22, rarity: "epic", isActive: true },

  // Grammar
  { slug: "10-grammar", title: "Grammar Starter", description: "Learn 10 grammar patterns", icon: "📝", category: "mastery", criteria: { type: "grammar_learned", count: 10 }, xpReward: 20, sortOrder: 30, rarity: "common", isActive: true },
  { slug: "50-grammar", title: "Grammar Pro", description: "Learn 50 grammar patterns", icon: "✍️", category: "mastery", criteria: { type: "grammar_learned", count: 50 }, xpReward: 100, sortOrder: 31, rarity: "rare", isActive: true },

  // Streaks
  { slug: "3-day-streak", title: "Getting Consistent", description: "Maintain a 3-day streak", icon: "🔥", category: "streak", criteria: { type: "streak", days: 3 }, xpReward: 10, sortOrder: 40, rarity: "common", isActive: true },
  { slug: "7-day-streak", title: "Week Warrior", description: "Maintain a 7-day streak", icon: "🔥", category: "streak", criteria: { type: "streak", days: 7 }, xpReward: 25, sortOrder: 41, rarity: "common", isActive: true },
  { slug: "30-day-streak", title: "Monthly Master", description: "Maintain a 30-day streak", icon: "🌟", category: "streak", criteria: { type: "streak", days: 30 }, xpReward: 100, sortOrder: 42, rarity: "rare", isActive: true },
  { slug: "100-day-streak", title: "Century Streak", description: "Maintain a 100-day streak", icon: "💯", category: "streak", criteria: { type: "streak", days: 100 }, xpReward: 500, sortOrder: 43, rarity: "epic", isActive: true },
  { slug: "365-day-streak", title: "Year of Japanese", description: "Maintain a 365-day streak!", icon: "🏆", category: "streak", criteria: { type: "streak", days: 365 }, xpReward: 2000, sortOrder: 44, rarity: "legendary", isActive: true },

  // Reviews
  { slug: "first-review", title: "First Review", description: "Complete your first SRS review", icon: "🔄", category: "review", criteria: { type: "first_review" }, xpReward: 5, sortOrder: 50, rarity: "common", isActive: true },
  { slug: "100-reviews", title: "Review Rookie", description: "Complete 100 SRS reviews", icon: "🔁", category: "review", criteria: { type: "reviews_completed", count: 100 }, xpReward: 30, sortOrder: 51, rarity: "common", isActive: true },
  { slug: "1000-reviews", title: "Review Machine", description: "Complete 1,000 SRS reviews", icon: "⚡", category: "review", criteria: { type: "reviews_completed", count: 1000 }, xpReward: 200, sortOrder: 52, rarity: "rare", isActive: true },

  // Tests / JLPT
  { slug: "first-test", title: "Test Taker", description: "Complete your first practice test", icon: "📋", category: "learning", criteria: { type: "tests_completed", count: 1 }, xpReward: 15, sortOrder: 60, rarity: "common", isActive: true },
  { slug: "jlpt-practice-master", title: "JLPT Practice Master", description: "Pass 5 JLPT practice tests", icon: "🎌", category: "learning", criteria: { type: "tests_passed", count: 5 }, xpReward: 200, sortOrder: 61, rarity: "rare", isActive: true },

  // XP / Level
  { slug: "100-xp", title: "XP Starter", description: "Earn 100 XP", icon: "✨", category: "exploration", criteria: { type: "xp_total", amount: 100 }, xpReward: 10, sortOrder: 70, rarity: "common", isActive: true },
  { slug: "1000-xp", title: "XP Hunter", description: "Earn 1,000 XP", icon: "💫", category: "exploration", criteria: { type: "xp_total", amount: 1000 }, xpReward: 50, sortOrder: 71, rarity: "rare", isActive: true },
  { slug: "level-5", title: "Rising Star", description: "Reach level 5", icon: "⬆️", category: "exploration", criteria: { type: "level_reached", level: 5 }, xpReward: 50, sortOrder: 72, rarity: "common", isActive: true },
  { slug: "level-10", title: "Dedicated Learner", description: "Reach level 10", icon: "🌟", category: "exploration", criteria: { type: "level_reached", level: 10 }, xpReward: 100, sortOrder: 73, rarity: "rare", isActive: true },
];

// ─────────────────────────────────────────────
// AchievementEngine
// ─────────────────────────────────────────────

export const AchievementEngine = {

  /** Seed all achievement definitions into the database. Idempotent. */
  async seed(): Promise<number> {
    let created = 0;
    for (const seed of ACHIEVEMENT_SEEDS) {
      const existing = await db.select({ id: achievements.id }).from(achievements)
        .where(eq(achievements.slug, seed.slug)).limit(1);
      if (existing.length === 0) {
        await db.insert(achievements).values({ id: genId("ach"), ...seed });
        created++;
      }
    }
    return created;
  },

  /** Get all achievements with unlock status for a learner. */
  async getAll(learnerId: string): Promise<AchievementView[]> {
    const allAchievements = await db.select().from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(asc(achievements.sortOrder));

    const unlocked = await db.select().from(userAchievements)
      .where(eq(userAchievements.learnerId, learnerId));
    const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u]));

    const stats = await this._getLearnerStats(learnerId);

    return allAchievements.map((a) => {
      const ua = unlockedMap.get(a.id);
      const progress = ua ? null : this._calculateProgress(a.criteria as CriteriaType, stats);
      return {
        id: a.id, slug: a.slug, title: a.title, description: a.description,
        icon: a.icon, category: a.category, rarity: a.rarity, xpReward: a.xpReward,
        unlocked: !!ua, unlockedAt: ua?.unlockedAt ?? null, progress,
      };
    });
  },

  /**
   * Check all achievements and unlock any that are newly earned.
   * Call this after significant learner actions.
   */
  async checkAndUnlock(learnerId: string): Promise<UnlockResult[]> {
    const allAchievements = await db.select().from(achievements)
      .where(eq(achievements.isActive, true));

    const unlocked = await db.select({ achievementId: userAchievements.achievementId })
      .from(userAchievements)
      .where(eq(userAchievements.learnerId, learnerId));
    const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

    const stats = await this._getLearnerStats(learnerId);
    const newUnlocks: UnlockResult[] = [];

    for (const a of allAchievements) {
      if (unlockedIds.has(a.id)) continue;

      const met = this._criteriaMet(a.criteria as CriteriaType, stats);
      if (!met) continue;

      // Unlock!
      await db.insert(userAchievements).values({
        id: genId("ua"),
        learnerId,
        achievementId: a.id,
        seen: false,
      });

      // Award XP
      let xpAwarded = 0;
      if (a.xpReward > 0) {
        const xpResult = await XPEngine.emit(learnerId, {
          type: "achievement",
          amount: a.xpReward,
          sourceId: a.id,
          description: `🏆 ${a.title}! (+${a.xpReward} XP)`,
        });
        xpAwarded = xpResult.finalAmount;
      }

      newUnlocks.push({
        achievementId: a.id, slug: a.slug, title: a.title,
        icon: a.icon, xpAwarded, newUnlock: true,
      });
    }

    return newUnlocks;
  },

  /** Mark achievements as seen (dismiss notifications). */
  async markSeen(learnerId: string, achievementIds: string[]): Promise<number> {
    let updated = 0;
    for (const aid of achievementIds) {
      const result = await db.update(userAchievements)
        .set({ seen: true })
        .where(and(eq(userAchievements.learnerId, learnerId), eq(userAchievements.achievementId, aid)))
        .returning({ id: userAchievements.id });
      updated += result.length;
    }
    return updated;
  },

  /** Get unseen (new) achievements for notification display. */
  async getUnseen(learnerId: string): Promise<AchievementView[]> {
    const unseen = await db.select().from(userAchievements)
      .where(and(eq(userAchievements.learnerId, learnerId), eq(userAchievements.seen, false)));

    const result: AchievementView[] = [];
    for (const ua of unseen) {
      const [a] = await db.select().from(achievements).where(eq(achievements.id, ua.achievementId)).limit(1);
      if (a) {
        result.push({
          id: a.id, slug: a.slug, title: a.title, description: a.description,
          icon: a.icon, category: a.category, rarity: a.rarity, xpReward: a.xpReward,
          unlocked: true, unlockedAt: ua.unlockedAt, progress: null,
        });
      }
    }
    return result;
  },

  // ─── Internal ───

  async _getLearnerStats(learnerId: string): Promise<Record<string, number>> {
    const [xpRes] = await db.select({ t: sql<number>`COALESCE(SUM(amount),0)::int` }).from(xpEvents).where(eq(xpEvents.learnerId, learnerId));
    const [wordsRes] = await db.select({ t: sql<number>`count(*)::int` }).from(vocabularyProgress).where(and(eq(vocabularyProgress.learnerId, learnerId), sql`mastery != 'unseen'`));
    const [wordsMastered] = await db.select({ t: sql<number>`count(*)::int` }).from(vocabularyProgress).where(and(eq(vocabularyProgress.learnerId, learnerId), eq(vocabularyProgress.mastery, "mastered")));
    const [kanjiRes] = await db.select({ t: sql<number>`count(*)::int` }).from(kanjiProgress).where(and(eq(kanjiProgress.learnerId, learnerId), sql`mastery != 'unseen'`));
    const [kanjiMastered] = await db.select({ t: sql<number>`count(*)::int` }).from(kanjiProgress).where(and(eq(kanjiProgress.learnerId, learnerId), eq(kanjiProgress.mastery, "mastered")));
    const [grammarRes] = await db.select({ t: sql<number>`count(*)::int` }).from(grammarProgress).where(and(eq(grammarProgress.learnerId, learnerId), sql`mastery != 'unseen'`));
    const [lessonsRes] = await db.select({ t: sql<number>`count(*)::int` }).from(lessonProgress).where(eq(lessonProgress.learnerId, learnerId));
    const [testsRes] = await db.select({ t: sql<number>`count(*)::int` }).from(testResults).where(eq(testResults.learnerId, learnerId));
    const [testsPassed] = await db.select({ t: sql<number>`count(*)::int` }).from(testResults).where(and(eq(testResults.learnerId, learnerId), eq(testResults.passed, true)));
    const [streakRes] = await db.select().from(streaks).where(eq(streaks.learnerId, learnerId)).limit(1);
    const [reviewsRes] = await db.select({ t: sql<number>`count(*)::int` }).from(srsReviews).where(eq(srsReviews.learnerId, learnerId));

    const totalXp = xpRes?.t ?? 0;
    const level = Math.floor(totalXp / 100) + 1;

    return {
      xp_total: totalXp,
      level,
      words_learned: wordsRes?.t ?? 0,
      words_mastered: wordsMastered?.t ?? 0,
      kanji_learned: kanjiRes?.t ?? 0,
      kanji_mastered: kanjiMastered?.t ?? 0,
      grammar_learned: grammarRes?.t ?? 0,
      lessons_completed: lessonsRes?.t ?? 0,
      tests_completed: testsRes?.t ?? 0,
      tests_passed: testsPassed?.t ?? 0,
      streak: streakRes?.currentStreak ?? 0,
      reviews_completed: reviewsRes?.t ?? 0,
    };
  },

  _criteriaMet(criteria: CriteriaType, stats: Record<string, number>): boolean {
    switch (criteria.type) {
      case "xp_total": return stats.xp_total >= criteria.amount;
      case "words_learned": return stats.words_learned >= criteria.count;
      case "words_mastered": return stats.words_mastered >= criteria.count;
      case "kanji_learned": return stats.kanji_learned >= criteria.count;
      case "kanji_mastered": return stats.kanji_mastered >= criteria.count;
      case "grammar_learned": return stats.grammar_learned >= criteria.count;
      case "lessons_completed": return stats.lessons_completed >= criteria.count;
      case "tests_completed": return stats.tests_completed >= criteria.count;
      case "tests_passed": return stats.tests_passed >= criteria.count;
      case "streak": return stats.streak >= criteria.days;
      case "reviews_completed": return stats.reviews_completed >= criteria.count;
      case "level_reached": return stats.level >= criteria.level;
      case "first_lesson": return stats.lessons_completed >= 1;
      case "first_review": return stats.reviews_completed >= 1;
      default: return false;
    }
  },

  _calculateProgress(criteria: CriteriaType, stats: Record<string, number>): number {
    let current = 0, target = 1;
    switch (criteria.type) {
      case "xp_total": current = stats.xp_total; target = criteria.amount; break;
      case "words_learned": current = stats.words_learned; target = criteria.count; break;
      case "words_mastered": current = stats.words_mastered; target = criteria.count; break;
      case "kanji_learned": current = stats.kanji_learned; target = criteria.count; break;
      case "kanji_mastered": current = stats.kanji_mastered; target = criteria.count; break;
      case "grammar_learned": current = stats.grammar_learned; target = criteria.count; break;
      case "lessons_completed": current = stats.lessons_completed; target = criteria.count; break;
      case "tests_completed": current = stats.tests_completed; target = criteria.count; break;
      case "tests_passed": current = stats.tests_passed; target = criteria.count; break;
      case "streak": current = stats.streak; target = criteria.days; break;
      case "reviews_completed": current = stats.reviews_completed; target = criteria.count; break;
      case "level_reached": current = stats.level; target = criteria.level; break;
      case "first_lesson": current = stats.lessons_completed; target = 1; break;
      case "first_review": current = stats.reviews_completed; target = 1; break;
    }
    return Math.min(100, Math.round((current / target) * 100));
  },
};
