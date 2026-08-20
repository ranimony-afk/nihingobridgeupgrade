/**
 * ReviewScheduler — Determines which cards are due and in what order.
 *
 * Pure logic layer between the algorithm (math) and the service (database).
 * No database access — operates on card arrays passed in.
 */

import { SRSAlgorithm, type CardSchedule, type Rating, type ScheduleResult, type AlgorithmParams } from "./algorithm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ScheduledCard {
  id: string;
  schedule: CardSchedule;
  /** Computed priority for review ordering. */
  priority: number;
  /** Current retrievability (probability of recall). */
  retrievability: number;
  /** Whether this card is overdue. */
  overdue: boolean;
  /** Days overdue (negative = not yet due). */
  overdueDays: number;
}

export interface ReviewSessionPlan {
  /** Cards to review, in priority order. */
  cards: ScheduledCard[];
  /** New cards to introduce (state === "new"). */
  newCards: ScheduledCard[];
  /** Total cards in this session. */
  totalCards: number;
  /** Estimated session duration in minutes. */
  estimatedMinutes: number;
}

export interface ReviewOutcome {
  cardId: string;
  rating: Rating;
  beforeState: CardSchedule;
  afterState: ScheduleResult;
  reviewDurationMs: number;
}

// ─────────────────────────────────────────────
// ReviewScheduler
// ─────────────────────────────────────────────

export const ReviewScheduler = {

  /**
   * Filter and sort cards into a review session.
   *
   * @param cards All cards in a deck with their scheduling state
   * @param newCardsPerDay Max new cards to introduce per day
   * @param maxReviewsPerDay Max reviews (0 = unlimited)
   * @param newCardsIntroducedToday How many new cards were already introduced today
   * @param now Current time
   */
  planSession(
    cards: { id: string; schedule: CardSchedule }[],
    newCardsPerDay: number = 20,
    maxReviewsPerDay: number = 0,
    newCardsIntroducedToday: number = 0,
    now: Date = new Date(),
  ): ReviewSessionPlan {
    const scheduled: ScheduledCard[] = [];
    const newCards: ScheduledCard[] = [];

    for (const card of cards) {
      const s = card.schedule;
      const retrievability = SRSAlgorithm.retrievability(s, now);
      const dueDateMs = s.due?.getTime() ?? 0;
      const nowMs = now.getTime();
      const overdueDays = (nowMs - dueDateMs) / (1000 * 60 * 60 * 24);
      const overdue = dueDateMs > 0 && dueDateMs <= nowMs;

      if (s.state === "new") {
        // New card — queue for introduction
        newCards.push({
          id: card.id,
          schedule: s,
          priority: 0,
          retrievability: 0,
          overdue: false,
          overdueDays: 0,
        });
      } else if (overdue || s.state === "learning" || s.state === "relearning") {
        // Due for review
        // Priority: learning/relearning first, then most overdue, then lowest retrievability
        let priority = 0;
        if (s.state === "learning" || s.state === "relearning") {
          priority = 1000 + overdueDays; // Learning cards always first
        } else {
          priority = overdueDays * 10 + (1 - retrievability) * 5;
        }

        scheduled.push({
          id: card.id,
          schedule: s,
          priority,
          retrievability: Math.round(retrievability * 1000) / 1000,
          overdue,
          overdueDays: Math.round(overdueDays * 10) / 10,
        });
      }
    }

    // Sort by priority (highest first)
    scheduled.sort((a, b) => b.priority - a.priority);

    // Apply daily limits
    const remainingNewSlots = Math.max(0, newCardsPerDay - newCardsIntroducedToday);
    const limitedNew = newCards.slice(0, remainingNewSlots);
    const limitedReviews = maxReviewsPerDay > 0 ? scheduled.slice(0, maxReviewsPerDay) : scheduled;

    const totalCards = limitedReviews.length + limitedNew.length;

    return {
      cards: limitedReviews,
      newCards: limitedNew,
      totalCards,
      estimatedMinutes: Math.ceil(totalCards * 0.5), // ~30 seconds per card
    };
  },

  /**
   * Process a review outcome through the algorithm.
   * Returns the new card state without persisting it.
   */
  processReview(
    card: CardSchedule,
    rating: Rating,
    params?: AlgorithmParams,
    now?: Date,
  ): ScheduleResult {
    return SRSAlgorithm.schedule(card, rating, params, now);
  },

  /**
   * Compute a forecast: how many reviews are expected per day
   * over the next N days for a set of cards.
   */
  forecast(
    cards: { schedule: CardSchedule }[],
    days: number = 14,
    now: Date = new Date(),
  ): { date: string; dueCount: number }[] {
    const result: { date: string; dueCount: number }[] = [];

    for (let d = 0; d < days; d++) {
      const targetDate = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
      const dayStart = new Date(targetDate.toISOString().slice(0, 10) + "T00:00:00Z");
      const dayEnd = new Date(targetDate.toISOString().slice(0, 10) + "T23:59:59Z");

      let count = 0;
      for (const card of cards) {
        const due = card.schedule.due;
        if (due && due >= dayStart && due <= dayEnd) count++;
        // Also count overdue cards on day 0
        if (d === 0 && due && due < dayStart && card.schedule.state !== "new") count++;
      }

      result.push({ date: targetDate.toISOString().slice(0, 10), dueCount: count });
    }

    return result;
  },

  /**
   * Compute deck statistics from card states.
   */
  deckStats(cards: { schedule: CardSchedule }[], now: Date = new Date()): {
    total: number;
    new: number;
    learning: number;
    review: number;
    relearning: number;
    dueNow: number;
    averageStability: number;
    averageRetrievability: number;
  } {
    let newCount = 0, learning = 0, review = 0, relearning = 0, dueNow = 0;
    let totalStability = 0, totalRetrievability = 0, reviewCount = 0;

    for (const card of cards) {
      const s = card.schedule;
      switch (s.state) {
        case "new": newCount++; break;
        case "learning": learning++; break;
        case "review": review++; break;
        case "relearning": relearning++; break;
      }
      if (s.due && s.due.getTime() <= now.getTime() && s.state !== "new") dueNow++;
      if (s.state === "review") {
        totalStability += s.stability;
        totalRetrievability += SRSAlgorithm.retrievability(s, now);
        reviewCount++;
      }
    }

    return {
      total: cards.length,
      new: newCount, learning, review, relearning, dueNow,
      averageStability: reviewCount > 0 ? Math.round(totalStability / reviewCount * 100) / 100 : 0,
      averageRetrievability: reviewCount > 0 ? Math.round(totalRetrievability / reviewCount * 1000) / 1000 : 0,
    };
  },
};
