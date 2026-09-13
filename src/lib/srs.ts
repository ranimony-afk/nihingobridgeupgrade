// A simplified SM-2 spaced repetition scheduler.
// easeFactor is stored as an integer x100 (250 => 2.5).

export type Rating = "again" | "hard" | "good" | "easy";

export type SrsState = {
  repetitions: number;
  intervalDays: number;
  easeFactor: number; // x100
};

export type SrsResult = SrsState & {
  dueAt: Date;
  learned: boolean;
};

const MIN_EASE = 130;

export function schedule(state: SrsState, rating: Rating): SrsResult {
  let { repetitions, intervalDays, easeFactor } = state;

  if (rating === "again") {
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 20);
  } else {
    // quality adjustment to ease
    if (rating === "hard") easeFactor = Math.max(MIN_EASE, easeFactor - 15);
    if (rating === "easy") easeFactor = easeFactor + 15;

    repetitions += 1;

    if (repetitions === 1) {
      intervalDays = rating === "easy" ? 4 : 1;
    } else if (repetitions === 2) {
      intervalDays = rating === "hard" ? 3 : 6;
    } else {
      const factor = easeFactor / 100;
      const mult = rating === "hard" ? 1.2 : factor;
      intervalDays = Math.max(1, Math.round(intervalDays * mult));
    }
  }

  const dueAt = new Date();
  if (rating === "again") {
    dueAt.setMinutes(dueAt.getMinutes() + 5); // review again soon
  } else {
    dueAt.setDate(dueAt.getDate() + intervalDays);
  }

  return {
    repetitions,
    intervalDays,
    easeFactor,
    dueAt,
    learned: repetitions >= 2 && rating !== "again",
  };
}

export const ratingLabels: Record<Rating, { label: string; hint: string; color: string }> = {
  again: { label: "Again", hint: "< 5 min", color: "bg-rose-500 hover:bg-rose-600" },
  hard: { label: "Hard", hint: "shorter", color: "bg-amber-500 hover:bg-amber-600" },
  good: { label: "Good", hint: "on track", color: "bg-emerald-500 hover:bg-emerald-600" },
  easy: { label: "Easy", hint: "longer", color: "bg-sky-500 hover:bg-sky-600" },
};
