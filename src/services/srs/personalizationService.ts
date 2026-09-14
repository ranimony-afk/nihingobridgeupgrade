import { db } from "@/db";
import {
  srsPersonalization as prefsTable,
  srsReviews as reviewsTable,
  srsCards as cardsTable,
  srsDecks as decksTable,
  questions as questionsTable,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  DayWindow,
  LearnerProfile,
  PersonalAreaStat,
  PersonalCardStat,
  PersonalizationPrefs,
  PersonalizedPlan,
  PersonalizedResponse,
  DailySettings,
  SrsCardState,
  SrsPhase,
  SrsRating,
  SESSION_QUEUE_ORDERS,
  SessionQueueOrder,
} from "@/types/srs";
import { DailyQueueService, DEFAULT_DAILY_SETTINGS, resolveDayWindow } from "./dailyQueueService";
import { getScheduler, resolveParams } from "./scheduler";
import { describeInterval } from "./strategies/shared";

export const DEFAULT_PERSONALIZATION: PersonalizationPrefs = {
  weaknessWeight: 0.5,
  urgencyWeight: 0.3,
  difficultyWeight: 0.2,
  preferWeakAreas: true,
  maxWeakCardsPerSession: 0,
  autoAdaptTargets: true,
  weakFirst: true,
};

const DAY_MS = 86_400_000;

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class PersonalizationService {
  /* ============================================================
   * DAILY NEW-INTRODUCED COUNT
   * Derived from the review log (matching the 11.2/11.3 convention)
   * rather than stored, so it cannot drift.
   * ============================================================ */
  static async countNewIntroducedToday(userId: string, day: DayWindow): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.userId, userId),
          sql`${reviewsTable.stateBefore} ->> 'repetitions' = '0'`,
          gte(reviewsTable.reviewedAt, new Date(day.start)),
          lte(reviewsTable.reviewedAt, new Date(day.end))
        )
      );
    return row?.count ?? 0;
  }

  /* ============================================================
   * PREFERENCES — the only thing persisted
   * ============================================================ */
  static async getPrefs(userId = "anonymous-user"): Promise<PersonalizationPrefs> {
    const [row] = await db
      .select()
      .from(prefsTable)
      .where(eq(prefsTable.userId, userId))
      .limit(1);

    if (!row) return { ...DEFAULT_PERSONALIZATION };

    return {
      weaknessWeight: clamp(row.weaknessWeight, 0, 1, DEFAULT_PERSONALIZATION.weaknessWeight),
      urgencyWeight: clamp(row.urgencyWeight, 0, 1, DEFAULT_PERSONALIZATION.urgencyWeight),
      difficultyWeight: clamp(row.difficultyWeight, 0, 1, DEFAULT_PERSONALIZATION.difficultyWeight),
      preferWeakAreas: row.preferWeakAreas,
      maxWeakCardsPerSession: clamp(row.maxWeakCardsPerSession, 0, 200, 0),
      autoAdaptTargets: row.autoAdaptTargets,
      weakFirst: row.weakFirst,
    };
  }

  static async updatePrefs(
    userId: string,
    patch: Partial<PersonalizationPrefs>
  ): Promise<PersonalizationPrefs> {
    const current = await this.getPrefs(userId);
    const next: PersonalizationPrefs = {
      weaknessWeight: clamp(patch.weaknessWeight ?? current.weaknessWeight, 0, 1, current.weaknessWeight),
      urgencyWeight: clamp(patch.urgencyWeight ?? current.urgencyWeight, 0, 1, current.urgencyWeight),
      difficultyWeight: clamp(
        patch.difficultyWeight ?? current.difficultyWeight,
        0,
        1,
        current.difficultyWeight
      ),
      preferWeakAreas:
        typeof patch.preferWeakAreas === "boolean" ? patch.preferWeakAreas : current.preferWeakAreas,
      maxWeakCardsPerSession: clamp(
        patch.maxWeakCardsPerSession ?? current.maxWeakCardsPerSession,
        0,
        200,
        current.maxWeakCardsPerSession
      ),
      autoAdaptTargets:
        typeof patch.autoAdaptTargets === "boolean" ? patch.autoAdaptTargets : current.autoAdaptTargets,
      weakFirst: typeof patch.weakFirst === "boolean" ? patch.weakFirst : current.weakFirst,
    };

    // Normalise so the three weights always sum to a sane 0–1 envelope.
    const sum = next.weaknessWeight + next.urgencyWeight + next.difficultyWeight;
    if (sum > 0) {
      next.weaknessWeight = Math.round((next.weaknessWeight / sum) * 100) / 100;
      next.urgencyWeight = Math.round((next.urgencyWeight / sum) * 100) / 100;
      next.difficultyWeight = Math.round((next.difficultyWeight / sum) * 100) / 100;
    }

    await db
      .insert(prefsTable)
      .values({ userId, ...next, updatedAt: new Date() })
      .onConflictDoUpdate({ target: prefsTable.userId, set: { ...next, updatedAt: new Date() } });

    return next;
  }

  /* ============================================================
   * KNOWLEDGE CONTEXT — map cards to question categories/tags so
   * personalization reasons over platform knowledge, not guesses.
   * ============================================================ */
  private static async loadKnowledgeContext(sourceQuestionIds: string[]) {
    const byQuestion = new Map<
      string,
      { category: string; tags: string[]; jlptLevel: string }
    >();

    if (sourceQuestionIds.length === 0) return byQuestion;

    const rows = await db
      .select({
        id: questionsTable.id,
        category: questionsTable.category,
        tags: questionsTable.tags,
        jlptLevel: questionsTable.jlptLevel,
      })
      .from(questionsTable)
      .where(inArray(questionsTable.id, sourceQuestionIds));

    for (const r of rows) {
      byQuestion.set(r.id, {
        category: r.category,
        tags: Array.isArray(r.tags) ? r.tags : [],
        jlptLevel: r.jlptLevel,
      });
    }
    return byQuestion;
  }

  /* ============================================================
   * LEARNER PROFILE — derived entirely from the review log
   * ============================================================ */
  static async buildProfile(
    userId = "anonymous-user",
    options: { deckId?: string | null; trailingDays?: number } = {}
  ): Promise<LearnerProfile> {
    const deckRows = await db.select().from(decksTable).where(eq(decksTable.ownerId, userId));
    const scoped = deckRows.filter(
      (d) => !d.isArchived && (!options.deckId || d.id === options.deckId)
    );
    const deckIds = scoped.map((d) => d.id);
    const deckMap = new Map(scoped.map((d) => [d.id, d]));

    const emptyProfile: LearnerProfile = {
      userId,
      generatedAt: new Date().toISOString(),
      cardsTracked: 0,
      cardsWithHistory: 0,
      newUntouched: 0,
      totals: { reviews: 0, correct: 0, accuracy: 0, lapses: 0, avgTimeMs: 0 },
      velocity: { activeDays: 0, avgReviewsPerActiveDay: 0, reviewsPerDay: 0, windowDays: 0 },
      retention: { measurableReviews: 0, successful: 0, percent: 0 },
      weakAreas: [],
      strongestAreas: [],
      weakCards: [],
      recoveringCards: 0,
      strainIndex: 0,
    };

    if (deckIds.length === 0) return emptyProfile;

    const cardRows = await db
      .select()
      .from(cardsTable)
      .where(and(inArray(cardsTable.deckId, deckIds), eq(cardsTable.isSuspended, false)));
    const cardIds = cardRows.map((c) => c.id);

    const reviewRows =
      cardIds.length > 0
        ? await db
            .select({
              id: reviewsTable.id,
              cardId: reviewsTable.cardId,
              rating: reviewsTable.rating,
              wasCorrect: reviewsTable.wasCorrect,
              timeSpentMs: reviewsTable.timeSpentMs,
              intervalDays: reviewsTable.intervalDays,
              previousIntervalDays: reviewsTable.previousIntervalDays,
              stateBefore: reviewsTable.stateBefore,
              reviewedAt: reviewsTable.reviewedAt,
            })
            .from(reviewsTable)
            .where(inArray(reviewsTable.cardId, cardIds))
            .orderBy(desc(reviewsTable.reviewedAt))
        : [];

    const knowledge = await this.loadKnowledgeContext(
      cardRows.map((c) => c.sourceQuestionId).filter((v): v is string => Boolean(v))
    );

    const now = Date.now();

    /* ---------------- Per-card statistics ---------------- */
    const byCard = new Map<string, typeof reviewRows>();
    for (const r of reviewRows) {
      const list = byCard.get(r.cardId) ?? [];
      list.push(r);
      byCard.set(r.cardId, list);
    }

    const stats: PersonalCardStat[] = [];

    for (const card of cardRows) {
      const rows = byCard.get(card.id) ?? [];
      const deck = deckMap.get(card.deckId);

      // Review log is newest-first; reverse to chronological.
      const chrono = [...rows].reverse();
      const attempts = chrono.length;
      const correct = chrono.filter((r) => r.wasCorrect).length;
      const lapses = chrono.filter((r) => r.rating === "again").length;
      const totalMs = chrono.reduce((s, r) => s + (r.timeSpentMs || 0), 0);

      const rawAccuracy = attempts > 0 ? correct / attempts : 0;
      // Laplace smoothing: 1/1 should not read as perfect.
      const smoothed = (correct + 1) / (attempts + 2);

      const last = chrono.length > 0 ? chrono[chrono.length - 1] : null;
      const daysSince = last
        ? Math.floor((now - new Date(last.reviewedAt).getTime()) / DAY_MS)
        : null;

      const recentSlice = chrono.slice(-3);
      const recentAccuracy =
        recentSlice.length >= 2
          ? recentSlice.filter((r) => r.wasCorrect).length / recentSlice.length
          : null;

      const trend =
        recentAccuracy !== null && attempts >= 3 ? recentAccuracy - rawAccuracy : null;

      /* ---- Weakness score ----
       * Base: smoothed inaccuracy, confidence-scaled by attempt count so a
       * single bad answer ranks well below a repeat failure pattern.
       */
      const confidence = attempts / (attempts + 3);
      let weakness = (1 - smoothed) * (0.35 + 0.65 * confidence);

      // Recent failure bumps priority (they likely just forgot it again).
      if (last && !last.wasCorrect) weakness += 0.12;

      // Downward trend bumps priority.
      if (trend !== null && trend < -0.15) weakness += 0.08 * Math.min(1, -trend / 0.5);

      // Long-unseen material decays toward needing attention.
      if (daysSince !== null) weakness += Math.min(0.15, daysSince / 120);

      const qMeta = card.sourceQuestionId ? knowledge.get(card.sourceQuestionId) : undefined;

      stats.push({
        cardId: card.id,
        front: card.front,
        cardType: card.cardType,
        deckId: card.deckId,
        deckName: deck?.name ?? card.deckId,
        attempts,
        correct,
        lapses,
        smoothedAccuracy: Math.round(smoothed * 1000) / 1000,
        rawAccuracy: Math.round(rawAccuracy * 1000) / 1000,
        avgTimeMs: attempts > 0 ? Math.round(totalMs / attempts) : 0,
        lastRating: (last?.rating as SrsRating) ?? null,
        daysSinceReview: daysSince,
        recentAccuracy: recentAccuracy === null ? null : Math.round(recentAccuracy * 1000) / 1000,
        trend: trend === null ? null : Math.round(trend * 1000) / 1000,
        weakness: Math.max(0, Math.min(1, Math.round(weakness * 1000) / 1000)),
        intervalDays: card.intervalDays,
        easeFactor: card.easeFactor,
        isLearning: card.isLearning,
        phase: (card.phase as SrsPhase) || "learning",
        // Non-declared extras are carried via the area mapping below.
        ...({ questionCategory: qMeta?.category, tags: qMeta?.tags ?? [] } as Record<string, unknown>),
      } as PersonalCardStat);
    }

    /* ---------------- Area rollups ---------------- */
    const dimensionKeys: Array<PersonalAreaStat["dimension"]> = [
      "cardType",
      "deck",
      "category",
      "tag",
    ];

    const buckets = new Map<
      PersonalAreaStat["dimension"],
      Map<string, { attempts: number; correct: number; lapses: number; cards: Set<string> }>
    >();
    for (const dim of dimensionKeys) buckets.set(dim, new Map());

    const addTo = (
      dim: PersonalAreaStat["dimension"],
      key: string,
      label: string,
      stat: PersonalCardStat
    ) => {
      if (!key) return;
      const dimMap = buckets.get(dim)!;
      const entry =
        dimMap.get(key) ?? { attempts: 0, correct: 0, lapses: 0, cards: new Set<string>() };
      entry.attempts += stat.attempts;
      entry.correct += stat.correct;
      entry.lapses += stat.lapses;
      entry.cards.add(stat.cardId);
      dimMap.set(key, entry);
      // remember label
      labels.set(`${dim}:${key}`, label);
    };

    const labels = new Map<string, string>();

    for (const stat of stats) {
      if (stat.attempts === 0) continue;
      addTo("cardType", stat.cardType, stat.cardType, stat);
      addTo("deck", stat.deckId, stat.deckName, stat);

      const extra = stat as PersonalCardStat & {
        questionCategory?: string;
        tags?: string[];
      };
      if (extra.questionCategory) {
        addTo("category", extra.questionCategory, extra.questionCategory, stat);
      }
      for (const tag of extra.tags ?? []) addTo("tag", tag, tag, stat);
    }

    const allAreas: PersonalAreaStat[] = [];
    for (const [dim, dimMap] of buckets.entries()) {
      for (const [key, agg] of dimMap.entries()) {
        const accuracy = agg.attempts > 0 ? agg.correct / agg.attempts : 0;
        const smoothed = (agg.correct + 1) / (agg.attempts + 2);
        const confidence = agg.cards.size / (agg.cards.size + 2);
        const weakness = Math.max(
          0,
          Math.min(1, (1 - smoothed) * (0.3 + 0.7 * confidence) + (agg.lapses > 0 ? 0.05 : 0))
        );

        allAreas.push({
          areaKey: key,
          areaLabel: labels.get(`${dim}:${key}`) ?? key,
          dimension: dim,
          attempts: agg.attempts,
          correct: agg.correct,
          accuracy: Math.round(accuracy * 1000) / 1000,
          uniqueCards: agg.cards.size,
          lapses: agg.lapses,
          weakness: Math.round(weakness * 1000) / 1000,
          isReliable: agg.attempts >= 4,
        });
      }
    }

    const ranked = [...allAreas].sort((a, b) => b.weakness - a.weakness);

    /* ---------------- Totals, velocity, retention ---------------- */
    const totalReviews = reviewRows.length;
    const totalCorrect = reviewRows.filter((r) => r.wasCorrect).length;
    const totalLapses = reviewRows.filter((r) => r.rating === "again").length;
    const totalTime = reviewRows.reduce((s, r) => s + (r.timeSpentMs || 0), 0);

    const trailingDays = options.trailingDays ?? 14;
    const windowStart = new Date(now - trailingDays * DAY_MS);
    const windowRows = reviewRows.filter((r) => new Date(r.reviewedAt) >= windowStart);

    const activeDays = new Set(
      windowRows.map((r) => new Date(r.reviewedAt).toISOString().slice(0, 10))
    ).size;

    /* Retention is only measurable when a card's interval had fully elapsed
     * before the review — reviewing early proves nothing about retention. */
    const measurable = reviewRows.filter((r) => {
      const prev = Number(r.previousIntervalDays ?? 0);
      return prev >= 1;
    });

    const recovering = stats.filter(
      (s) => s.lapses > 0 && s.lastRating !== null && s.lastRating !== "again"
    ).length;

    const strain =
      stats.length > 0
        ? stats.reduce((s, c) => s + (c.intervalDays > 0 ? 1 / Math.max(1, c.intervalDays) : 1), 0) /
          stats.length
        : 0;

    return {
      userId,
      generatedAt: new Date().toISOString(),
      cardsTracked: cardRows.length,
      cardsWithHistory: stats.filter((s) => s.attempts > 0).length,
      newUntouched: cardRows.filter((c) => c.totalReviews === 0).length,
      totals: {
        reviews: totalReviews,
        correct: totalCorrect,
        accuracy: totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 1000) / 10 : 0,
        lapses: totalLapses,
        avgTimeMs: totalReviews > 0 ? Math.round(totalTime / totalReviews) : 0,
      },
      velocity: {
        activeDays,
        avgReviewsPerActiveDay: activeDays > 0 ? Math.round((windowRows.length / activeDays) * 10) / 10 : 0,
        reviewsPerDay: Math.round((windowRows.length / trailingDays) * 10) / 10,
        windowDays: trailingDays,
      },
      retention: {
        measurableReviews: measurable.length,
        successful: measurable.filter((r) => r.wasCorrect).length,
        percent:
          measurable.length > 0
            ? Math.round(
                (measurable.filter((r) => r.wasCorrect).length / measurable.length) * 1000
              ) / 10
            : 0,
      },
      weakAreas: ranked.filter((a) => a.isReliable).slice(0, 6),
      strongestAreas: [...allAreas]
        .filter((a) => a.isReliable)
        .sort((a, b) => a.weakness - b.weakness)
        .slice(0, 4),
      weakCards: [...stats]
        .filter((s) => s.attempts >= 1)
        .sort((a, b) => b.weakness - a.weakness)
        .slice(0, 12),
      recoveringCards: recovering,
      strainIndex: Math.round(strain * 1000) / 1000,
    };
  }

  /* ============================================================
   * PERSONALIZED ORDERING — selection only, never due dates
   * ============================================================ */
  static async orderPersonalized(
    cardIds: string[],
    prefs: PersonalizationPrefs
  ): Promise<Array<{ cardId: string; score: number; reason: string }>> {
    if (cardIds.length === 0) return [];

    const cardRows = await db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds));
    const deckRows = await db.select().from(decksTable);
    const deckMap = new Map(deckRows.map((d) => [d.id, d]));

    const reviewRows = await db
      .select({
        cardId: reviewsTable.cardId,
        rating: reviewsTable.rating,
        wasCorrect: reviewsTable.wasCorrect,
        reviewedAt: reviewsTable.reviewedAt,
        timeSpentMs: reviewsTable.timeSpentMs,
      })
      .from(reviewsTable)
      .where(inArray(reviewsTable.cardId, cardIds))
      .orderBy(desc(reviewsTable.reviewedAt));

    const byCard = new Map<string, typeof reviewRows>();
    for (const r of reviewRows) {
      const list = byCard.get(r.cardId) ?? [];
      list.push(r);
      byCard.set(r.cardId, list);
    }

    const now = Date.now();
    const scored = cardRows.map((card) => {
      const rows = byCard.get(card.id) ?? [];
      const chrono = [...rows].reverse();
      const attempts = chrono.length;
      const correct = chrono.filter((r) => r.wasCorrect).length;
      const lapses = chrono.filter((r) => r.rating === "again").length;

      const smoothed = (correct + 1) / (attempts + 2);
      const confidence = attempts / (attempts + 3);
      const inaccuracy = (1 - smoothed) * (0.35 + 0.65 * confidence);

      const last = chrono.length > 0 ? chrono[chrono.length - 1] : null;
      const daysSince = last ? (now - new Date(last.reviewedAt).getTime()) / DAY_MS : 999;

      // Urgency: how far past due, saturating at ~14 days.
      const overdueDays = Math.max(0, (now - new Date(card.dueAt).getTime()) / DAY_MS);
      const urgency = Math.min(1, overdueDays / 14);

      // Scheduler difficulty as a secondary signal only.
      const difficulty = card.isLearning ? 0.5 : Math.min(1, Math.max(0, (3.5 - card.easeFactor) / 2.2));

      const weaknessScore = inaccuracy + (last && !last.wasCorrect ? 0.12 : 0) + lapses * 0.03;
      const reason =
        attempts === 0
          ? "new card"
          : last && !last.wasCorrect
          ? `failed last attempt (${attempts} review${attempts === 1 ? "" : "s"}, ${lapses} lapse${lapses === 1 ? "" : "s"})`
          : lapses > 0
          ? `${lapses} lifetime lapse${lapses === 1 ? "" : "s"}`
          : `${Math.round((1 - smoothed) * 100)}% smoothed inaccuracy`;

      const score =
        weaknessScore * prefs.weaknessWeight +
        urgency * prefs.urgencyWeight +
        difficulty * prefs.difficultyWeight;

      return {
        cardId: card.id,
        score: Math.round(score * 1000) / 1000,
        reason,
        isNew: attempts === 0,
      };
    });

    return scored
      .sort((a, b) => {
        if (prefs.weakFirst) {
          // Established weak cards lead; brand-new cards follow, then the rest.
          const aNew = a.isNew ? 1 : 0;
          const bNew = b.isNew ? 1 : 0;
          if (aNew !== bNew) return aNew - bNew;
        }
        return b.score - a.score;
      })
      .map(({ cardId, score, reason }) => ({ cardId, score, reason }));
  }

  /* ============================================================
   * TARGET ADAPTATION — suggest, never silently apply
   * ============================================================ */
  static suggestTargetAdjustment(
    profile: LearnerProfile,
    settings: { dailyNewTarget: number; dailyReviewTarget: number },
    prefs: PersonalizationPrefs
  ) {
    if (!prefs.autoAdaptTargets) {
      return {
        currentNewTarget: settings.dailyNewTarget,
        suggestedNewTarget: settings.dailyNewTarget,
        direction: "hold" as const,
        reason: "Automatic target adaptation is turned off.",
      };
    }

    const { accuracy, reviews } = profile.totals;
    const velocity = profile.velocity.reviewsPerDay;
    const weakCount = profile.weakAreas.length;

    // Not enough evidence yet — hold.
    if (reviews < 12) {
      return {
        currentNewTarget: settings.dailyNewTarget,
        suggestedNewTarget: settings.dailyNewTarget,
        direction: "hold" as const,
        reason: `Only ${reviews} review(s) recorded — need at least 12 before suggesting a change.`,
      };
    }

    // Struggling: high weakness, low accuracy, or slow pace → reduce new load.
    if (accuracy < 75 || weakCount >= 3 || profile.retention.percent < 70) {
      const suggested = Math.max(0, settings.dailyNewTarget - 5);
      const direction = suggested === settings.dailyNewTarget ? ("hold" as const) : ("down" as const);
      return {
        currentNewTarget: settings.dailyNewTarget,
        suggestedNewTarget: suggested,
        direction,
        reason:
          `Accuracy is ${accuracy}% across ${profile.weakAreas.length} weak area(s). ` +
          `Cutting new cards to ${suggested}/day shifts capacity toward repairing weak material.`,
      };
    }

    // Comfortable margin → cautiously increase.
    if (accuracy >= 88 && profile.retention.percent >= 85) {
      const suggested = Math.min(50, settings.dailyNewTarget + 3);
      const direction = suggested === settings.dailyNewTarget ? ("hold" as const) : ("up" as const);
      return {
        currentNewTarget: settings.dailyNewTarget,
        suggestedNewTarget: suggested,
        direction,
        reason: `Accuracy ${accuracy}% with ${profile.retention.percent}% retention gives headroom — raising to ${suggested} new/day.`,
      };
    }

    return {
      currentNewTarget: settings.dailyNewTarget,
      suggestedNewTarget: settings.dailyNewTarget,
      direction: "hold" as const,
      reason: `Accuracy ${accuracy}% is in a healthy band — holding the current target.`,
    };
  }

  /* ============================================================
   * PLAN — the personalized recommendation for right now
   * ============================================================ */
  static async buildPlan(input: {
    userId?: string;
    deckId?: string | null;
    profile?: LearnerProfile;
    day?: DayWindow;
  }): Promise<{ plan: PersonalizedPlan; prefs: PersonalizationPrefs; settings: DailySettings }> {
    const userId = input.userId || "anonymous-user";
    const prefs = await this.getPrefs(userId);
    const settings = await DailyQueueService.getSettings(userId);
    const profile = input.profile ?? (await this.buildProfile(userId, { deckId: input.deckId ?? null }));
    const day =
      input.day ?? resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);

    const now = new Date();

    const deckRows = await db.select().from(decksTable).where(eq(decksTable.ownerId, userId));
    const scoped = deckRows.filter(
      (d) => !d.isArchived && (!input.deckId || d.id === input.deckId)
    );
    const deckIds = scoped.map((d) => d.id);

    const candidateRows =
      deckIds.length > 0
        ? await db
            .select({
              id: cardsTable.id,
              dueAt: cardsTable.dueAt,
              totalReviews: cardsTable.totalReviews,
            })
            .from(cardsTable)
            .where(
              and(
                inArray(cardsTable.deckId, deckIds),
                eq(cardsTable.isSuspended, false),
                lte(cardsTable.dueAt, new Date(day.end))
              )
            )
        : [];

    const overdue = candidateRows.filter(
      (c) => new Date(c.dueAt).getTime() < new Date(day.start).getTime() && c.totalReviews > 0
    );
    const dueToday = candidateRows.filter(
      (c) => c.totalReviews > 0 && new Date(c.dueAt).getTime() >= new Date(day.start).getTime()
    );
    const fresh = candidateRows.filter((c) => c.totalReviews === 0);

    const reviewWorkload = overdue.length + dueToday.length;

    /* ---- Budget: personalised split ---- */
    const newRemaining = Math.max(0, settings.dailyNewTarget - (await this.countNewIntroducedToday(userId, day)));
    let newLimit = Math.min(fresh.length, newRemaining);
    let reviewLimit = Math.min(reviewWorkload, settings.dailyReviewTarget);

    // Weaken the new-card appetite when the learner is clearly struggling.
    const struggling = profile.totals.reviews >= 12 && profile.totals.accuracy < 78;
    if (struggling && newLimit > 0) {
      newLimit = Math.max(0, Math.floor(newLimit / 2));
    }

    // Guarantee capacity for weak material if the learner asked for it.
    if (prefs.preferWeakAreas && profile.weakCards.length > 0 && reviewLimit > 0) {
      const weakDue = profile.weakCards.filter((w) =>
        candidateRows.some((c) => c.id === w.cardId)
      ).length;
      if (weakDue > 0) {
        reviewLimit = Math.max(reviewLimit, Math.min(reviewWorkload, Math.max(6, weakDue + 4)));
      }
    }

    if (prefs.maxWeakCardsPerSession > 0) {
      reviewLimit = Math.min(reviewLimit, reviewLimit + prefs.maxWeakCardsPerSession);
    }

    reviewLimit = Math.max(0, Math.min(reviewLimit, reviewWorkload));
    newLimit = Math.max(0, newLimit);

    const order: SessionQueueOrder = "personalized";
    const sessionSize = reviewLimit + newLimit;
    const avgSec = profile.totals.avgTimeMs > 0 ? profile.totals.avgTimeMs / 1000 : 12;
    const estimatedMinutes = Math.max(1, Math.round((sessionSize * avgSec) / 60));

    /* ---- Narrative ---- */
    const rationale: string[] = [];
    rationale.push(
      `${reviewWorkload} card(s) are due today (${overdue.length} overdue, ${dueToday.length} inside today's window) with ${fresh.length} new available.`
    );

    if (profile.totals.reviews === 0) {
      rationale.push(
        "No review history yet — ordering falls back to urgency until personal accuracy data exists."
      );
    } else {
      rationale.push(
        `Lifetime accuracy ${profile.totals.accuracy}% across ${profile.totals.reviews} reviews; retention on fully-elapsed intervals is ${profile.retention.percent}%.`
      );
      if (profile.weakAreas.length > 0) {
        rationale.push(
          `Weakest reliable area: ${profile.weakAreas[0].areaLabel} at ${Math.round(
            profile.weakAreas[0].accuracy * 100
          )}% over ${profile.weakAreas[0].attempts} attempt(s).`
        );
      }
      if (profile.recoveringCards > 0) {
        rationale.push(
          `${profile.recoveringCards} card(s) previously lapsed are now being answered correctly — keep them in rotation.`
        );
      }
      if (struggling) {
        rationale.push(
          "Accuracy is below 78%, so the new-card allowance has been halved to protect review capacity."
        );
      }
    }

    const headline =
      profile.totals.reviews === 0
        ? "Starting out — urgency-based queue"
        : struggling
        ? `Repair mode — ${reviewLimit} review(s) prioritising weak material`
        : profile.weakAreas.length > 0
        ? `Personalized queue — ${profile.weakAreas[0].areaLabel} is your weakest area`
        : `Personalized queue — ${sessionSize} card(s) ready`;

    const adjustment = this.suggestTargetAdjustment(
      profile,
      { dailyNewTarget: settings.dailyNewTarget, dailyReviewTarget: settings.dailyReviewTarget },
      prefs
    );

    return {
      plan: {
        headline,
        rationale,
        suggested: { newLimit, reviewLimit, order, sessionSize, estimatedMinutes },
        focusAreas: profile.weakAreas.slice(0, 4).map((a) => ({
          label: a.areaLabel,
          weakness: a.weakness,
          accuracy: a.accuracy,
          attempts: a.attempts,
        })),
        targetAdjustment: adjustment,
        appliedPrefs: prefs,
      },
      prefs,
      settings,
    };
  }

  /* ============================================================
   * AGGREGATE RESPONSE
   * ============================================================ */
  static async getPersonalizedView(params: {
    userId?: string;
    deckId?: string | null;
    trailingDays?: number;
  }): Promise<PersonalizedResponse> {
    const userId = params.userId || "anonymous-user";
    const prefs = await this.getPrefs(userId);
    const settings = await DailyQueueService.getSettings(userId);
    const day = resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour);
    const profile = await this.buildProfile(userId, {
      deckId: params.deckId ?? null,
      trailingDays: params.trailingDays,
    });
    const { plan } = await this.buildPlan({
      userId,
      deckId: params.deckId ?? null,
      profile,
      day,
    });

    return {
      prefs,
      defaults: DEFAULT_PERSONALIZATION,
      profile,
      plan,
      day,
      settings,
    };
  }
}

/** Convenience re-export used by the session planner. */
export const PERSONALIZATION_DEFAULTS = DEFAULT_PERSONALIZATION;
export { SESSION_QUEUE_ORDERS, describeInterval, getScheduler, resolveParams, DEFAULT_DAILY_SETTINGS, WEEKDAYS };
