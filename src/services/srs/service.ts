/**
 * SRSService — Database-backed SRS operations.
 *
 * Connects the pure algorithm + scheduler to the PostgreSQL tables.
 * Manages decks, cards, reviews, and per-learner algorithm state.
 */

import { eq, and, asc, sql, desc, lte } from "drizzle-orm";
import { db } from "@/db";
import { srsDecks, srsCards, srsReviews, srsAlgorithmState } from "@/db/schema";
import { SRSAlgorithm, type CardSchedule, type Rating, type AlgorithmParams } from "./algorithm";
import { ReviewScheduler, type ReviewSessionPlan } from "./scheduler";

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type CardRow = typeof srsCards.$inferSelect;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CreateDeckInput {
  title: string;
  description?: string;
  isPublic?: boolean;
  newCardsPerDay?: number;
  maxReviewsPerDay?: number;
}

export interface AddCardInput {
  type: "vocabulary" | "kanji" | "grammar" | "sentence" | "custom";
  front: Record<string, unknown>;
  back: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
}

export interface ReviewInput {
  cardId: string;
  rating: Rating;
  reviewDurationMs?: number;
}

// ─────────────────────────────────────────────
// SRSService
// ─────────────────────────────────────────────

export const SRSService = {
  // ═══════════════════════════════════════════
  // DECKS
  // ═══════════════════════════════════════════

  async createDeck(learnerId: string, input: CreateDeckInput) {
    const [deck] = await db.insert(srsDecks).values({
      id: genId("deck"),
      learnerId,
      title: input.title,
      description: input.description ?? null,
      isPublic: input.isPublic ?? false,
      newCardsPerDay: input.newCardsPerDay ?? 20,
      maxReviewsPerDay: input.maxReviewsPerDay ?? 0,
    }).returning();
    return deck!;
  },

  async getDecks(learnerId: string) {
    const decks = await db.select().from(srsDecks)
      .where(eq(srsDecks.learnerId, learnerId))
      .orderBy(asc(srsDecks.createdAt));

    return Promise.all(decks.map(async (deck) => {
      const cardRows = await db.select().from(srsCards).where(eq(srsCards.deckId, deck.id));
      const stats = ReviewScheduler.deckStats(cardRows.map((c) => ({ schedule: this._toSchedule(c) })));
      return { ...deck, stats };
    }));
  },

  async deleteDeck(deckId: string, learnerId: string): Promise<boolean> {
    const result = await db.delete(srsDecks)
      .where(and(eq(srsDecks.id, deckId), eq(srsDecks.learnerId, learnerId)))
      .returning({ id: srsDecks.id });
    return result.length > 0;
  },

  // ═══════════════════════════════════════════
  // CARDS
  // ═══════════════════════════════════════════

  async addCard(deckId: string, input: AddCardInput) {
    const [card] = await db.insert(srsCards).values({
      id: genId("card"),
      deckId,
      type: input.type,
      front: input.front,
      back: input.back,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      state: "new",
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
    }).returning();

    // Update deck card count
    await db.update(srsDecks).set({
      cardCount: sql`card_count + 1`,
      updatedAt: new Date(),
    }).where(eq(srsDecks.id, deckId));

    return card!;
  },

  // ═══════════════════════════════════════════
  // REVIEW SESSION
  // ═══════════════════════════════════════════

  /** Get due cards for a deck, planned into a review session. */
  async getSession(deckId: string, learnerId: string): Promise<ReviewSessionPlan & { deckTitle: string }> {
    const [deck] = await db.select().from(srsDecks).where(eq(srsDecks.id, deckId)).limit(1);
    if (!deck) throw new Error("Deck not found");

    const cardRows = await db.select().from(srsCards).where(eq(srsCards.deckId, deckId));
    const cards = cardRows.map((c) => ({ id: c.id, schedule: this._toSchedule(c) }));

    // Count new cards introduced today
    const today = new Date().toISOString().slice(0, 10);
    const todayReviews = await db.select({ cardId: srsReviews.cardId })
      .from(srsReviews)
      .where(and(
        eq(srsReviews.learnerId, learnerId),
        sql`${srsReviews.reviewedAt}::date = ${today}::date`,
        eq(srsReviews.stateBefore, "new"),
      ));

    const plan = ReviewScheduler.planSession(
      cards, deck.newCardsPerDay, deck.maxReviewsPerDay, todayReviews.length,
    );

    return { ...plan, deckTitle: deck.title };
  },

  /** Submit a review for a card. */
  async submitReview(learnerId: string, input: ReviewInput) {
    const [card] = await db.select().from(srsCards).where(eq(srsCards.id, input.cardId)).limit(1);
    if (!card) throw new Error("Card not found");

    // Get learner's algorithm params
    const params = await this._getAlgorithmParams(learnerId);
    const cardSchedule = this._toSchedule(card);
    const now = new Date();

    // Run the algorithm
    const result = SRSAlgorithm.schedule(cardSchedule, input.rating, params, now);

    // Calculate elapsed days
    const elapsed = card.lastReviewAt
      ? Math.round((now.getTime() - card.lastReviewAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Record review (append-only)
    await db.insert(srsReviews).values({
      id: genId("rev"),
      cardId: card.id,
      learnerId,
      rating: input.rating,
      stateBefore: card.state as "new" | "learning" | "review" | "relearning",
      stateAfter: result.state,
      reviewDurationMs: input.reviewDurationMs ?? null,
      scheduledDays: card.scheduledDays,
      elapsedDays: elapsed,
    });

    // Update card
    await db.update(srsCards).set({
      state: result.state,
      stability: result.stability,
      difficulty: result.difficulty,
      scheduledDays: result.scheduledDays,
      due: result.due,
      reps: result.reps,
      lapses: result.lapses,
      elapsedDays: elapsed,
      lastReviewAt: now,
      updatedAt: now,
    }).where(eq(srsCards.id, card.id));

    // Update algorithm state counters
    await this._updateAlgorithmState(learnerId);

    return {
      cardId: card.id,
      rating: input.rating,
      previousState: card.state,
      newState: result.state,
      scheduledDays: result.scheduledDays,
      due: result.due,
      stability: result.stability,
      difficulty: result.difficulty,
    };
  },

  // ═══════════════════════════════════════════
  // STATS + FORECAST
  // ═══════════════════════════════════════════

  async getDeckStats(deckId: string) {
    const cardRows = await db.select().from(srsCards).where(eq(srsCards.deckId, deckId));
    return ReviewScheduler.deckStats(cardRows.map((c) => ({ schedule: this._toSchedule(c) })));
  },

  async getForecast(deckId: string, days = 14) {
    const cardRows = await db.select().from(srsCards).where(eq(srsCards.deckId, deckId));
    return ReviewScheduler.forecast(cardRows.map((c) => ({ schedule: this._toSchedule(c) })), days);
  },

  async getReviewHistory(learnerId: string, limit = 50) {
    return db.select().from(srsReviews)
      .where(eq(srsReviews.learnerId, learnerId))
      .orderBy(desc(srsReviews.reviewedAt))
      .limit(limit);
  },

  // ═══════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════

  _toSchedule(card: CardRow): CardSchedule {
    return {
      state: card.state as CardSchedule["state"],
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      due: card.due,
      lastReviewAt: card.lastReviewAt,
    };
  },

  async _getAlgorithmParams(learnerId: string): Promise<AlgorithmParams> {
    const [state] = await db.select().from(srsAlgorithmState)
      .where(eq(srsAlgorithmState.learnerId, learnerId)).limit(1);

    if (!state) {
      return SRSAlgorithm.defaultParams();
    }

    return {
      algorithm: (state.algorithm as "fsrs-5" | "sm-2") ?? "fsrs-5",
      weights: state.weights as number[] | null,
      desiredRetention: state.desiredRetention,
    };
  },

  async _updateAlgorithmState(learnerId: string): Promise<void> {
    const [existing] = await db.select().from(srsAlgorithmState)
      .where(eq(srsAlgorithmState.learnerId, learnerId)).limit(1);

    const totalReviews = await db.select({ c: sql<number>`count(*)::int` })
      .from(srsReviews).where(eq(srsReviews.learnerId, learnerId));

    if (!existing) {
      await db.insert(srsAlgorithmState).values({
        id: genId("alg"),
        learnerId,
        algorithm: "fsrs-5",
        desiredRetention: 0.9,
        totalReviews: totalReviews[0]?.c ?? 0,
      });
    } else {
      await db.update(srsAlgorithmState).set({
        totalReviews: totalReviews[0]?.c ?? 0,
        updatedAt: new Date(),
      }).where(eq(srsAlgorithmState.id, existing.id));
    }
  },
};
