export type SrsState = {
  intervalDays: number;
  easeFactorBps: number;
  repetitions: number;
  lapses: number;
};

export type SrsTransition = SrsState & {
  dueAt: Date;
  previousIntervalDays: number;
  previousEaseFactorBps: number;
};

/** SM-2 compatible scheduler with integer basis points for stable persistence. */
export function calculateSrsTransition(state: SrsState, rating: number, now = new Date()): SrsTransition {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    throw new Error("SRS rating must be an integer from 0 through 5.");
  }

  const previousIntervalDays = state.intervalDays;
  const previousEaseFactorBps = state.easeFactorBps;
  let easeFactorBps = state.easeFactorBps;
  let repetitions = state.repetitions;
  let lapses = state.lapses;
  let intervalDays: number;

  if (rating < 3) {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
    easeFactorBps = Math.max(130, easeFactorBps - 20);
  } else {
    const qualityAdjustment = Math.round((0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)) * 100);
    easeFactorBps = Math.max(130, easeFactorBps + qualityAdjustment);
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(previousIntervalDays * (easeFactorBps / 100)));
  }

  const dueAt = new Date(now);
  dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays);

  return {
    previousIntervalDays,
    previousEaseFactorBps,
    intervalDays,
    easeFactorBps,
    repetitions,
    lapses,
    dueAt,
  };
}
