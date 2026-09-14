/* ============================================================
 * PHASE 11 — SRS SCHEDULER ABSTRACTION (Prompt 11.1)
 *
 * These contracts are the single seam between the platform and
 * any spaced-repetition algorithm. Algorithms are pure functions
 * over immutable-ish state: (state, rating, params) -> outcome.
 *
 * RULES:
 *  1. No algorithm may import the database.
 *  2. No algorithm may assume it is the only algorithm.
 *  3. New algorithms are added by registering a new SrsScheduler.
 *  4. The database stores keys + params, never logic.
 * ============================================================ */

export type SrsRating = "again" | "hard" | "good" | "easy";

export const SRS_RATINGS: SrsRating[] = ["again", "hard", "good", "easy"];

/** Maps a human rating to a 0–5 SM-2 style quality (0 = blackout, 5 = perfect). */
export const RATING_TO_QUALITY: Record<SrsRating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export const RATING_LABELS: Record<SrsRating, { label: string; japanese: string; hint: string }> = {
  again: { label: "Again", japanese: "もう一度", hint: "Could not recall at all" },
  hard: { label: "Hard", japanese: "難しい", hint: "Recalled with serious difficulty" },
  good: { label: "Good", japanese: "できた", hint: "Recalled correctly" },
  easy: { label: "Easy", japanese: "簡単", hint: "Instant, effortless recall" },
};

/** Algorithms shipped in the registry. Adding a new key = adding a new strategy file. */
export type SchedulerKey = "sm2" | "leitner-box" | "fsrs-lite" | "fixed-ladder";

/** Generic parameter bag — validated against each algorithm's `paramFields`. */
export type SchedulerParams = Record<string, number | boolean | number[] | string>;

export type SrsPhase = "learning" | "review" | "relearning" | "graduated";

/**
 * Algorithm-agnostic superset of all scheduling state.
 * Each algorithm uses the subset it needs. Adding an algorithm
 * therefore never requires a database migration.
 */
export interface SrsCardState {
  repetitions: number;
  easeFactor: number; // SM-2 easiness (1.3 – 3.5+)
  intervalDays: number; // current scheduled interval in days
  lapses: number; // total "again" events during review phase
  box: number; // Leitner box index
  stabilityDays: number; // FSRS memory stability
  difficulty: number; // FSRS item difficulty (1 – 10)
  stepIndex: number; // index into the learning-step ladder
  isLearning: boolean;
  phase: SrsPhase;
  lastReviewedAt: Date | string | null;
  dueAt: Date | string;
  totalReviews: number;
  correctReviews: number;
}

/** Declarative metadata so the UI can auto-generate a config panel. */
export interface SchedulerParamField {
  key: string;
  label: string;
  type: "number" | "boolean" | "array";
  description: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: "days" | "minutes" | "x" | "%" | "count";
}

export interface SchedulerReviewContext {
  state: SrsCardState;
  rating: SrsRating;
  now: Date;
  params: SchedulerParams;
  historyCount: number;
}

export interface SchedulerReviewOutcome {
  dueAt: Date;
  intervalDays: number;
  repetitions: number;
  easeFactor: number;
  stabilityDays: number;
  difficulty: number;
  box: number;
  stepIndex: number;
  isLearning: boolean;
  phase: SrsPhase;
  lapses: number;
  wasCorrect: boolean;
  /** Human-readable rationale, persisted to the review log for auditability. */
  explanation: string;
}

/** The contract every scheduler implementation must satisfy. */
export interface SrsScheduler {
  key: SchedulerKey;
  name: string;
  shortName: string;
  version: string;
  description: string;
  strengths: string[];
  defaultParams: SchedulerParams;
  paramFields: SchedulerParamField[];
  review(ctx: SchedulerReviewContext): SchedulerReviewOutcome;
  isDue(state: SrsCardState, now: Date): boolean;
  /** Interval the algorithm assigns to a brand-new card that survives the learning steps. */
  newCardGraduatingIntervalDays(params: SchedulerParams): number;
}

export interface SchedulerDescriptor {
  key: SchedulerKey;
  name: string;
  shortName: string;
  version: string;
  description: string;
  strengths: string[];
  defaultParams: SchedulerParams;
  paramFields: SchedulerParamField[];
  /** Simulated interval ladder if the learner keeps answering "good". */
  intervalLadder: Array<{ step: number; intervalDays: number; label: string }>;
}

export interface SrsCard {
  id: string;
  deckId: string;
  userId: string;
  cardType: string;
  front: string;
  back: string;
  reading?: string | null;
  meaning?: string | null;
  hint?: string | null;
  sourceType: string;
  sourceRef?: string | null;
  sourceQuestionId?: string | null;
  state: SrsCardState;
  schedulerKey: SchedulerKey;
  isSuspended: boolean;
  createdAt?: string | Date;
  deckName?: string;
  jlptLevel?: string;
}

export interface SrsDeck {
  id: string;
  name: string;
  description: string;
  jlptLevel: string;
  ownerId: string;
  schedulerKey: SchedulerKey;
  schedulerParams: SchedulerParams;
  isArchived: boolean;
  cardCount?: number;
  dueCount?: number;
  newCount?: number;
  createdAt?: string | Date;
}

export interface GradedCardPayload {
  reviewId: string;
  card: SrsCard;
  rating: SrsRating;
  schedulerKey: SchedulerKey;
  schedulerVersion: string;
  paramsApplied: SchedulerParams;
  intervalDays: number;
  dueAt: string;
  explanation: string;
  phase: SrsPhase;
  stateBefore: SrsCardState;
}

/* ============================================================
 * PHASE 11 — Prompt 11.2: Review Session
 * ============================================================ */

/** How the planned queue is ordered. */
export type SessionQueueOrder = "due" | "random" | "descending" | "new-first";

export const SESSION_QUEUE_ORDERS: SessionQueueOrder[] = [
  "due",
  "random",
  "descending",
  "new-first",
];

export const SESSION_ORDER_LABELS: Record<
  SessionQueueOrder,
  { label: string; description: string }
> = {
  due: { label: "Due order", description: "Most overdue cards first — standard catch-up order." },
  random: { label: "Random", description: "Shuffled to avoid predicting the next card." },
  descending: { label: "Hardest first", description: "Longest interval (most mature) cards first." },
  "new-first": { label: "New first", description: "Introduce all new material, then clear the backlog." },
};

export type SessionStatus = "active" | "completed" | "abandoned";

export interface SessionPlanConfig {
  newLimit: number;
  reviewLimit: number;
  maxCards: number;
  order: SessionQueueOrder;
  dailyNewBudget: number;
  dailyNewUsedAtPlan: number;
  deckName: string;
  schedulerKeys: string[];
}

export interface SessionQueueEntry {
  cardId: string;
  kind: "new" | "review";
}

/** A card hydrated for study, plus what each rating would do next. */
export interface SessionCard {
  card: SrsCard;
  kind: "new" | "review";
  /** Interval produced by each rating if chosen right now. */
  ratingPreviews: Array<{
    rating: SrsRating;
    intervalDays: number;
    intervalLabel: string;
    phase: SrsPhase;
  }>;
}

/** Progress is derived, never denormalised. */
export interface SessionProgress {
  total: number;
  answered: number;
  remaining: number;
  cursor: number;
  correct: number;
  accuracy: number;
  totalMs: number;
  byRating: Record<SrsRating, number>;
  newIntroduced: number;
  reviewsDone: number;
  elapsedSeconds: number;
}

export interface SrsReviewSession {
  id: string;
  userId: string;
  deckId: string | null;
  status: SessionStatus;
  config: SessionPlanConfig;
  queueSize: number;
  startedAt: string | Date;
  lastActivityAt: string | Date;
  completedAt?: string | Date | null;
  cancelledReason?: string | null;
  progress: SessionProgress;
}

/** Current position in an active session. */
export interface SessionStateResponse {
  session: SrsReviewSession;
  currentCard: SessionCard | null;
  recentAnswers: Array<{
    reviewId: string;
    cardId: string;
    front: string;
    rating: SrsRating;
    intervalDays: number;
    intervalLabel: string;
    schedulerKey: string;
    schedulerVersion: string;
    explanation: string;
    timeSpentMs: number;
  }>;
}

export interface SessionAnswerResult {
  reviewId: string;
  cardId: string;
  front: string;
  rating: SrsRating;
  intervalDays: number;
  intervalLabel: string;
  dueAt: string;
  schedulerKey: string;
  schedulerVersion: string;
  paramsApplied: SchedulerParams;
  explanation: string;
  phase: SrsPhase;
  progress: SessionProgress;
  nextCard: SessionCard | null;
  sessionComplete: boolean;
}

export interface SessionUndoResult {
  undone: {
    reviewId: string;
    cardId: string;
    front: string;
    rating: SrsRating;
  } | null;
  restoredState: SrsCardState | null;
  progress: SessionProgress;
  currentCard: SessionCard | null;
}

export interface SessionSummary {
  session: SrsReviewSession;
  status: SessionStatus;
  duration: {
    totalMs: number;
    seconds: number;
    cardsPerMinute: number;
    avgSecondsPerCard: number;
  };
  results: {
    total: number;
    correct: number;
    accuracy: number;
    newIntroduced: number;
    reviewsDone: number;
    byRating: Record<SrsRating, number>;
  };
  schedulerBreakdown: Array<{
    schedulerKey: string;
    schedulerVersion: string;
    answers: number;
    correct: number;
    accuracy: number;
    avgIntervalDays: number;
  }>;
  cardOutcomes: Array<{
    reviewId: string;
    cardId: string;
    front: string;
    back: string;
    reading: string | null;
    deckName: string;
    rating: SrsRating;
    wasCorrect: boolean;
    intervalDays: number;
    intervalLabel: string;
    dueAt: string;
    timeSpentMs: number;
    schedulerKey: string;
    explanation: string;
  }>;
  nextDuePreview: Array<{ day: string; count: number }>;
  weakestCards: Array<{ front: string; rating: SrsRating; lapses: number }>;
}

export interface SrsStats {
  totalCards: number;
  newCards: number;
  learning: number;
  review: number;
  mature: number;
  dueNow: number;
  dueToday: number;
  suspended: number;
  retentionPercent: number;
  reviewsToday: number;
  totalReviews: number;
  forecast: Array<{ day: string; count: number }>;
  recentReviews: Array<{
    id: string;
    front: string;
    rating: SrsRating;
    intervalDays: number;
    schedulerKey: string;
    schedulerVersion: string;
    explanation: string;
    reviewedAt: string | Date;
  }>;
  schedulerUsage: Array<{ schedulerKey: string; reviews: number; cards: number }>;
}
