/**
 * SRSAlgorithm — Pure scheduling math. No database, no UI, no side effects.
 *
 * Implements FSRS-5 (Free Spaced Repetition Scheduler v5) as primary algorithm
 * with SM-2 as a fallback. The algorithm is a pure function:
 *
 *   (cardState, rating, params) → newCardState
 *
 * References:
 *   - FSRS: https://github.com/open-spaced-repetition/fsrs4anki
 *   - SM-2: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type CardState = "new" | "learning" | "review" | "relearning";
export type Rating = "again" | "hard" | "good" | "easy";

/** The scheduling-relevant state of a card. */
export interface CardSchedule {
  state: CardState;
  stability: number;   // FSRS: how "stable" the memory is (higher = longer intervals)
  difficulty: number;   // FSRS: how hard the card is (0–10)
  elapsedDays: number;  // days since last review
  scheduledDays: number; // planned interval
  reps: number;         // total review count
  lapses: number;       // total "again" count
  due: Date | null;     // next review date
  lastReviewAt: Date | null;
}

/** Output of scheduling: the new card state after a review. */
export interface ScheduleResult {
  state: CardState;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  due: Date;
  reps: number;
  lapses: number;
}

/** Algorithm parameters (FSRS weights). */
export interface AlgorithmParams {
  /** Algorithm identifier. */
  algorithm: "fsrs-5" | "sm-2";
  /** FSRS-5 weights (19 floats). Null = use defaults. */
  weights: number[] | null;
  /** Target retention rate (0.0–1.0). */
  desiredRetention: number;
}

// ─────────────────────────────────────────────
// FSRS-5 default weights
// ─────────────────────────────────────────────

const FSRS5_DEFAULTS: number[] = [
  0.40255, 1.18385, 3.173, 15.69105,  // w0–w3: initial stability
  7.1949, 0.5345, 1.4604, 0.0046,     // w4–w7: difficulty
  1.54575, 0.1192, 1.01925, 1.9395,   // w8–w11: stability after recall
  0.11, 0.29605, 2.2698, 0.2315,      // w12–w15: stability after forget
  2.9898, 0.51655, 0.6621,            // w16–w18: difficulty adjustments
];

// ─────────────────────────────────────────────
// SRSAlgorithm
// ─────────────────────────────────────────────

export const SRSAlgorithm = {
  /** Get default FSRS-5 parameters. */
  defaultParams(): AlgorithmParams {
    return { algorithm: "fsrs-5", weights: null, desiredRetention: 0.9 };
  },

  /**
   * Schedule a card after a review. Pure function — no side effects.
   *
   * @param card  Current card scheduling state
   * @param rating  User's recall rating
   * @param params  Algorithm parameters
   * @param now  Current time (injectable for testing)
   */
  schedule(
    card: CardSchedule,
    rating: Rating,
    params: AlgorithmParams = SRSAlgorithm.defaultParams(),
    now: Date = new Date(),
  ): ScheduleResult {
    if (params.algorithm === "sm-2") {
      return SRSAlgorithm._sm2(card, rating, now);
    }
    return SRSAlgorithm._fsrs5(card, rating, params, now);
  },

  /** Calculate the retrievability (probability of recall) for a card. */
  retrievability(card: CardSchedule, now: Date = new Date()): number {
    if (!card.lastReviewAt || card.stability <= 0) return 0;
    const elapsed = (now.getTime() - card.lastReviewAt.getTime()) / (1000 * 60 * 60 * 24);
    // FSRS power-law decay: R = (1 + elapsed / (9 * S))^(-1)
    return Math.pow(1 + elapsed / (9 * card.stability), -1);
  },

  // ─── FSRS-5 Implementation ───

  _fsrs5(card: CardSchedule, rating: Rating, params: AlgorithmParams, now: Date): ScheduleResult {
    const w = params.weights ?? FSRS5_DEFAULTS;
    const ratingNum = { again: 1, hard: 2, good: 3, easy: 4 }[rating];
    const dr = params.desiredRetention;

    let newStability: number;
    let newDifficulty: number;
    let newState: CardState;
    let newLapses = card.lapses;
    const newReps = card.reps + 1;

    if (card.state === "new") {
      // First review — initial stability from FSRS weights
      newStability = w[ratingNum - 1]!;
      newDifficulty = SRSAlgorithm._fsrsInitDifficulty(w, ratingNum);
      newState = rating === "again" ? "learning" : rating === "hard" ? "learning" : "review";
      if (rating === "again") newLapses++;
    } else if (rating === "again") {
      // Forgot — relearn
      newLapses++;
      newDifficulty = SRSAlgorithm._fsrsNextDifficulty(w, card.difficulty, ratingNum);
      newStability = SRSAlgorithm._fsrsForgetStability(w, card.stability, card.difficulty, card.elapsedDays);
      newState = "relearning";
    } else {
      // Recalled — update stability
      newDifficulty = SRSAlgorithm._fsrsNextDifficulty(w, card.difficulty, ratingNum);
      const retrievability = SRSAlgorithm.retrievability(card, now);
      newStability = SRSAlgorithm._fsrsRecallStability(w, card.stability, card.difficulty, retrievability, ratingNum);
      newState = "review";
    }

    // Clamp difficulty to [1, 10]
    newDifficulty = Math.max(1, Math.min(10, newDifficulty));

    // Calculate interval from stability and desired retention
    let interval: number;
    if (newState === "learning" || newState === "relearning") {
      interval = rating === "again" ? 0.0069 : rating === "hard" ? 0.0417 : 1; // minutes/hours/1day
    } else {
      interval = SRSAlgorithm._fsrsInterval(newStability, dr);
    }

    // Clamp interval
    interval = Math.max(1, Math.min(36500, Math.round(interval)));

    const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    return {
      state: newState,
      stability: Math.round(newStability * 10000) / 10000,
      difficulty: Math.round(newDifficulty * 10000) / 10000,
      scheduledDays: interval,
      due,
      reps: newReps,
      lapses: newLapses,
    };
  },

  _fsrsInitDifficulty(w: number[], rating: number): number {
    return w[4]! - Math.exp(w[5]! * (rating - 1)) + 1;
  },

  _fsrsNextDifficulty(w: number[], d: number, rating: number): number {
    const delta = -w[6]! * (rating - 3);
    return d + delta * (w[7]! * (10 - d) + 1);
  },

  _fsrsRecallStability(w: number[], s: number, d: number, r: number, rating: number): number {
    const hardPenalty = rating === 2 ? w[15]! : 1;
    const easyBonus = rating === 4 ? w[16]! : 1;
    return s * (
      1 + Math.exp(w[8]!) *
      (11 - d) *
      Math.pow(s, -w[9]!) *
      (Math.exp((1 - r) * w[10]!) - 1) *
      hardPenalty *
      easyBonus
    );
  },

  _fsrsForgetStability(w: number[], s: number, d: number, elapsedDays: number): number {
    return w[11]! *
      Math.pow(d, -w[12]!) *
      (Math.pow(s + 1, w[13]!) - 1) *
      Math.exp((1 - (elapsedDays > 0 ? elapsedDays : 1)) * w[14]!);
  },

  _fsrsInterval(s: number, dr: number): number {
    return (s / 9) * (Math.pow(1 / dr, 1) - 1);
  },

  // ─── SM-2 Fallback ───

  _sm2(card: CardSchedule, rating: Rating, now: Date): ScheduleResult {
    const ratingNum = { again: 0, hard: 2, good: 3, easy: 5 }[rating];
    let ease = card.difficulty > 0 ? card.difficulty * 100 : 250; // SM-2 uses ease as percentage (250 = 2.5)
    let interval = card.scheduledDays;
    let newState: CardState = card.state;
    let newLapses = card.lapses;

    if (ratingNum < 3) {
      // Failed
      interval = 1;
      newState = card.state === "new" ? "learning" : "relearning";
      if (rating === "again") newLapses++;
    } else {
      // Passed
      if (card.reps === 0) interval = 1;
      else if (card.reps === 1) interval = 6;
      else interval = Math.round(interval * ease / 100);
      newState = "review";
    }

    // Update ease factor
    ease = ease + (0.1 - (5 - ratingNum) * (0.08 + (5 - ratingNum) * 0.02)) * 100;
    ease = Math.max(130, ease);

    const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

    return {
      state: newState,
      stability: interval, // SM-2 uses interval as a proxy for stability
      difficulty: ease / 100,
      scheduledDays: interval,
      due,
      reps: card.reps + 1,
      lapses: newLapses,
    };
  },
};
