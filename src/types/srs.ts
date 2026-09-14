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
export type SessionQueueOrder =
  | "due"
  | "random"
  | "descending"
  | "new-first"
  /** Prompt 11.5 — weakness-weighted, personalised ordering. */
  | "personalized";

export const SESSION_QUEUE_ORDERS: SessionQueueOrder[] = [
  "due",
  "random",
  "descending",
  "new-first",
  "personalized",
];

export const SESSION_ORDER_LABELS: Record<
  SessionQueueOrder,
  { label: string; description: string }
> = {
  due: { label: "Due order", description: "Most overdue cards first — standard catch-up order." },
  random: { label: "Random", description: "Shuffled to avoid predicting the next card." },
  descending: { label: "Hardest first", description: "Longest interval (most mature) cards first." },
  "new-first": { label: "New first", description: "Introduce all new material, then clear the backlog." },
  personalized: {
    label: "Personalized",
    description:
      "Weak, lapse-prone and long-unseen cards surface first, weighted by your personalisation settings.",
  },
};

/* ============================================================
 * PHASE 11 — Prompt 11.5: Personalized Review
 * ============================================================ */

/**
 * Stored USER INTENT only. Every derived signal (accuracy, weakness, velocity)
 * is computed live from the review log so it can never drift from it.
 */
export interface PersonalizationPrefs {
  /** How strongly low personal accuracy pulls a card to the front (0–1). */
  weaknessWeight: number;
  /** How strongly overdue-ness pulls a card forward (0–1). */
  urgencyWeight: number;
  /** How strongly scheduler-reported difficulty influences order (0–1). */
  difficultyWeight: number;
  /** Prefer cards drawn from statistically weak areas. */
  preferWeakAreas: boolean;
  /** Cap weak cards per session. 0 = no cap. */
  maxWeakCardsPerSession: number;
  /** Suggest raising/lowering daily new-card target from observed performance. */
  autoAdaptTargets: boolean;
  /** Place the weakest cards at the very front of the queue. */
  weakFirst: boolean;
}

/** Per-card personalised statistics derived from the review log. */
export interface PersonalCardStat {
  cardId: string;
  front: string;
  cardType: string;
  deckId: string;
  deckName: string;
  attempts: number;
  correct: number;
  lapses: number;
  /** Laplace-smoothed accuracy — avoids over-reacting to a single attempt. */
  smoothedAccuracy: number;
  rawAccuracy: number;
  avgTimeMs: number;
  lastRating: SrsRating | null;
  daysSinceReview: number | null;
  /** Accuracy over the most recent 3 attempts, or null when too few. */
  recentAccuracy: number | null;
  /** Negative when trending down (getting worse). */
  trend: number | null;
  /** 0–1 weakness score after smoothing, recency and trend adjustments. */
  weakness: number;
  /** Scheduler-owned state used only as a secondary ordering signal. */
  intervalDays: number;
  easeFactor: number;
  isLearning: boolean;
  phase: SrsPhase;
}

/** Weakness rollup for a knowledge area (card type, deck, question category or tag). */
export interface PersonalAreaStat {
  areaKey: string;
  areaLabel: string;
  /** cardType | deck | category | tag */
  dimension: "cardType" | "deck" | "category" | "tag";
  attempts: number;
  correct: number;
  accuracy: number;
  uniqueCards: number;
  lapses: number;
  /** 0–1, higher = weaker. */
  weakness: number;
  /** True when enough attempts exist to trust the number. */
  isReliable: boolean;
}

export interface LearnerProfile {
  userId: string;
  generatedAt: string;
  cardsTracked: number;
  cardsWithHistory: number;
  newUntouched: number;
  totals: {
    reviews: number;
    correct: number;
    accuracy: number;
    lapses: number;
    avgTimeMs: number;
  };
  velocity: {
    activeDays: number;
    /** Mean reviews across days that had activity. */
    avgReviewsPerActiveDay: number;
    /** Reviews per calendar day over the trailing window, including idle days. */
    reviewsPerDay: number;
    windowDays: number;
  };
  /** Retention over reviews whose scheduled interval had fully elapsed. */
  retention: {
    measurableReviews: number;
    successful: number;
    percent: number;
  };
  weakAreas: PersonalAreaStat[];
  strongestAreas: PersonalAreaStat[];
  weakCards: PersonalCardStat[];
  /** Cards answered correctly on the last attempt after earlier lapses. */
  recoveringCards: number;
  /** Scheduler-difficulty-derived load, useful for pacing commentary. */
  strainIndex: number;
}

export interface PersonalizedPlan {
  headline: string;
  rationale: string[];
  suggested: {
    newLimit: number;
    reviewLimit: number;
    order: SessionQueueOrder;
    sessionSize: number;
    estimatedMinutes: number;
  };
  focusAreas: Array<{ label: string; weakness: number; accuracy: number; attempts: number }>;
  /** Suggested new daily target, only when autoAdaptTargets is enabled. */
  targetAdjustment: {
    currentNewTarget: number;
    suggestedNewTarget: number;
    direction: "up" | "down" | "hold";
    reason: string;
  } | null;
  appliedPrefs: PersonalizationPrefs;
}

export interface LifecycleStep {
  stage:
    | "created"
    | "new"
    | "due"
    | "reviewed"
    | "rated"
    | "rescheduled"
    | "next-due";
  label: string;
  japanese: string;
  at: string | null;
  detail: string;
  intervalDays?: number;
  schedulerKey?: string;
  rating?: SrsRating;
}

export interface CardLifecycleTrace {
  cardId: string;
  front: string;
  back: string;
  reading: string | null;
  deckName: string;
  schedulerKey: string;
  schedulerVersion: string;
  currentStage: LifecycleStep["stage"];
  timeline: LifecycleStep[];
  currentState: SrsCardState;
  inQueueNow: boolean;
  /** Interval each rating would produce if chosen right now. */
  ratingFutures: Array<{
    rating: SrsRating;
    intervalLabel: string;
    intervalDays: number;
    phase: SrsPhase;
    dueAt: string;
  }>;
  personalStat: PersonalCardStat | null;
}

export interface LifecycleRunResult {
  cardId: string;
  front: string;
  schedulerKey: string;
  schedulerVersion: string;
  steps: Array<{
    stage: LifecycleStep["stage"];
    label: string;
    at: string;
    rating?: SrsRating;
    intervalDays: number;
    intervalLabel: string;
    dueAt: string;
    detail: string;
  }>;
  verified: {
    wasNew: boolean;
    becameDue: boolean;
    wasServedInSession: boolean;
    ratingAccepted: boolean;
    /** State changed in a way the scheduler decided. */
    rescheduledByScheduler: boolean;
    /**
     * Interval advanced. For graduated cards this requires the next due date to
     * be in the future; a minute-scale learning step only requires that the
     * scheduler actually changed state.
     */
    nextDueAdvanced: boolean;
    /** True when the card left the due queue, or was kept deliberately. */
    leftQueueAfterReview: boolean;
    /** Whether the algorithm promoted the card to a day-scale interval. */
    graduatedThisCycle: boolean;
    allPassed: boolean;
  };
}

export interface PersonalizedResponse {
  prefs: PersonalizationPrefs;
  defaults: PersonalizationPrefs;
  profile: LearnerProfile;
  plan: PersonalizedPlan;
  day: DayWindow;
  settings: DailySettings;
}

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
  /** Prompt 11.5 — why personalization placed this card here (transparency). */
  priorityReason?: string;
  priorityScore?: number;
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

/* ============================================================
 * PHASE 11 — Prompt 11.3: Daily Due Queue
 * ============================================================ */

export interface DailySettings {
  timezone: string;
  dayCutoffHour: number;
  dailyNewTarget: number;
  dailyReviewTarget: number;
  maxDailyReviews: number;
  maxDailyNew: number;
  loadBalanceBacklog: boolean;
  forecastDays: number;
}

export interface DayWindow {
  start: string;
  end: string;
  /** Learner-local calendar label, e.g. "2026-09-14". */
  localDate: string;
  cutoffHour: number;
  timezone: string;
  /** Minutes the learner's zone is offset from UTC at this instant. */
  offsetMinutes: number;
}

export type DailySeverity = "clear" | "on-track" | "heavy" | "backlog";

export interface DailyBuckets {
  /** Fell due before today's cutoff — the learner is behind on these. */
  overdue: { count: number; cardIds: string[]; oldestDays: number; sample: string[] };
  /** Due inside today's window. */
  dueToday: { count: number; cardIds: string[]; sample: string[] };
  /** Learning-phase cards that mature later in the day (short intervals). */
  laterToday: { count: number; cardIds: string[]; sample: string[] };
  /** Never-reviewed cards available to introduce today. */
  newAvailable: { count: number; cardIds: string[]; sample: string[] };
  suspended: number;
}

export interface DailyTotals {
  totalDueToday: number;
  totalAvailable: number;
  learning: number;
  review: number;
  mature: number;
}

export interface DailyProgress {
  reviewsDone: number;
  reviewsTarget: number;
  newDone: number;
  newTarget: number;
  percentComplete: number;
  timeSpentMs: number;
  accuracy: number;
  againCount: number;
  remainingToday: number;
}

export interface DailyStreak {
  current: number;
  longest: number;
  daysActive: number;
  lastActiveLocalDate: string | null;
  isActiveToday: boolean;
}

export interface DailyForecastEntry {
  /** Learner-local date key. */
  date: string;
  label: string;
  weekday: string;
  count: number;
  newCount: number;
  reviewCount: number;
  isToday: boolean;
  isOverdue: boolean;
  /** Suggested cap for this day once load balancing is applied. */
  balancedCount: number;
}

export interface DailyRecommendation {
  severity: DailySeverity;
  headline: string;
  detail: string;
  suggestedSessionSize: number;
  suggestedNew: number;
  suggestedReview: number;
  backlogDays: number;
  /** Per-day redistribution proposal when load balancing applies. */
  redistribution?: Array<{ date: string; from: number; to: number }>;
}

export interface DailyHistoryEntry {
  date: string;
  weekday: string;
  reviews: number;
  correct: number;
  accuracy: number;
  newIntroduced: number;
  timeSpentMs: number;
  targetMet: boolean;
}

export interface DailyQueueResponse {
  day: DayWindow;
  settings: DailySettings;
  buckets: DailyBuckets;
  totals: DailyTotals;
  progress: DailyProgress;
  streak: DailyStreak;
  forecast: DailyForecastEntry[];
  recommendation: DailyRecommendation;
  history: DailyHistoryEntry[];
  /** Ready-to-use inputs for POST /api/srs/sessions. */
  suggestedSession: {
    deckId: string | null;
    newLimit: number;
    reviewLimit: number;
    order: SessionQueueOrder;
    label: string;
    dueHorizon: "now" | "day";
  };
  /** Recommended review count for today, mirrored for convenient UI access. */
  suggestedReview: number;
}

/* ============================================================
 * PHASE 11 — Prompt 11.4: SRS Synchronization
 * ============================================================ */

export type SyncPlatform = "web" | "ios" | "android" | "desktop";

export interface SyncDevice {
  id: string;
  userId: string;
  deviceId: string;
  name: string;
  platform: SyncPlatform;
  appVersion: string;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  lastRegistryFingerprint: string | null;
  isRevoked: boolean;
  createdAt: string | Date;
  lastSeenAt: string | Date;
  /** Derived for convenience. */
  pendingReviews?: number;
}

export interface SyncRegistryStatus {
  fingerprint: string;
  schedulerKeys: string[];
  versions: Record<string, string>;
  pluginCount: number;
  /** True when the device's acknowledged fingerprint != current. */
  deviceIsStale: boolean;
}

/** A review event produced on a device, pushed for replay. */
export interface SyncReviewEvent {
  /** Device-generated idempotency key. Stable across retries. */
  clientId: string;
  cardId: string;
  rating: SrsRating;
  /** When the answer actually happened on the device (may be in the past). */
  reviewedAt: string;
  timeSpentMs?: number;
  /** Optional device-side pre-review state, used for conflict detection. */
  stateBefore?: Partial<SrsCardState>;
  sessionId?: string;
}

export interface SyncPushPayload {
  deviceId: string;
  deviceName?: string;
  platform?: SyncPlatform;
  appVersion?: string;
  events: SyncReviewEvent[];
}

export interface SyncPerCardOutcome {
  cardId: string;
  front: string;
  accepted: number;
  duplicatesSkipped: number;
  /** True when server state had diverged from the device's view. */
  conflict: boolean;
  schedulerKey: string;
  schedulerVersion: string;
  finalIntervalDays: number;
  finalIntervalLabel: string;
  dueAt: string;
  explanation: string;
}

export interface SyncPushResult {
  logId: string;
  deviceId: string;
  accepted: number;
  duplicatesSkipped: number;
  conflictsResolved: number;
  cardsTouched: number;
  perCard: SyncPerCardOutcome[];
  cursor: string;
  serverTime: string;
}

export interface SyncCardDelta {
  id: string;
  deckId: string;
  cardType: string;
  front: string;
  back: string;
  reading: string | null;
  meaning: string | null;
  hint: string | null;
  sourceType: string;
  sourceRef: string | null;
  state: SrsCardState;
  schedulerKey: string;
  isSuspended: boolean;
  updatedAt: string;
}

export interface SyncReviewDelta {
  id: string;
  clientId: string | null;
  deviceId: string | null;
  cardId: string;
  rating: SrsRating;
  wasCorrect: boolean;
  intervalDays: number;
  schedulerKey: string;
  schedulerVersion: string;
  explanation: string;
  reviewedAt: string;
}

export interface SyncPullResult {
  deviceId: string;
  cursorRequested: string | null;
  nextCursor: string;
  serverTime: string;
  registry: SyncRegistryStatus;
  decks: SrsDeck[];
  cards: SyncCardDelta[];
  reviews: SyncReviewDelta[];
  counts: { cards: number; reviews: number; decks: number };
  /** True when the payload was truncated by the page limit. */
  hasMore: boolean;
}

export interface SyncLogEntry {
  id: string;
  deviceId: string;
  operation: string;
  status: string;
  accepted: number;
  duplicatesSkipped: number;
  conflictsResolved: number;
  cardsTouched: number;
  payloadCount: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  registryFingerprint: string | null;
  message: string;
  createdAt: string | Date;
}

export interface SyncStatusResponse {
  registry: SyncRegistryStatus;
  devices: SyncDevice[];
  recentLog: SyncLogEntry[];
  totals: {
    devices: number;
    activeDevices: number;
    reviewsSynced: number;
    conflictsResolved: number;
    duplicatesBlocked: number;
  };
  serverTime: string;
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
