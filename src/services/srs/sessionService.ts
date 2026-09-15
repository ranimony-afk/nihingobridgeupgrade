import { db } from "@/db";
import {
  srsReviewSessions as sessionsTable,
  srsReviews as reviewsTable,
  srsCards as cardsTable,
  srsDecks as decksTable,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  SessionAnswerResult,
  SessionCard,
  SessionPlanConfig,
  SessionProgress,
  SessionQueueEntry,
  SessionQueueOrder,
  SessionStateResponse,
  SessionStatus,
  SessionSummary,
  SessionUndoResult,
  SrsReviewSession,
  SrsCard,
  SrsCardState,
  SrsPhase,
  SrsRating,
  SRS_RATINGS,
  SchedulerParams,
} from "@/types/srs";
import { SrsService } from "./srsService";
import { getScheduler, resolveParams } from "./scheduler";
import { describeInterval } from "./strategies/shared";
import { DailyQueueService, resolveDayWindow } from "./dailyQueueService";
import { PersonalizationService } from "./personalizationService";
import { XpService } from "@/services/gamification/xpService";

type SessionRow = typeof sessionsTable.$inferSelect;
type CardRow = typeof cardsTable.$inferSelect;
type ReviewRow = typeof reviewsTable.$inferSelect;

export const DEFAULT_SESSION_CONFIG = {
  newLimit: 10,
  reviewLimit: 30,
  maxCards: 40,
  order: "due" as SessionQueueOrder,
  dailyNewBudget: 20,
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export class SessionService {
  /* ============================================================
   * DAILY BUDGET — how many NEW cards were already introduced today.
   * Derived from reviews where the card was still new (repetitions = 0),
   * so the metric can never drift from the review log.
   * ============================================================ */
  static async getDailyNewUsed(userId: string): Promise<number> {
    const [row] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.userId, userId),
          sql`${reviewsTable.stateBefore} ->> 'repetitions' = '0'`,
          sql`${reviewsTable.reviewedAt} >= ${startOfToday().toISOString()}`
        )
      );
    return row?.count ?? 0;
  }

  /* ============================================================
   * PLANNER — builds the queue and persists the session.
   * ============================================================ */
  static async planSession(input: {
    userId?: string;
    deckId?: string | null;
    newLimit?: number;
    reviewLimit?: number;
    maxCards?: number;
    order?: SessionQueueOrder;
    dailyNewBudget?: number;
    /**
     * 'now' (default) pulls only cards already due this instant.
     * 'day' pulls everything due within the learner's current study day,
     * so a session launched from the daily queue matches the daily count.
     */
    dueHorizon?: "now" | "day";
  }): Promise<{ session: SrsReviewSession; skipped: string }> {
    await SrsService.ensureSeeded();

    const userId = input.userId || "anonymous-user";
    const deckId = input.deckId || null;

    /* ---- Learner day settings govern the optional day horizon ---- */
    const settings = await DailyQueueService.getSettings(userId);

    /* ---- Resolve the deck scope ---- */
    const deckRows = await db.select().from(decksTable).where(eq(decksTable.ownerId, userId));
    const scopedDecks = deckRows.filter((d) => !d.isArchived && (!deckId || d.id === deckId));

    if (scopedDecks.length === 0) {
      throw new Error("No decks available for this scope");
    }
    const scopedDeckIds = scopedDecks.map((d) => d.id);
    const deckName =
      deckId ? scopedDecks.find((d) => d.id === deckId)?.name ?? "Deck" : "All decks";
    const schedulerKeys = Array.from(new Set(scopedDecks.map((d) => d.schedulerKey)));

    /* ---- Fetch due candidates within the requested horizon ---- */
    const horizonEnd =
      input.dueHorizon === "day"
        ? new Date(
            resolveDayWindow(new Date(), settings.timezone, settings.dayCutoffHour).end
          )
        : new Date();

    const candidateRows = await db
      .select()
      .from(cardsTable)
      .where(
        and(
          inArray(cardsTable.deckId, scopedDeckIds),
          eq(cardsTable.isSuspended, false),
          lte(cardsTable.dueAt, horizonEnd)
        )
      );

    const newPool = candidateRows.filter((c) => c.totalReviews === 0);
    const reviewPool = candidateRows.filter((c) => c.totalReviews > 0);

    /* ---- Apply daily new-card budget ---- */
    const dailyNewBudget = clampInt(input.dailyNewBudget, 0, 500, DEFAULT_SESSION_CONFIG.dailyNewBudget);
    const dailyNewUsed = await this.getDailyNewUsed(userId);
    const newRemainingBudget = Math.max(0, dailyNewBudget - dailyNewUsed);

    const requestedNew = clampInt(input.newLimit, 0, 200, DEFAULT_SESSION_CONFIG.newLimit);
    const effectiveNew = Math.min(requestedNew, newRemainingBudget, newPool.length);

    const requestedReview = clampInt(input.reviewLimit, 0, 500, DEFAULT_SESSION_CONFIG.reviewLimit);
    const effectiveReview = Math.min(requestedReview, reviewPool.length);

    /* ---- Order each pool ---- */
    const order: SessionQueueOrder = input.order ?? DEFAULT_SESSION_CONFIG.order;
    const sortedNew = await this.orderCards(newPool, order, userId);
    const sortedReview = await this.orderCards(reviewPool, order, userId);

    /* ---- Interleave new cards proportionally through the reviews ---- */
    const newSlice = sortedNew.slice(0, effectiveNew);
    const reviewSlice = sortedReview.slice(0, effectiveReview);

    /* Attach the personalization rationale so the UI can explain ordering. */
    let reasonMap: Map<string, { reason: string; score: number }> | null = null;
    if (order === "personalized") {
      const ranked = await PersonalizationService.orderPersonalized(
        [...newSlice, ...reviewSlice].map((c) => c.id),
        await PersonalizationService.getPrefs(userId)
      );
      reasonMap = new Map(ranked.map((r) => [r.cardId, { reason: r.reason, score: r.score }]));
    }

    const toEntry = (c: CardRow, kind: "new" | "review"): SessionQueueEntry => {
      const meta = reasonMap?.get(c.id);
      return {
        cardId: c.id,
        kind,
        ...(meta ? { priorityReason: meta.reason, priorityScore: meta.score } : {}),
      };
    };

    let entries: SessionQueueEntry[];
    if (order === "new-first") {
      entries = [
        ...newSlice.map((c) => toEntry(c, "new")),
        ...reviewSlice.map((c) => toEntry(c, "review")),
      ];
    } else {
      entries = this.interleave(
        newSlice.map((c) => toEntry(c, "new")),
        reviewSlice.map((c) => toEntry(c, "review"))
      );
    }

    /* ---- Hard cap ---- */
    const maxCards = clampInt(input.maxCards, 1, 500, DEFAULT_SESSION_CONFIG.maxCards);
    entries = entries.slice(0, maxCards);

    const config: SessionPlanConfig = {
      newLimit: effectiveNew,
      reviewLimit: effectiveReview,
      maxCards,
      order,
      dailyNewBudget,
      dailyNewUsedAtPlan: dailyNewUsed,
      deckName,
      schedulerKeys,
    };

    const sessionId = `rsess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.insert(sessionsTable).values({
      id: sessionId,
      userId,
      deckId,
      status: "active",
      config,
      queue: entries,
    });

    const session = await this.getSession(sessionId);
    if (!session) throw new Error("Failed to create session");

    let skipped = "";
    if (requestedNew > effectiveNew) {
      skipped =
        newRemainingBudget === 0
          ? `Daily new-card budget of ${dailyNewBudget} already used — session contains reviews only.`
          : `Only ${effectiveNew} new card(s) available (requested ${requestedNew}).`;
    }

    return { session, skipped };
  }

  /** Interleave new cards evenly among reviews so new material is spaced out. */
  private static interleave(
    newEntries: SessionQueueEntry[],
    reviewEntries: SessionQueueEntry[]
  ): SessionQueueEntry[] {
    if (newEntries.length === 0) return reviewEntries;
    if (reviewEntries.length === 0) return newEntries;

    const out: SessionQueueEntry[] = [];
    const gap = Math.max(1, Math.floor(reviewEntries.length / Math.max(1, newEntries.length)));
    let nIdx = 0;
    let rIdx = 0;

    while (rIdx < reviewEntries.length || nIdx < newEntries.length) {
      for (let i = 0; i < gap && rIdx < reviewEntries.length; i += 1) {
        out.push(reviewEntries[rIdx]);
        rIdx += 1;
      }
      if (nIdx < newEntries.length) {
        out.push(newEntries[nIdx]);
        nIdx += 1;
      }
      // Safety: if the loop cannot progress, break to avoid a spin.
      if (gap < 1 && rIdx >= reviewEntries.length && nIdx >= newEntries.length) break;
    }

    return out;
  }

  private static async orderCards(
    rows: CardRow[],
    order: SessionQueueOrder,
    userId: string
  ): Promise<CardRow[]> {
    const copy = [...rows];

    switch (order) {
      case "random":
        return copy.sort(() => Math.random() - 0.5);

      case "descending":
        return copy.sort((a, b) => b.intervalDays - a.intervalDays);

      case "new-first":
        return copy.sort((a, b) => a.totalReviews - b.totalReviews);

      /* Prompt 11.5 — weakness-weighted ordering. Selection only: this never
       * mutates dueAt, which remains owned by the registered scheduler. */
      case "personalized": {
        const prefs = await PersonalizationService.getPrefs(userId);
        const ranked = await PersonalizationService.orderPersonalized(
          copy.map((c) => c.id),
          prefs
        );
        const rank = new Map(ranked.map((r, i) => [r.cardId, i]));
        return copy.sort(
          (a, b) => (rank.get(a.id) ?? copy.length) - (rank.get(b.id) ?? copy.length)
        );
      }

      case "due":
      default:
        // Tie-break on id: many cards legitimately share an identical dueAt
        // (e.g. a bulk import), and an unstable sort would make which card the
        // planner serves non-deterministic between calls.
        return copy.sort((a, b) => {
          const delta = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
          return delta !== 0 ? delta : a.id.localeCompare(b.id);
        });
    }
  }

  /* ============================================================
   * SESSION READ MODEL
   * ============================================================ */
  static async getSessionRow(sessionId: string): Promise<SessionRow | null> {
    const [row] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .limit(1);
    return row ?? null;
  }

  /** All reviews belonging to this session, oldest first. */
  static async getSessionReviews(sessionId: string): Promise<ReviewRow[]> {
    return db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.sessionId, sessionId))
      .orderBy(asc(reviewsTable.reviewedAt));
  }

  static buildProgress(
    reviews: ReviewRow[],
    queueSize: number,
    startedAt: Date,
    finishedAt?: Date | null
  ): SessionProgress {
    const byRating: Record<SrsRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    let correct = 0;
    let totalMs = 0;
    let newIntroduced = 0;

    for (const r of reviews) {
      if (SRS_RATINGS.includes(r.rating as SrsRating)) {
        byRating[r.rating as SrsRating] += 1;
      }
      if (r.wasCorrect) correct += 1;
      totalMs += r.timeSpentMs || 0;

      const before = r.stateBefore as Partial<SrsCardState> | null;
      if (before && Number(before.repetitions ?? 0) === 0) newIntroduced += 1;
    }

    const answered = reviews.length;
    const endMs = finishedAt
      ? new Date(finishedAt).getTime()
      : reviews.length > 0
      ? new Date(reviews[reviews.length - 1].reviewedAt).getTime()
      : startedAt.getTime();

    return {
      total: queueSize,
      answered,
      remaining: Math.max(0, queueSize - answered),
      cursor: answered,
      correct,
      accuracy: answered > 0 ? Math.round((correct / answered) * 1000) / 10 : 0,
      totalMs,
      byRating,
      newIntroduced,
      reviewsDone: answered - newIntroduced,
      elapsedSeconds: Math.max(0, Math.round((endMs - startedAt.getTime()) / 1000)),
    };
  }

  static async getSession(sessionId: string): Promise<SrsReviewSession | null> {
    const row = await this.getSessionRow(sessionId);
    if (!row) return null;

    const reviews = await this.getSessionReviews(sessionId);
    const config = row.config as unknown as SessionPlanConfig;

    return {
      id: row.id,
      userId: row.userId,
      deckId: row.deckId,
      status: row.status as SessionStatus,
      config,
      queueSize: (row.queue as SessionQueueEntry[]).length,
      startedAt: row.startedAt,
      lastActivityAt: row.lastActivityAt,
      completedAt: row.completedAt,
      cancelledReason: row.cancelledReason,
      progress: this.buildProgress(reviews, (row.queue as SessionQueueEntry[]).length, row.startedAt, row.completedAt),
    };
  }

  /* ============================================================
   * CARD HYDRATION + RATING PREVIEWS
   * ============================================================ */
  private static async hydrateCards(cardIds: string[]): Promise<Map<string, SrsCard>> {
    if (cardIds.length === 0) return new Map();

    const rows = await db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds));
    const deckRows = await db.select().from(decksTable);
    const deckMap = new Map(deckRows.map((d) => [d.id, d]));

    // Reuse SrsService mapping by delegating through a tiny local mapper to
    // avoid a circular import while keeping the shape identical.
    const out = new Map<string, SrsCard>();
    for (const row of rows) {
      const deck = deckMap.get(row.deckId);
      out.set(row.id, {
        id: row.id,
        deckId: row.deckId,
        userId: row.userId,
        cardType: row.cardType,
        front: row.front,
        back: row.back,
        reading: row.reading,
        meaning: row.meaning,
        hint: row.hint,
        sourceType: row.sourceType,
        sourceRef: row.sourceRef,
        sourceQuestionId: row.sourceQuestionId,
        state: {
          repetitions: row.repetitions,
          easeFactor: row.easeFactor,
          intervalDays: row.intervalDays,
          lapses: row.lapses,
          box: row.box,
          stabilityDays: row.stabilityDays,
          difficulty: row.difficulty,
          stepIndex: row.stepIndex,
          isLearning: row.isLearning,
          phase: (row.phase as SrsPhase) || "learning",
          lastReviewedAt: row.lastReviewedAt,
          dueAt: row.dueAt,
          totalReviews: row.totalReviews,
          correctReviews: row.correctReviews,
        },
        schedulerKey: row.schedulerKey as SrsCard["schedulerKey"],
        isSuspended: row.isSuspended,
        createdAt: row.createdAt,
        deckName: deck?.name,
        jlptLevel: deck?.jlptLevel,
      });
    }
    return out;
  }

  /** Compute what each rating would do to this card right now (no persistence). */
  private static buildRatingPreviews(card: SrsCard): SessionCard["ratingPreviews"] {
    const scheduler = getScheduler(card.schedulerKey);
    const deckParams = (card as unknown as { deckParams?: SchedulerParams }).deckParams ?? null;
    const params = resolveParams(scheduler, deckParams);

    return SRS_RATINGS.map((rating) => {
      const outcome = scheduler.review({
        state: card.state,
        rating,
        now: new Date(),
        params,
        historyCount: card.state.totalReviews,
      });
      return {
        rating,
        intervalDays: outcome.intervalDays,
        intervalLabel: describeInterval(outcome.intervalDays),
        phase: outcome.phase,
      };
    });
  }

  private static async buildSessionCard(
    cardId: string,
    kind: "new" | "review"
  ): Promise<SessionCard | null> {
    const cards = await this.hydrateCards([cardId]);
    const card = cards.get(cardId);
    if (!card) return null;
    return { card, kind, ratingPreviews: this.buildRatingPreviews(card) };
  }

  /* ============================================================
   * STATE — current card + progress + recent answers
   * ============================================================ */
  static async getSessionState(sessionId: string): Promise<SessionStateResponse | null> {
    const row = await this.getSessionRow(sessionId);
    if (!row) return null;

    const queue = row.queue as SessionQueueEntry[];
    const reviews = await this.getSessionReviews(sessionId);
    const progress = this.buildProgress(reviews, queue.length, row.startedAt, row.completedAt);

    const isActive = row.status === "active";
    const nextEntry = isActive ? queue[progress.cursor] : undefined;

    const currentCard = nextEntry ? await this.buildSessionCard(nextEntry.cardId, nextEntry.kind) : null;

    // Hydrate the last few answered cards for the in-session feedback strip.
    const recentSlice = reviews.slice(-5).reverse();
    const recentCards = await this.hydrateCards(recentSlice.map((r) => r.cardId));

    return {
      session: {
        id: row.id,
        userId: row.userId,
        deckId: row.deckId,
        status: row.status as SessionStatus,
        config: row.config as unknown as SessionPlanConfig,
        queueSize: queue.length,
        startedAt: row.startedAt,
        lastActivityAt: row.lastActivityAt,
        completedAt: row.completedAt,
        cancelledReason: row.cancelledReason,
        progress,
      },
      currentCard,
      recentAnswers: recentSlice.map((r) => {
        const c = recentCards.get(r.cardId);
        return {
          reviewId: r.id,
          cardId: r.cardId,
          front: c?.front ?? "(deleted)",
          rating: r.rating as SrsRating,
          intervalDays: r.intervalDays,
          intervalLabel: describeInterval(r.intervalDays),
          schedulerKey: r.schedulerKey,
          schedulerVersion: r.schedulerVersion,
          explanation: r.explanation,
          timeSpentMs: r.timeSpentMs,
        };
      }),
    };
  }

  /* ============================================================
   * ANSWER
   * ============================================================ */
  static async answer(input: {
    sessionId: string;
    cardId: string;
    rating: SrsRating;
    timeSpentMs?: number;
  }): Promise<SessionAnswerResult | null> {
    const row = await this.getSessionRow(input.sessionId);
    if (!row) return null;
    if (row.status !== "active") {
      throw new Error(`Session is ${row.status}; answers are no longer accepted`);
    }

    const queue = row.queue as SessionQueueEntry[];
    const reviews = await this.getSessionReviews(input.sessionId);
    const cursor = reviews.length;

    const expected = queue[cursor];
    if (!expected) throw new Error("Session queue is already exhausted");
    if (expected.cardId !== input.cardId) {
      throw new Error(`Out-of-order answer: expected ${expected.cardId}, received ${input.cardId}`);
    }

    /* Delegate the actual scheduling to the algorithm registry. */
    const graded = await SrsService.gradeCard({
      cardId: input.cardId,
      rating: input.rating,
      timeSpentMs: input.timeSpentMs,
      userId: row.userId,
      sessionId: input.sessionId,
    });

    if (!graded) throw new Error("Card could not be graded");

    await db
      .update(sessionsTable)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessionsTable.id, input.sessionId));

    /* Auto-complete when the queue is drained. */
    const isComplete = cursor + 1 >= queue.length;
    if (isComplete) {
      await db
        .update(sessionsTable)
        .set({ status: "completed", completedAt: new Date(), lastActivityAt: new Date() })
        .where(eq(sessionsTable.id, input.sessionId));
    }

    const freshRow = await this.getSessionRow(input.sessionId);
    const freshReviews = await this.getSessionReviews(input.sessionId);
    const freshQueue = (freshRow?.queue as SessionQueueEntry[]) ?? queue;
    const progress = this.buildProgress(
      freshReviews,
      freshQueue.length,
      freshRow!.startedAt,
      freshRow!.completedAt
    );

    /* ---- Phase 12.1: session completion bonus (idempotent per session) ---- */
    if (isComplete) {
      await XpService.awardSafe({
        payload: {
          eventType: "review.session_completed",
          userId: row.userId,
          sourceType: "srs_session",
          sourceId: input.sessionId,
          cardsAnswered: progress.answered,
          accuracy: progress.accuracy,
          durationSeconds: progress.elapsedSeconds,
        },
        dedupeKey: `session:${input.sessionId}`,
      });
    }

    const nextEntry = isComplete ? undefined : freshQueue[cursor + 1];
    const nextCard = nextEntry ? await this.buildSessionCard(nextEntry.cardId, nextEntry.kind) : null;

    const hydrated = await this.hydrateCards([input.cardId]);

    return {
      reviewId: graded.reviewId,
      cardId: input.cardId,
      front: hydrated.get(input.cardId)?.front ?? "",
      rating: input.rating,
      intervalDays: graded.intervalDays,
      intervalLabel: describeInterval(graded.intervalDays),
      dueAt: graded.dueAt,
      schedulerKey: graded.schedulerKey,
      schedulerVersion: graded.schedulerVersion,
      paramsApplied: graded.paramsApplied,
      explanation: graded.explanation,
      phase: graded.phase,
      progress,
      nextCard,
      sessionComplete: isComplete,
    };
  }

  /* ============================================================
   * UNDO — restores the card from the review's state_before snapshot.
   * ============================================================ */
  static async undo(input: { sessionId: string }): Promise<SessionUndoResult | null> {
    const row = await this.getSessionRow(input.sessionId);
    if (!row) return null;

    const reviews = await this.getSessionReviews(input.sessionId);
    const last = reviews[reviews.length - 1];

    if (!last) {
      const progress = this.buildProgress(reviews, (row.queue as SessionQueueEntry[]).length, row.startedAt, row.completedAt);
      return { undone: null, restoredState: null, progress, currentCard: null };
    }

    const stateBefore = last.stateBefore as unknown as SrsCardState;

    /* Restore the exact pre-review state. */
    await db
      .update(cardsTable)
      .set({
        repetitions: stateBefore.repetitions,
        easeFactor: stateBefore.easeFactor,
        intervalDays: stateBefore.intervalDays,
        lapses: stateBefore.lapses,
        box: stateBefore.box,
        stabilityDays: stateBefore.stabilityDays,
        difficulty: stateBefore.difficulty,
        stepIndex: stateBefore.stepIndex,
        isLearning: stateBefore.isLearning,
        phase: stateBefore.phase,
        dueAt: new Date(stateBefore.dueAt),
        lastReviewedAt: stateBefore.lastReviewedAt ? new Date(stateBefore.lastReviewedAt) : null,
        totalReviews: Math.max(0, stateBefore.totalReviews),
        correctReviews: Math.max(0, stateBefore.correctReviews),
        updatedAt: new Date(),
      })
      .where(eq(cardsTable.id, last.cardId));

    /* Phase 12.1: revoke the XP this review earned before deleting it, so the
     * ledger stays consistent and undo cannot be used to farm XP. */
    await XpService.revokeByDedupeKey(`review:${last.id}`, "review-undone");

    /* Remove the review so cursor + counts revert automatically. */
    await db.delete(reviewsTable).where(eq(reviewsTable.id, last.id));

    /* Re-open a completed session if we undid its final answer. */
    if (row.status === "completed") {
      await db
        .update(sessionsTable)
        .set({ status: "active", completedAt: null, lastActivityAt: new Date() })
        .where(eq(sessionsTable.id, input.sessionId));
      await this.getSessionRow(input.sessionId);
    }

    const freshRow = await this.getSessionRow(input.sessionId);
    const freshReviews = await this.getSessionReviews(input.sessionId);
    const freshQueue = (freshRow?.queue as SessionQueueEntry[]) ?? [];
    const progress = this.buildProgress(
      freshReviews,
      freshQueue.length,
      freshRow!.startedAt,
      freshRow!.completedAt
    );

    const entry = freshQueue[progress.cursor];
    const currentCard = entry ? await this.buildSessionCard(entry.cardId, entry.kind) : null;

    const undoneCards = await this.hydrateCards([last.cardId]);

    return {
      undone: {
        reviewId: last.id,
        cardId: last.cardId,
        front: undoneCards.get(last.cardId)?.front ?? "(deleted)",
        rating: last.rating as SrsRating,
      },
      restoredState: stateBefore,
      progress,
      currentCard,
    };
  }

  /* ============================================================
   * LIFECYCLE
   * ============================================================ */
  static async completeSession(sessionId: string): Promise<SrsReviewSession | null> {
    await db
      .update(sessionsTable)
      .set({ status: "completed", completedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    return this.getSession(sessionId);
  }

  static async abandonSession(sessionId: string, reason?: string): Promise<SrsReviewSession | null> {
    await db
      .update(sessionsTable)
      .set({
        status: "abandoned",
        completedAt: new Date(),
        lastActivityAt: new Date(),
        cancelledReason: reason || "user-exit",
      })
      .where(eq(sessionsTable.id, sessionId));
    return this.getSession(sessionId);
  }

  /* ============================================================
   * HISTORY
   * ============================================================ */
  static async listSessions(params: {
    userId?: string;
    limit?: number;
    status?: SessionStatus;
  }): Promise<SrsReviewSession[]> {
    await SrsService.ensureSeeded();

    const conditions = [eq(sessionsTable.userId, params.userId || "anonymous-user")];
    if (params.status) conditions.push(eq(sessionsTable.status, params.status));

    const rows = await db
      .select()
      .from(sessionsTable)
      .where(and(...conditions))
      .orderBy(desc(sessionsTable.startedAt))
      .limit(params.limit ?? 15);

    const out: SrsReviewSession[] = [];
    for (const row of rows) {
      const reviews = await this.getSessionReviews(row.id);
      out.push({
        id: row.id,
        userId: row.userId,
        deckId: row.deckId,
        status: row.status as SessionStatus,
        config: row.config as unknown as SessionPlanConfig,
        queueSize: (row.queue as SessionQueueEntry[]).length,
        startedAt: row.startedAt,
        lastActivityAt: row.lastActivityAt,
        completedAt: row.completedAt,
        cancelledReason: row.cancelledReason,
        progress: this.buildProgress(reviews, (row.queue as SessionQueueEntry[]).length, row.startedAt, row.completedAt),
      });
    }
    return out;
  }

  /** Newest still-active session, used by the dashboard "Resume" affordance. */
  static async getResumableSession(userId = "anonymous-user"): Promise<SrsReviewSession | null> {
    const [row] = await db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.status, "active")))
      .orderBy(desc(sessionsTable.startedAt))
      .limit(1);

    if (!row) return null;

    const reviews = await this.getSessionReviews(row.id);
    return {
      id: row.id,
      userId: row.userId,
      deckId: row.deckId,
      status: row.status as SessionStatus,
      config: row.config as unknown as SessionPlanConfig,
      queueSize: (row.queue as SessionQueueEntry[]).length,
      startedAt: row.startedAt,
      lastActivityAt: row.lastActivityAt,
      completedAt: row.completedAt,
      cancelledReason: row.cancelledReason,
      progress: this.buildProgress(reviews, (row.queue as SessionQueueEntry[]).length, row.startedAt, row.completedAt),
    };
  }

  /* ============================================================
   * SUMMARY — post-session report
   * ============================================================ */
  static async getSummary(sessionId: string): Promise<SessionSummary | null> {
    const row = await this.getSessionRow(sessionId);
    if (!row) return null;

    const queue = row.queue as SessionQueueEntry[];
    const reviews = await this.getSessionReviews(sessionId);
    const progress = this.buildProgress(reviews, queue.length, row.startedAt, row.completedAt);

    const cardIds = reviews.map((r) => r.cardId);
    const cards = await this.hydrateCards(cardIds);

    const durationMs =
      row.completedAt
        ? new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime()
        : progress.elapsedSeconds * 1000;

    const totalMs = Math.max(durationMs, progress.totalMs);
    const seconds = Math.round(totalMs / 1000);

    const byRating: Record<SrsRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    let correct = 0;

    const perScheduler = new Map<
      string,
      { version: string; answers: number; correct: number; intervalSum: number }
    >();

    for (const r of reviews) {
      if (SRS_RATINGS.includes(r.rating as SrsRating)) byRating[r.rating as SrsRating] += 1;
      if (r.wasCorrect) correct += 1;

      const agg = perScheduler.get(r.schedulerKey) ?? {
        version: r.schedulerVersion,
        answers: 0,
        correct: 0,
        intervalSum: 0,
      };
      agg.answers += 1;
      if (r.wasCorrect) agg.correct += 1;
      agg.intervalSum += r.intervalDays;
      perScheduler.set(r.schedulerKey, agg);
    }

    const weakest = reviews
      .filter((r) => !r.wasCorrect)
      .slice(0, 8)
      .map((r) => {
        const c = cards.get(r.cardId);
        const stateAfter = r.stateAfter as Partial<SrsCardState> | null;
        return {
          front: c?.front ?? "(deleted)",
          rating: r.rating as SrsRating,
          lapses: Number(stateAfter?.lapses ?? 0),
        };
      });

    /* 7-day forward forecast over the cards just studied. */
    const forecastStart = startOfToday();
    const forecastEnd = new Date(forecastStart.getTime() + 7 * 86_400_000);
    let nextDuePreview: Array<{ day: string; count: number }> = [];
    if (cardIds.length > 0) {
      nextDuePreview = await db
        .select({
          day: sql<string>`to_char(${cardsTable.dueAt}::date, 'Mon DD')`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(cardsTable)
        .where(and(inArray(cardsTable.id, cardIds), lte(cardsTable.dueAt, forecastEnd)))
        .groupBy(sql`to_char(${cardsTable.dueAt}::date, 'Mon DD')`, sql`${cardsTable.dueAt}::date`)
        .orderBy(sql`${cardsTable.dueAt}::date`);
    }

    return {
      session: {
        id: row.id,
        userId: row.userId,
        deckId: row.deckId,
        status: row.status as SessionStatus,
        config: row.config as unknown as SessionPlanConfig,
        queueSize: queue.length,
        startedAt: row.startedAt,
        lastActivityAt: row.lastActivityAt,
        completedAt: row.completedAt,
        cancelledReason: row.cancelledReason,
        progress,
      },
      status: row.status as SessionStatus,
      duration: {
        totalMs,
        seconds,
        cardsPerMinute: seconds > 0 ? Math.round((reviews.length / (seconds / 60)) * 10) / 10 : 0,
        avgSecondsPerCard: reviews.length > 0 ? Math.round(seconds / reviews.length) : 0,
      },
      results: {
        total: reviews.length,
        correct,
        accuracy: reviews.length > 0 ? Math.round((correct / reviews.length) * 1000) / 10 : 0,
        newIntroduced: progress.newIntroduced,
        reviewsDone: progress.reviewsDone,
        byRating,
      },
      schedulerBreakdown: Array.from(perScheduler.entries()).map(([key, agg]) => ({
        schedulerKey: key,
        schedulerVersion: agg.version,
        answers: agg.answers,
        correct: agg.correct,
        accuracy: agg.answers > 0 ? Math.round((agg.correct / agg.answers) * 1000) / 10 : 0,
        avgIntervalDays: agg.answers > 0 ? Math.round((agg.intervalSum / agg.answers) * 100) / 100 : 0,
      })),
      cardOutcomes: reviews.map((r) => {
        const c = cards.get(r.cardId);
        return {
          reviewId: r.id,
          cardId: r.cardId,
          front: c?.front ?? "(deleted)",
          back: c?.back ?? "",
          reading: c?.reading ?? null,
          deckName: c?.deckName ?? "",
          rating: r.rating as SrsRating,
          wasCorrect: r.wasCorrect,
          intervalDays: r.intervalDays,
          intervalLabel: describeInterval(r.intervalDays),
          dueAt: new Date(r.dueAt).toISOString(),
          timeSpentMs: r.timeSpentMs,
          schedulerKey: r.schedulerKey,
          explanation: r.explanation,
        };
      }),
      nextDuePreview,
      weakestCards: weakest,
    };
  }
}
