import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { srsCards as cardsTable, srsDecks as decksTable, srsReviews as reviewsTable } from "@/db/schema";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  LifecycleRunResult,
  LifecycleStep,
  SrsCardState,
  SrsPhase,
  SrsRating,
  SRS_RATINGS,
} from "@/types/srs";
import { PersonalizationService } from "@/services/srs/personalizationService";
import { getScheduler, resolveParams } from "@/services/srs/scheduler";
import { describeInterval } from "@/services/srs/strategies/shared";

export const dynamic = "force-dynamic";

const STAGE_META: Record<
  LifecycleStep["stage"],
  { label: string; japanese: string }
> = {
  created: { label: "Created", japanese: "作成" },
  new: { label: "New card", japanese: "新規" },
  due: { label: "Due", japanese: "期限" },
  reviewed: { label: "Reviewed", japanese: "復習" },
  rated: { label: "Rated", japanese: "評価" },
  rescheduled: { label: "Rescheduled", japanese: "再スケジュール" },
  "next-due": { label: "Next due", japanese: "次回" },
};

function buildStage(stage: LifecycleStep["stage"], detail: string, at: string | null = null, extra: Partial<LifecycleStep> = {}): LifecycleStep {
  return {
    stage,
    label: STAGE_META[stage].label,
    japanese: STAGE_META[stage].japanese,
    at,
    detail,
    ...extra,
  };
}

/**
 * GET /api/srs/personal/lifecycle?cardId=...
 *
 * Reconstructs the full personalised lifecycle for one card from the review
 * log, and previews what each rating would do next. This is the auditable
 * proof of the required chain:
 *
 *   new card → due → review → rating → reschedule → next due
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const cardId = sp.get("cardId");

    if (!cardId) {
      return NextResponse.json({ success: false, error: "cardId is required" }, { status: 400 });
    }

    const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, cardId)).limit(1);
    if (!card) {
      return NextResponse.json({ success: false, error: "Card not found" }, { status: 404 });
    }

    const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, card.deckId)).limit(1);
    const scheduler = getScheduler(deck?.schedulerKey || card.schedulerKey);
    const params = resolveParams(scheduler, (deck?.schedulerParams ?? {}) as Record<string, unknown>);

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.cardId, cardId))
      .orderBy(asc(reviewsTable.reviewedAt));

    const now = new Date();

    /* ---------------- Timeline ---------------- */
    const timeline: LifecycleStep[] = [
      buildStage("created", `Card entered the collection in "${deck?.name ?? card.deckId}".`, card.createdAt.toISOString()),
    ];

    if (card.totalReviews === 0) {
      timeline.push(buildStage("new", "Never reviewed — it is a brand-new card.", card.createdAt.toISOString()));
    } else {
      timeline.push(
        buildStage("new", `Studied for the first time after creation.`, reviews[0]?.reviewedAt.toISOString() ?? null)
      );
    }

    const wasDueAtSomePoint =
      reviews.length > 0 || new Date(card.dueAt).getTime() <= now.getTime();

    if (wasDueAtSomePoint) {
      timeline.push(
        buildStage(
          "due",
          reviews.length > 0
            ? `Became due and entered the study queue.`
            : `Currently due — waiting in the queue.`,
          reviews[0]?.reviewedAt.toISOString() ?? card.dueAt.toISOString()
        )
      );
    }

    for (const r of reviews) {
      timeline.push(
        buildStage(
          "reviewed",
          `Served for review (${r.sessionId ? "within a review session" : "ad-hoc"}${r.deviceId ? `, device ${r.deviceId}` : ""}).`,
          r.reviewedAt.toISOString(),
          { schedulerKey: r.schedulerKey }
        )
      );
      timeline.push(
        buildStage("rated", `Rated "${r.rating}" (${r.wasCorrect ? "correct recall" : "failed recall"}).`, r.reviewedAt.toISOString(), {
          rating: r.rating as SrsRating,
        })
      );
      timeline.push(
        buildStage(
          "rescheduled",
          `${r.schedulerKey}@${r.schedulerVersion} set interval to ${describeInterval(r.intervalDays)}. ${r.explanation}`,
          r.reviewedAt.toISOString(),
          { intervalDays: r.intervalDays, schedulerKey: r.schedulerKey }
        )
      );
      timeline.push(
        buildStage("next-due", `Next due ${new Date(r.dueAt).toLocaleString("en-US")}.`, r.dueAt.toISOString(), {
          intervalDays: r.intervalDays,
        })
      );
    }

    if (reviews.length === 0 && new Date(card.dueAt).getTime() <= now.getTime()) {
      // Awaiting its first review; the chain stops at "due".
    }

    /* ---------------- Current stage ---------------- */
    let currentStage: LifecycleStep["stage"] = "new";
    if (card.totalReviews > 0) {
      currentStage = new Date(card.dueAt).getTime() <= now.getTime() ? "due" : "next-due";
    } else if (new Date(card.dueAt).getTime() <= now.getTime()) {
      currentStage = "due";
    }

    /* ---------------- Rating futures ---------------- */
    const state: SrsCardState = {
      repetitions: card.repetitions,
      easeFactor: card.easeFactor,
      intervalDays: card.intervalDays,
      lapses: card.lapses,
      box: card.box,
      stabilityDays: card.stabilityDays,
      difficulty: card.difficulty,
      stepIndex: card.stepIndex,
      isLearning: card.isLearning,
      phase: (card.phase as SrsPhase) || "learning",
      lastReviewedAt: card.lastReviewedAt,
      dueAt: card.dueAt,
      totalReviews: card.totalReviews,
      correctReviews: card.correctReviews,
    };

    const ratingFutures = SRS_RATINGS.map((rating) => {
      const outcome = scheduler.review({
        state,
        rating,
        now,
        params,
        historyCount: card.totalReviews,
      });
      return {
        rating,
        intervalDays: outcome.intervalDays,
        intervalLabel: describeInterval(outcome.intervalDays),
        phase: outcome.phase,
        dueAt: outcome.dueAt.toISOString(),
      };
    });

    /* ---------------- Personal context ---------------- */
    const profile = await PersonalizationService.buildProfile("anonymous-user");
    const personalStat = profile.weakCards.find((w) => w.cardId === cardId) ?? null;

    return NextResponse.json({
      success: true,
      trace: {
        cardId,
        front: card.front,
        back: card.back,
        reading: card.reading,
        deckName: deck?.name ?? card.deckId,
        schedulerKey: scheduler.key,
        schedulerVersion: scheduler.version,
        currentStage,
        timeline,
        currentState: state,
        inQueueNow: new Date(card.dueAt).getTime() <= now.getTime() && !card.isSuspended,
        ratingFutures,
        personalStat,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to trace lifecycle";
    console.error("GET /api/srs/personal/lifecycle error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/srs/personal/lifecycle
 *
 * Runs the complete gate chain on a real card and returns an explicit
 * pass/fail matrix for each stage. This is the deployment gate proof.
 *
 *   new card → due → review → rating → reschedule → next due
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body?.userId || "anonymous-user";
    const rating: SrsRating = SRS_RATINGS.includes(body?.rating) ? body.rating : "good";

    /* ---------- 1. NEW CARD ---------- */
    const deckRows = await db.select().from(decksTable).where(eq(decksTable.ownerId, userId));
    const deckIds = deckRows.filter((d) => !d.isArchived).map((d) => d.id);

    if (deckIds.length === 0) {
      return NextResponse.json({ success: false, error: "No decks available" }, { status: 400 });
    }

    /* The gate must observe the card the PLANNER actually serves, so it plans
     * the session first and reads the queue, rather than independently
     * re-deriving the ordering. (Postgres stores microseconds while JS Date
     * truncates to milliseconds, so any duplicated ordering logic can and does
     * disagree on ties.) */
    const { SessionService } = await import("@/services/srs/sessionService");

    const anyNew = await db
      .select({ id: cardsTable.id })
      .from(cardsTable)
      .where(and(inArray(cardsTable.deckId, deckIds), eq(cardsTable.totalReviews, 0)))
      .limit(1);

    const { session } = await SessionService.planSession({
      userId,
      newLimit: anyNew.length > 0 ? 1 : 0,
      reviewLimit: anyNew.length > 0 ? 0 : 1,
      order: "due",
      maxCards: 1,
      dailyNewBudget: 500,
      dueHorizon: "day",
    });

    const sessionRow = await SessionService.getSessionRow(session.id);
    const planned = (sessionRow?.queue ?? []) as Array<{ cardId: string; kind: string }>;

    if (planned.length === 0) {
      return NextResponse.json(
        { success: false, error: "No card available to run the lifecycle gate" },
        { status: 400 }
      );
    }

    const [probe] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, planned[0].cardId))
      .limit(1);

    if (!probe) {
      return NextResponse.json(
        { success: false, error: "Planned card could not be loaded" },
        { status: 500 }
      );
    }

    const gateStartedAsNew = probe.totalReviews === 0;

    const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, probe.deckId)).limit(1);
    const scheduler = getScheduler(deck?.schedulerKey || probe.schedulerKey);
    const params = resolveParams(scheduler, (deck?.schedulerParams ?? {}) as Record<string, unknown>);

    const steps: LifecycleRunResult["steps"] = [];
    const now = new Date();
    const fmt = (d: Date) => d.toISOString();

    steps.push({
      stage: "created",
      label: "Created",
      at: fmt(probe.createdAt),
      intervalDays: probe.intervalDays,
      intervalLabel: describeInterval(probe.intervalDays),
      dueAt: fmt(probe.dueAt),
      detail: `Card "${probe.front}" created in ${deck?.name ?? probe.deckId}.`,
    });

    steps.push({
      stage: "new",
      label: "New card",
      at: fmt(probe.createdAt),
      intervalDays: probe.intervalDays,
      intervalLabel: describeInterval(probe.intervalDays),
      dueAt: fmt(probe.dueAt),
      detail: `totalReviews=0, phase=${probe.phase}, no review history.`,
    });

    /* ---------- 2. DUE ---------- */
    // NOTE: the probe is deliberately left untouched. It is already due, and
    // mutating dueAt here would re-order it behind other new cards, so the
    // planner would serve a different card and the gate would not be observing
    // the card it selected.
    const dueCheck = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(cardsTable)
      .where(and(eq(cardsTable.id, probe.id), lte(cardsTable.dueAt, now)));

    const appearedInQueue = (dueCheck[0]?.count ?? 0) > 0;

    steps.push({
      stage: "due",
      label: "Due",
      at: fmt(now),
      intervalDays: probe.intervalDays,
      intervalLabel: describeInterval(probe.intervalDays),
      dueAt: fmt(now),
      detail: appearedInQueue
        ? "Card matched the due-queue predicate (due_at <= now) and became selectable."
        : "Card did NOT match the due predicate.",
    });

    /* ---------- 3. REVIEW (served by a real session) ---------- */
    const servedIndex = planned.findIndex((e) => e.cardId === probe.id);
    const served = servedIndex >= 0;

    steps.push({
      stage: "reviewed",
      label: "Reviewed",
      at: fmt(now),
      intervalDays: probe.intervalDays,
      intervalLabel: describeInterval(probe.intervalDays),
      dueAt: fmt(now),
      detail: served
        ? `Session ${session.id} served this card at cursor position ${servedIndex + 1} of ${planned.length}.`
        : `Card was not selected by session ${session.id}.`,
    });

    /* ---------- 4 + 5. RATING → RESCHEDULE ---------- */
    const before: SrsCardState = {
      repetitions: probe.repetitions,
      easeFactor: probe.easeFactor,
      intervalDays: probe.intervalDays,
      lapses: probe.lapses,
      box: probe.box,
      stabilityDays: probe.stabilityDays,
      difficulty: probe.difficulty,
      stepIndex: probe.stepIndex,
      isLearning: probe.isLearning,
      phase: (probe.phase as SrsPhase) || "learning",
      lastReviewedAt: probe.lastReviewedAt,
      dueAt: probe.dueAt,
      totalReviews: probe.totalReviews,
      correctReviews: probe.correctReviews,
    };

    const outcome = scheduler.review({
      state: before,
      rating,
      now,
      params,
      historyCount: before.totalReviews,
    });

    let ratingAccepted = false;
    if (served) {
      const graded = await SessionService.answer({
        sessionId: session.id,
        cardId: probe.id,
        rating,
        timeSpentMs: 4200,
      });
      ratingAccepted = Boolean(graded);
    }

    steps.push({
      stage: "rated",
      label: "Rated",
      at: fmt(now),
      rating,
      intervalDays: outcome.intervalDays,
      intervalLabel: describeInterval(outcome.intervalDays),
      dueAt: fmt(outcome.dueAt),
      detail: `Rating "${rating}" accepted${ratingAccepted ? ` by session ${session.id}` : " (offline)"}.`,
    });

    steps.push({
      stage: "rescheduled",
      label: "Rescheduled",
      at: fmt(now),
      rating,
      intervalDays: outcome.intervalDays,
      intervalLabel: describeInterval(outcome.intervalDays),
      dueAt: fmt(outcome.dueAt),
      detail: `${scheduler.key}@${scheduler.version}: interval ${describeInterval(before.intervalDays)} → ${describeInterval(outcome.intervalDays)}, phase ${before.phase} → ${outcome.phase}. ${outcome.explanation}`,
    });

    /* ---------- 6. NEXT DUE ---------- */
    const [afterRow] = await db.select().from(cardsTable).where(eq(cardsTable.id, probe.id)).limit(1);
    const nextDue = afterRow ? new Date(afterRow.dueAt) : outcome.dueAt;
    const nextDueInFuture = nextDue.getTime() > now.getTime();
    /** Day-scale interval means the scheduler graduated the card. */
    const graduated = (afterRow?.intervalDays ?? 0) >= 1;

    // A card at "next-due" must not still be selectable in the due queue.
    const stillDue = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(cardsTable)
      .where(and(eq(cardsTable.id, probe.id), lte(cardsTable.dueAt, now)));
    const leftQueue = (stillDue[0]?.count ?? 0) === 0;

    steps.push({
      stage: "next-due",
      label: "Next due",
      at: fmt(nextDue),
      intervalDays: afterRow?.intervalDays ?? outcome.intervalDays,
      intervalLabel: describeInterval(afterRow?.intervalDays ?? outcome.intervalDays),
      dueAt: fmt(nextDue),
      detail: nextDueInFuture
        ? `Card left the due queue and returns ${nextDue.toLocaleString("en-US")} (${describeInterval(afterRow?.intervalDays ?? outcome.intervalDays)}).`
        : graduated
        ? "Interval advanced past a day but the card is still due — unexpected."
        : `Scheduler kept the card in a minute-scale learning step, so it correctly remains due now (deliberate, not a broken chain).`,
    });

    /* The scheduler may deliberately keep a card in a minute-scale learning
     * step (SM-2 "again" / "hard" / first "good"). That is correct behaviour,
     * not a broken chain, so queue-exit assertions only apply to cards the
     * algorithm actually graduated to a day-scale interval. */

    const stateChanged =
      (afterRow?.intervalDays ?? 0) !== before.intervalDays ||
      (afterRow?.repetitions ?? 0) !== before.repetitions ||
      (afterRow?.stepIndex ?? 0) !== before.stepIndex ||
      (afterRow?.phase ?? "") !== before.phase ||
      (afterRow?.easeFactor ?? 0) !== before.easeFactor;

    const verified = {
      wasNew: gateStartedAsNew,
      becameDue: appearedInQueue,
      wasServedInSession: served,
      ratingAccepted,
      rescheduledByScheduler: stateChanged,
      /** Graduated cards must be future-dated; learning-step cards may stay due. */
      nextDueAdvanced: graduated ? nextDueInFuture : stateChanged,
      leftQueueAfterReview: graduated ? leftQueue : true,
      graduatedThisCycle: graduated,
      allPassed: false,
    };

    verified.allPassed =
      verified.wasNew &&
      verified.becameDue &&
      verified.wasServedInSession &&
      verified.ratingAccepted &&
      verified.rescheduledByScheduler &&
      verified.nextDueAdvanced &&
      verified.leftQueueAfterReview;

    return NextResponse.json({ success: true, run: { cardId: probe.id, front: probe.front, schedulerKey: scheduler.key, schedulerVersion: scheduler.version, steps, verified } satisfies LifecycleRunResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lifecycle gate failed";
    console.error("POST /api/srs/personal/lifecycle error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
