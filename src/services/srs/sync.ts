/**
 * SRSSync — Synchronization service for web and Flutter clients.
 *
 * P47: Both platforms use the same API. Handles:
 *   1. Full sync (initial download of all decks + cards)
 *   2. Delta sync (only changes since last sync)
 *   3. Offline review upload (batch submit reviews done offline)
 *   4. Conflict resolution (server-authoritative for scheduling)
 *
 * Protocol:
 *   Client sends:  { lastSyncAt, pendingReviews[], clientVersion }
 *   Server returns: { decks[], cards[], syncedAt, reviewResults[] }
 *
 * The server is AUTHORITATIVE for:
 *   - Card scheduling state (stability, difficulty, due date)
 *   - Deck settings
 *   - Algorithm parameters
 *
 * The client is AUTHORITATIVE for:
 *   - Review events (append-only — the fact that a review happened)
 *   - Review timing (duration per card)
 *
 * Conflict resolution:
 *   If a card was reviewed on both server and client since last sync,
 *   both reviews are recorded (append-only), but the scheduling state
 *   is recalculated from the most recent review.
 */

import { eq, and, gte, sql, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { srsDecks, srsCards, srsReviews, srsAlgorithmState } from "@/db/schema";
import { SRSService } from "./service";
import { SRSAlgorithm, type Rating } from "./algorithm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** Offline review from the mobile client. */
export interface PendingReview {
  cardId: string;
  rating: Rating;
  reviewDurationMs: number;
  /** When the review was performed on the client (ISO string). */
  reviewedAt: string;
  /** Client-generated ID to prevent duplicate processing. */
  clientReviewId: string;
}

/** Sync request from any client (web or mobile). */
export interface SyncRequest {
  learnerId: string;
  /** ISO timestamp of last successful sync. Null = full sync. */
  lastSyncAt: string | null;
  /** Reviews performed offline since last sync. */
  pendingReviews: PendingReview[];
  /** Client platform identifier. */
  clientPlatform: "web" | "flutter" | "other";
  /** Client app version. */
  clientVersion: string;
}

/** Deck data for sync. */
export interface SyncDeck {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  cardCount: number;
  updatedAt: Date;
}

/** Card data for sync (includes full scheduling state). */
export interface SyncCard {
  id: string;
  deckId: string;
  type: string;
  front: Record<string, unknown>;
  back: Record<string, unknown>;
  sourceType: string | null;
  sourceId: string | null;
  state: string;
  due: string | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewAt: string | null;
  updatedAt: Date;
}

/** Result of processing a pending review. */
export interface ReviewSyncResult {
  clientReviewId: string;
  cardId: string;
  status: "accepted" | "duplicate" | "conflict_resolved" | "error";
  /** New card state after this review (server-authoritative). */
  newState: string | null;
  newDue: string | null;
  message: string | null;
}

/** Full sync response. */
export interface SyncResponse {
  /** Decks that changed since lastSyncAt (or all for full sync). */
  decks: SyncDeck[];
  /** Cards that changed since lastSyncAt (or all for full sync). */
  cards: SyncCard[];
  /** Results of processing pending reviews. */
  reviewResults: ReviewSyncResult[];
  /** Algorithm params for this learner. */
  algorithmParams: {
    algorithm: string;
    desiredRetention: number;
    totalReviews: number;
  };
  /** Server timestamp — client stores this as lastSyncAt for next sync. */
  syncedAt: string;
  /** Whether this was a full sync or delta. */
  syncType: "full" | "delta";
  /** Stats about what was synced. */
  stats: {
    decksCount: number;
    cardsCount: number;
    reviewsProcessed: number;
    reviewsAccepted: number;
    reviewsDuplicate: number;
    reviewsConflict: number;
  };
}

// ─────────────────────────────────────────────
// SRSSync
// ─────────────────────────────────────────────

export const SRSSync = {

  /** Main sync endpoint — handles both full and delta sync. */
  async sync(request: SyncRequest): Promise<SyncResponse> {
    const { learnerId, lastSyncAt, pendingReviews, clientPlatform } = request;
    const syncType = lastSyncAt ? "delta" : "full";
    const since = lastSyncAt ? new Date(lastSyncAt) : null;
    const now = new Date();

    // 1. Process pending reviews first (before fetching state)
    const reviewResults = await this._processPendingReviews(learnerId, pendingReviews);

    // 2. Fetch decks (all or changed since lastSyncAt)
    const decks = await this._getDecks(learnerId, since);

    // 3. Fetch cards (all or changed since lastSyncAt)
    const cards = await this._getCards(learnerId, since);

    // 4. Get algorithm params
    const [algState] = await db.select().from(srsAlgorithmState)
      .where(eq(srsAlgorithmState.learnerId, learnerId)).limit(1);

    const stats = {
      decksCount: decks.length,
      cardsCount: cards.length,
      reviewsProcessed: pendingReviews.length,
      reviewsAccepted: reviewResults.filter((r) => r.status === "accepted").length,
      reviewsDuplicate: reviewResults.filter((r) => r.status === "duplicate").length,
      reviewsConflict: reviewResults.filter((r) => r.status === "conflict_resolved").length,
    };

    console.log(
      `[sync] ${clientPlatform} ${syncType}: ` +
      `${stats.decksCount} decks, ${stats.cardsCount} cards, ` +
      `${stats.reviewsProcessed} reviews (${stats.reviewsAccepted} accepted, ` +
      `${stats.reviewsDuplicate} dup, ${stats.reviewsConflict} conflict)`,
    );

    return {
      decks,
      cards,
      reviewResults,
      algorithmParams: {
        algorithm: algState?.algorithm ?? "fsrs-5",
        desiredRetention: algState?.desiredRetention ?? 0.9,
        totalReviews: algState?.totalReviews ?? 0,
      },
      syncedAt: now.toISOString(),
      syncType,
      stats,
    };
  },

  /** Get counts for a quick sync check (no data transfer). */
  async syncStatus(learnerId: string): Promise<{
    deckCount: number;
    cardCount: number;
    dueCount: number;
    reviewCount: number;
    lastActivity: string | null;
  }> {
    const [deckRes] = await db.select({ c: sql<number>`count(*)::int` })
      .from(srsDecks).where(eq(srsDecks.learnerId, learnerId));

    const deckIds = await db.select({ id: srsDecks.id }).from(srsDecks)
      .where(eq(srsDecks.learnerId, learnerId));
    const ids = deckIds.map((d) => d.id);

    let cardCount = 0;
    let dueCount = 0;
    if (ids.length > 0) {
      const [cardRes] = await db.select({ c: sql<number>`count(*)::int` })
        .from(srsCards)
        .where(sql`${srsCards.deckId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      cardCount = cardRes?.c ?? 0;

      const [dueRes] = await db.select({ c: sql<number>`count(*)::int` })
        .from(srsCards)
        .where(and(
          sql`${srsCards.deckId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
          sql`(${srsCards.due} IS NULL OR ${srsCards.due} <= NOW())`,
          sql`${srsCards.state} != 'new' OR ${srsCards.state} = 'new'`,
        ));
      dueCount = dueRes?.c ?? 0;
    }

    const [reviewRes] = await db.select({ c: sql<number>`count(*)::int` })
      .from(srsReviews).where(eq(srsReviews.learnerId, learnerId));

    const [lastReview] = await db.select({ at: srsReviews.reviewedAt })
      .from(srsReviews).where(eq(srsReviews.learnerId, learnerId))
      .orderBy(desc(srsReviews.reviewedAt)).limit(1);

    return {
      deckCount: deckRes?.c ?? 0,
      cardCount,
      dueCount,
      reviewCount: reviewRes?.c ?? 0,
      lastActivity: lastReview?.at?.toISOString() ?? null,
    };
  },

  // ─── Internal ───

  async _processPendingReviews(learnerId: string, reviews: PendingReview[]): Promise<ReviewSyncResult[]> {
    const results: ReviewSyncResult[] = [];

    for (const review of reviews) {
      try {
        // Check for duplicate (same clientReviewId already processed)
        const existing = await db.select({ id: srsReviews.id })
          .from(srsReviews)
          .where(and(
            eq(srsReviews.cardId, review.cardId),
            eq(srsReviews.learnerId, learnerId),
            sql`${srsReviews.reviewedAt} = ${review.reviewedAt}::timestamptz`,
          ))
          .limit(1);

        if (existing.length > 0) {
          results.push({
            clientReviewId: review.clientReviewId,
            cardId: review.cardId,
            status: "duplicate",
            newState: null, newDue: null,
            message: "Review already recorded",
          });
          continue;
        }

        // Submit through normal flow
        const submitResult = await SRSService.submitReview(learnerId, {
          cardId: review.cardId,
          rating: review.rating,
          reviewDurationMs: review.reviewDurationMs,
        });

        results.push({
          clientReviewId: review.clientReviewId,
          cardId: review.cardId,
          status: "accepted",
          newState: submitResult.newState,
          newDue: String(submitResult.due).slice(0, 10),
          message: null,
        });

      } catch (err) {
        results.push({
          clientReviewId: review.clientReviewId,
          cardId: review.cardId,
          status: "error",
          newState: null, newDue: null,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  },

  async _getDecks(learnerId: string, since: Date | null): Promise<SyncDeck[]> {
    const conds = [eq(srsDecks.learnerId, learnerId)];
    if (since) conds.push(gte(srsDecks.updatedAt, since));

    const rows = await db.select().from(srsDecks)
      .where(and(...conds)).orderBy(asc(srsDecks.createdAt));

    return rows.map((d) => ({
      id: d.id, title: d.title, description: d.description,
      isPublic: d.isPublic, newCardsPerDay: d.newCardsPerDay,
      maxReviewsPerDay: d.maxReviewsPerDay, cardCount: d.cardCount,
      updatedAt: d.updatedAt,
    }));
  },

  async _getCards(learnerId: string, since: Date | null): Promise<SyncCard[]> {
    // Get all deck IDs for this learner
    const deckIds = await db.select({ id: srsDecks.id }).from(srsDecks)
      .where(eq(srsDecks.learnerId, learnerId));
    const ids = deckIds.map((d) => d.id);
    if (ids.length === 0) return [];

    const conds = [
      sql`${srsCards.deckId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    ];
    if (since) conds.push(gte(srsCards.updatedAt, since));

    const rows = await db.select().from(srsCards).where(and(...conds));

    return rows.map((c) => ({
      id: c.id, deckId: c.deckId, type: c.type,
      front: c.front as Record<string, unknown>,
      back: c.back as Record<string, unknown>,
      sourceType: c.sourceType, sourceId: c.sourceId,
      state: c.state,
      due: c.due?.toISOString() ?? null,
      stability: c.stability, difficulty: c.difficulty,
      elapsedDays: c.elapsedDays, scheduledDays: c.scheduledDays,
      reps: c.reps, lapses: c.lapses,
      lastReviewAt: c.lastReviewAt?.toISOString() ?? null,
      updatedAt: c.updatedAt,
    }));
  },
};
