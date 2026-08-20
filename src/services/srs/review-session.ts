/**
 * ReviewSession — Manages an interactive card review session.
 *
 * P46: Supports Again/Hard/Good/Easy ratings with:
 *   - Session lifecycle (start → flip → rate → next → complete)
 *   - Card presentation with front/back display
 *   - Per-card timing
 *   - Session summary with stats
 *   - Undo last review
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { srsCards, srsReviews, srsDecks } from "@/db/schema";
import { SRSService } from "./service";
import { ReviewScheduler } from "./scheduler";
import { SRSAlgorithm, type Rating, type CardSchedule } from "./algorithm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** A card presented for review (front shown first, back revealed on flip). */
export interface ReviewCard {
  cardId: string;
  /** Card type: vocabulary, kanji, grammar, sentence, custom */
  type: string;
  /** Front side content (question). */
  front: Record<string, unknown>;
  /** Back side content (answer) — null until flipped. */
  back: Record<string, unknown> | null;
  /** Current card state before this review. */
  state: string;
  /** How many times this card has been reviewed. */
  reps: number;
  /** How many times forgotten. */
  lapses: number;
  /** Current retrievability (0–1). */
  retrievability: number;
  /** Preview of what each rating would do. */
  ratingPreview: {
    again: { interval: string; state: string };
    hard: { interval: string; state: string };
    good: { interval: string; state: string };
    easy: { interval: string; state: string };
  } | null;
}

/** Result of rating a card. */
export interface RatingResult {
  cardId: string;
  rating: Rating;
  previousState: string;
  newState: string;
  scheduledDays: number;
  due: string;
  /** Time spent reviewing this card in ms. */
  reviewDurationMs: number;
}

/** Active review session state. */
export interface ActiveSession {
  deckId: string;
  deckTitle: string;
  /** Cards remaining (including current). */
  remaining: number;
  /** Cards already reviewed in this session. */
  reviewed: number;
  /** Current card to review (null if session complete). */
  currentCard: ReviewCard | null;
  /** Session timing. */
  startedAt: Date;
  elapsedSeconds: number;
  /** Per-rating counts for this session. */
  ratingCounts: { again: number; hard: number; good: number; easy: number };
}

/** Session completion summary. */
export interface SessionSummary {
  deckId: string;
  deckTitle: string;
  totalReviewed: number;
  newCardsIntroduced: number;
  ratingCounts: { again: number; hard: number; good: number; easy: number };
  accuracy: number;
  totalTimeSeconds: number;
  averageTimePerCard: number;
  /** Cards that need more work (rated again). */
  troubleCards: { cardId: string; front: Record<string, unknown>; lapses: number }[];
}

// ─────────────────────────────────────────────
// In-memory session store (per-request lifecycle)
// In production, use Redis or database-backed sessions.
// ─────────────────────────────────────────────

interface SessionState {
  deckId: string;
  deckTitle: string;
  cardQueue: string[];
  currentIndex: number;
  startedAt: Date;
  ratings: { cardId: string; rating: Rating; durationMs: number; wasNew: boolean }[];
  flipped: boolean;
  cardStartedAt: number;
}

const sessions = new Map<string, SessionState>();

function genSessionId(): string {
  return `rsess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────
// ReviewSession
// ─────────────────────────────────────────────

export const ReviewSession = {

  /** Start a new review session for a deck. */
  async start(deckId: string, learnerId: string): Promise<{ sessionId: string; session: ActiveSession }> {
    const sessionPlan = await SRSService.getSession(deckId, learnerId);

    // Interleave: due reviews first, then new cards
    const cardIds = [
      ...sessionPlan.cards.map((c) => c.id),
      ...sessionPlan.newCards.map((c) => c.id),
    ];

    if (cardIds.length === 0) {
      const [deck] = await db.select().from(srsDecks).where(eq(srsDecks.id, deckId)).limit(1);
      return {
        sessionId: "empty",
        session: {
          deckId, deckTitle: deck?.title ?? "Unknown",
          remaining: 0, reviewed: 0, currentCard: null,
          startedAt: new Date(), elapsedSeconds: 0,
          ratingCounts: { again: 0, hard: 0, good: 0, easy: 0 },
        },
      };
    }

    const sessionId = genSessionId();
    sessions.set(sessionId, {
      deckId,
      deckTitle: sessionPlan.deckTitle,
      cardQueue: cardIds,
      currentIndex: 0,
      startedAt: new Date(),
      ratings: [],
      flipped: false,
      cardStartedAt: Date.now(),
    });

    const session = await this._buildActiveSession(sessionId);
    return { sessionId, session };
  },

  /** Flip the current card to reveal the back. Returns rating preview. */
  async flip(sessionId: string): Promise<ReviewCard | null> {
    const state = sessions.get(sessionId);
    if (!state || state.currentIndex >= state.cardQueue.length) return null;

    state.flipped = true;
    const cardId = state.cardQueue[state.currentIndex]!;
    return this._loadCard(cardId, true);
  },

  /** Rate the current card and advance to the next. */
  async rate(sessionId: string, rating: Rating, learnerId: string): Promise<RatingResult | null> {
    const state = sessions.get(sessionId);
    if (!state || state.currentIndex >= state.cardQueue.length) return null;

    const cardId = state.cardQueue[state.currentIndex]!;
    const durationMs = Date.now() - state.cardStartedAt;

    // Get card state before review
    const [cardRow] = await db.select().from(srsCards).where(eq(srsCards.id, cardId)).limit(1);
    if (!cardRow) return null;
    const wasNew = cardRow.state === "new";

    // Submit to SRS service (persists the review)
    const result = await SRSService.submitReview(learnerId, {
      cardId,
      rating,
      reviewDurationMs: durationMs,
    });

    // Record in session
    state.ratings.push({ cardId, rating, durationMs, wasNew });
    state.currentIndex++;
    state.flipped = false;
    state.cardStartedAt = Date.now();

    return {
      cardId,
      rating,
      previousState: result.previousState,
      newState: result.newState,
      scheduledDays: result.scheduledDays,
      due: String(result.due).slice(0, 10),
      reviewDurationMs: durationMs,
    };
  },

  /** Get current session state. */
  async getSession(sessionId: string): Promise<ActiveSession | null> {
    if (!sessions.has(sessionId)) return null;
    return this._buildActiveSession(sessionId);
  },

  /** Complete the session and return summary. */
  async complete(sessionId: string): Promise<SessionSummary | null> {
    const state = sessions.get(sessionId);
    if (!state) return null;

    const counts = { again: 0, hard: 0, good: 0, easy: 0 };
    const troubleCards: SessionSummary["troubleCards"] = [];
    let newIntroduced = 0;

    for (const r of state.ratings) {
      counts[r.rating]++;
      if (r.wasNew) newIntroduced++;
    }

    // Find trouble cards (rated "again")
    const againCardIds = state.ratings.filter((r) => r.rating === "again").map((r) => r.cardId);
    for (const cid of againCardIds) {
      const [card] = await db.select().from(srsCards).where(eq(srsCards.id, cid)).limit(1);
      if (card) {
        troubleCards.push({
          cardId: card.id,
          front: card.front as Record<string, unknown>,
          lapses: card.lapses,
        });
      }
    }

    const totalTime = state.ratings.reduce((s, r) => s + r.durationMs, 0) / 1000;
    const totalReviewed = state.ratings.length;

    // Clean up session
    sessions.delete(sessionId);

    return {
      deckId: state.deckId,
      deckTitle: state.deckTitle,
      totalReviewed,
      newCardsIntroduced: newIntroduced,
      ratingCounts: counts,
      accuracy: totalReviewed > 0 ? Math.round(((counts.good + counts.easy) / totalReviewed) * 100) : 0,
      totalTimeSeconds: Math.round(totalTime),
      averageTimePerCard: totalReviewed > 0 ? Math.round(totalTime / totalReviewed * 10) / 10 : 0,
      troubleCards,
    };
  },

  /** Undo the last review (revert card state). */
  async undo(sessionId: string, learnerId: string): Promise<boolean> {
    const state = sessions.get(sessionId);
    if (!state || state.ratings.length === 0) return false;

    const lastRating = state.ratings.pop()!;
    state.currentIndex = Math.max(0, state.currentIndex - 1);
    state.flipped = false;
    state.cardStartedAt = Date.now();

    // Delete the last review from the database
    const [lastReview] = await db.select().from(srsReviews)
      .where(and(eq(srsReviews.cardId, lastRating.cardId), eq(srsReviews.learnerId, learnerId)))
      .orderBy(sql`reviewed_at DESC`)
      .limit(1);

    if (lastReview) {
      // Revert the card to its previous state
      await db.update(srsCards).set({
        state: lastReview.stateBefore,
        reps: sql`reps - 1`,
        lapses: lastRating.rating === "again" ? sql`lapses - 1` : srsCards.lapses,
        updatedAt: new Date(),
      }).where(eq(srsCards.id, lastRating.cardId));

      await db.delete(srsReviews).where(eq(srsReviews.id, lastReview.id));
    }

    return true;
  },

  // ─── Internal ───

  async _buildActiveSession(sessionId: string): Promise<ActiveSession> {
    const state = sessions.get(sessionId)!;
    const remaining = state.cardQueue.length - state.currentIndex;
    const reviewed = state.ratings.length;

    const counts = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const r of state.ratings) counts[r.rating]++;

    let currentCard: ReviewCard | null = null;
    if (state.currentIndex < state.cardQueue.length) {
      const cardId = state.cardQueue[state.currentIndex]!;
      currentCard = await this._loadCard(cardId, state.flipped);
    }

    return {
      deckId: state.deckId,
      deckTitle: state.deckTitle,
      remaining,
      reviewed,
      currentCard,
      startedAt: state.startedAt,
      elapsedSeconds: Math.round((Date.now() - state.startedAt.getTime()) / 1000),
      ratingCounts: counts,
    };
  },

  async _loadCard(cardId: string, showBack: boolean): Promise<ReviewCard> {
    const [card] = await db.select().from(srsCards).where(eq(srsCards.id, cardId)).limit(1);
    if (!card) throw new Error("Card not found");

    const schedule: CardSchedule = {
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

    const retrievability = SRSAlgorithm.retrievability(schedule);

    // Generate rating previews (what each button would do)
    let ratingPreview: ReviewCard["ratingPreview"] = null;
    if (showBack) {
      const previews: Record<Rating, { interval: string; state: string }> = {} as never;
      for (const rating of ["again", "hard", "good", "easy"] as Rating[]) {
        const result = SRSAlgorithm.schedule(schedule, rating);
        previews[rating] = {
          interval: this._formatInterval(result.scheduledDays),
          state: result.state,
        };
      }
      ratingPreview = previews;
    }

    return {
      cardId: card.id,
      type: card.type,
      front: card.front as Record<string, unknown>,
      back: showBack ? (card.back as Record<string, unknown>) : null,
      state: card.state,
      reps: card.reps,
      lapses: card.lapses,
      retrievability: Math.round(retrievability * 1000) / 1000,
      ratingPreview,
    };
  },

  _formatInterval(days: number): string {
    if (days < 1) return "<1d";
    if (days === 1) return "1d";
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${Math.round(days / 365 * 10) / 10}y`;
  },
};
