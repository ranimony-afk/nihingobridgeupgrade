import {
  SrsCardState,
  SrsRating,
  SchedulerParams,
  SchedulerReviewOutcome,
} from "@/types/srs";

/** Round a day interval to a sensible precision (fractional < 1 day, else integer). */
export function normalizeInterval(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0;
  if (days < 1) return Math.round(days * 120) / 120; // minute-level precision
  return Math.round(Math.min(days, 36500));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function num(params: SchedulerParams, key: string, fallback: number): number {
  const raw = params[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function bool(params: SchedulerParams, key: string, fallback: boolean): boolean {
  const raw = params[key];
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

export function list(params: SchedulerParams, key: string, fallback: number[]): number[] {
  const raw = params[key];
  if (Array.isArray(raw) && raw.every((v) => Number.isFinite(Number(v)))) {
    return raw.map(Number);
  }
  return fallback;
}

/** Learning-step ladder in minutes (default mirrors Anki-style 1m / 10m). */
export function learningSteps(params: SchedulerParams): number[] {
  const steps = list(params, "learningSteps", [1, 10]);
  const cleaned = steps.filter((s) => s > 0);
  return cleaned.length > 0 ? cleaned : [1, 10];
}

export function freshState(): SrsCardState {
  return {
    repetitions: 0,
    easeFactor: 2.5,
    intervalDays: 0,
    lapses: 0,
    box: 0,
    stabilityDays: 0,
    difficulty: 5,
    stepIndex: 0,
    isLearning: true,
    phase: "learning",
    lastReviewedAt: null,
    dueAt: new Date(),
    totalReviews: 0,
    correctReviews: 0,
  };
}

/** True when the rating represents a successful recall. */
export function isPassRating(rating: SrsRating): boolean {
  return rating === "good" || rating === "easy";
}

/**
 * Build a fully-populated outcome, filling any field an algorithm
 * does not explicitly manage with the incoming state. This keeps
 * strategies tiny and prevents accidental data loss between
 * algorithm switches.
 */
export function buildOutcome(
  state: SrsCardState,
  rating: SrsRating,
  overrides: Partial<SchedulerReviewOutcome>
): SchedulerReviewOutcome {
  const wasCorrect = isPassRating(rating);
  const base: SchedulerReviewOutcome = {
    dueAt: new Date(),
    intervalDays: state.intervalDays,
    repetitions: state.repetitions,
    easeFactor: state.easeFactor,
    stabilityDays: state.stabilityDays,
    difficulty: state.difficulty,
    box: state.box,
    stepIndex: state.stepIndex,
    isLearning: state.isLearning,
    phase: state.phase,
    lapses: state.lapses,
    wasCorrect,
    explanation: "",
    ...overrides,
  };
  return base;
}

/**
 * FSRS forgetting curve. Retrievability decays as a power function.
 * R(t, S) = (1 + FACTOR * t / S) ^ DECAY, with DECAY = -0.5.
 */
export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = 19 / 81;

export function retrievability(elapsedDays: number, stabilityDays: number): number {
  if (stabilityDays <= 0) return 0;
  const r = Math.pow(1 + (FSRS_FACTOR * elapsedDays) / stabilityDays, FSRS_DECAY);
  return clamp(r, 0, 1);
}

/**
 * Interval (in days) at which retrievability drops to a target value.
 * t = (S / FACTOR) * (target^(1/DECAY) - 1)
 */
export function intervalForRetention(stabilityDays: number, targetRetention: number): number {
  if (stabilityDays <= 0) return 0;
  const t = (stabilityDays / FSRS_FACTOR) * (Math.pow(targetRetention, 1 / FSRS_DECAY) - 1);
  return Math.max(0.02, t);
}

/**
 * Simulate the interval ladder produced by repeatedly answering `rating`.
 * Shared by every algorithm so previews are always truthful.
 */
export function simulateIntervalLadder(
  review: (ctx: {
    state: SrsCardState;
    rating: SrsRating;
    now: Date;
    params: SchedulerParams;
    historyCount: number;
  }) => SchedulerReviewOutcome,
  params: SchedulerParams,
  steps: number,
  rating: SrsRating
): Array<{ step: number; intervalDays: number; label: string }> {
  let state = freshState();
  const now = new Date();
  const out: Array<{ step: number; intervalDays: number; label: string }> = [];

  for (let i = 1; i <= steps; i += 1) {
    const outcome = review({ state, rating, now, params, historyCount: i - 1 });
    out.push({
      step: i,
      intervalDays: outcome.intervalDays,
      label: describeInterval(outcome.intervalDays),
    });
    state = {
      ...state,
      repetitions: outcome.repetitions,
      easeFactor: outcome.easeFactor,
      intervalDays: outcome.intervalDays,
      lapses: outcome.lapses,
      box: outcome.box,
      stabilityDays: outcome.stabilityDays,
      difficulty: outcome.difficulty,
      stepIndex: outcome.stepIndex,
      isLearning: outcome.isLearning,
      phase: outcome.phase,
    };
  }

  return out;
}

export function describeInterval(days: number): string {
  if (days <= 0) return "now";
  if (days < 1) return `${Math.round(days * 24 * 60)}m`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
