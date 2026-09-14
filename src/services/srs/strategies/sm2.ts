import {
  SrsScheduler,
  SchedulerReviewContext,
  SchedulerReviewOutcome,
  SrsRating,
  RATING_TO_QUALITY,
} from "@/types/srs";
import {
  addDays,
  addMinutes,
  bool,
  buildOutcome,
  clamp,
  isPassRating,
  learningSteps,
  normalizeInterval,
  num,
} from "./shared";

/**
 * SuperMemo SM-2 (Wozniak, 1987) with Anki-style learning steps.
 *
 * Version notes:
 *  - v1.2 adds per-rating interval modifiers (hard penalty / easy bonus)
 *    and a lapse `newInterval` multiplier, matching modern Anki behaviour.
 *  - v1.1 added the easiness floor (1.3).
 *  - v1.0 is the textbook SM-2 recurrence.
 */
export const sm2Scheduler: SrsScheduler = {
  key: "sm2",
  name: "SuperMemo SM-2 (Anki-style)",
  shortName: "SM-2",
  version: "1.2.0",
  description:
    "The classic easiness-factor algorithm. Each answer updates a per-card easiness (EF) and the next interval is the previous interval multiplied by EF. Battle-tested for decades and highly predictable.",
  strengths: [
    "Extremely well understood and widely documented",
    "Simple per-card tunable easiness factor",
    "Very low CPU and storage cost",
    "Best for large factual decks (vocabulary, kanji readings)",
  ],
  defaultParams: {
    learningSteps: [1, 10],
    graduatingIntervalDays: 1,
    easyGraduatingIntervalDays: 4,
    startEaseFactor: 2.5,
    minimumEaseFactor: 1.3,
    easyBonus: 1.3,
    hardMultiplier: 1.2,
    intervalModifier: 1.0,
    lapseNewIntervalPercent: 0.5,
    maxIntervalDays: 365,
    useLearningSteps: true,
  },
  paramFields: [
    { key: "learningSteps", label: "Learning steps", type: "array", unit: "minutes", description: "Minute-based relearning ladder a new or lapsed card walks through before graduating." },
    { key: "graduatingIntervalDays", label: "Graduating interval", type: "number", min: 1, max: 30, step: 1, unit: "days", description: "Interval awarded when a card finishes the learning steps." },
    { key: "easyGraduatingIntervalDays", label: "Easy graduating interval", type: "number", min: 1, max: 60, step: 1, unit: "days", description: "Interval awarded when a new card is answered Easy immediately." },
    { key: "startEaseFactor", label: "Starting easiness", type: "number", min: 1.3, max: 4, step: 0.05, description: "Initial easiness factor (EF) for new cards." },
    { key: "minimumEaseFactor", label: "Easiness floor", type: "number", min: 1.1, max: 2.5, step: 0.05, description: "Easiness can never drop below this value." },
    { key: "easyBonus", label: "Easy bonus", type: "number", min: 1, max: 2, step: 0.05, unit: "x", description: "Extra multiplier applied when answering Easy." },
    { key: "hardMultiplier", label: "Hard multiplier", type: "number", min: 0.5, max: 1.5, step: 0.05, unit: "x", description: "Growth multiplier when answering Hard." },
    { key: "intervalModifier", label: "Interval modifier", type: "number", min: 0.5, max: 2, step: 0.05, unit: "x", description: "Global damping/acceleration of all review intervals." },
    { key: "lapseNewIntervalPercent", label: "New interval on lapse", type: "number", min: 0.1, max: 1, step: 0.05, unit: "%", description: "Fraction of the previous interval kept after a lapse." },
    { key: "maxIntervalDays", label: "Maximum interval", type: "number", min: 30, max: 3650, step: 30, unit: "days", description: "Upper bound on any scheduled interval." },
    { key: "useLearningSteps", label: "Use learning steps", type: "boolean", description: "Disable to send new cards straight to the graduating interval." },
  ],

  isDue(state, now) {
    return new Date(state.dueAt).getTime() <= now.getTime();
  },

  newCardGraduatingIntervalDays(params) {
    return num(params, "graduatingIntervalDays", 1);
  },

  review(ctx: SchedulerReviewContext): SchedulerReviewOutcome {
    const { state, rating, now } = ctx;
    const p = ctx.params;
    const steps = learningSteps(p);
    const useSteps = bool(p, "useLearningSteps", true);
    const startEase = num(p, "startEaseFactor", 2.5);
    const easeFloor = num(p, "minimumEaseFactor", 1.3);
    const easyBonus = num(p, "easyBonus", 1.3);
    const hardMultiplier = num(p, "hardMultiplier", 1.2);
    const intervalModifier = num(p, "intervalModifier", 1);
    const graduating = num(p, "graduatingIntervalDays", 1);
    const easyGraduating = num(p, "easyGraduatingIntervalDays", 4);
    const lapsePercent = num(p, "lapseNewIntervalPercent", 0.5);
    const maxInterval = num(p, "maxIntervalDays", 365);

    const quality = RATING_TO_QUALITY[rating];

    /* ---- Wozniak easiness update (applies on every graded answer) ---- */
    const nextEase = clamp(
      state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
      easeFloor,
      4.0
    );

    const inLearning = state.isLearning && state.repetitions === 0;

    /* ---------------- Learning phase (short cycles, minutes) ---------------- */
    if (useSteps && inLearning) {
      if (!isPassRating(rating)) {
        const due = addMinutes(now, steps[0]);
        return buildOutcome(state, rating, {
          dueAt: due,
          intervalDays: normalizeInterval(steps[0] / 1440),
          easeFactor: nextEase,
          stepIndex: 0,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Learning step reset — relearning in ${steps[0]} min (EF ${nextEase.toFixed(2)}).`,
        });
      }

      if (rating === "hard") {
        const stepMin = steps[Math.min(state.stepIndex, steps.length - 1)] * 1.5;
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, stepMin),
          intervalDays: normalizeInterval(stepMin / 1440),
          easeFactor: nextEase,
          stepIndex: state.stepIndex,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Hard — repeating learning step ${state.stepIndex + 1} in ${Math.round(stepMin)} min.`,
        });
      }

      if (rating === "easy") {
        return buildOutcome(state, rating, {
          dueAt: addDays(now, easyGraduating),
          intervalDays: easyGraduating,
          easeFactor: nextEase,
          stepIndex: 0,
          isLearning: false,
          phase: "review",
          repetitions: 1,
          explanation: `Easy — graduated immediately to ${easyGraduating} day(s) (EF ${nextEase.toFixed(2)}).`,
        });
      }

      const nextStep = state.stepIndex + 1;
      if (nextStep < steps.length) {
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, steps[nextStep]),
          intervalDays: normalizeInterval(steps[nextStep] / 1440),
          easeFactor: nextEase,
          stepIndex: nextStep,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Good — advanced to learning step ${nextStep + 1}/${steps.length} (${steps[nextStep]} min).`,
        });
      }

      return buildOutcome(state, rating, {
        dueAt: addDays(now, graduating),
        intervalDays: graduating,
        easeFactor: nextEase,
        stepIndex: 0,
        isLearning: false,
        phase: "review",
        repetitions: 1,
        explanation: `Graduated from learning steps to ${graduating} day(s) (EF ${nextEase.toFixed(2)}).`,
      });
    }

    /* ---------------- Review phase (day-scale cycles) ---------------- */
    if (!isPassRating(rating)) {
      const lapsedInterval = Math.max(1, state.intervalDays * lapsePercent);
      const relearnMin = steps[0];
      return buildOutcome(state, rating, {
        dueAt: addMinutes(now, relearnMin),
        intervalDays: normalizeInterval(lapsedInterval),
        easeFactor: nextEase,
        repetitions: 0,
        stepIndex: 0,
        isLearning: useSteps,
        phase: useSteps ? "relearning" : "review",
        lapses: state.lapses + 1,
        explanation: `Lapse #${state.lapses + 1} — interval collapsed ${Math.round(state.intervalDays)}d → ${Math.round(lapsedInterval)}d, EF ${nextEase.toFixed(2)}.`,
      });
    }

    const previousInterval = state.intervalDays > 0 ? state.intervalDays : graduating;
    let nextInterval: number;
    const repetition = state.repetitions + 1;

    if (repetition === 1) {
      nextInterval = graduating;
    } else if (repetition === 2) {
      nextInterval = rating === "easy" ? easyGraduating : Math.max(2, Math.round(graduating * 2));
    } else {
      const growth = rating === "easy" ? easyBonus : rating === "hard" ? hardMultiplier : nextEase;
      nextInterval = previousInterval * growth * intervalModifier;
    }

    nextInterval = Math.min(maxInterval, Math.max(1, nextInterval));

    return buildOutcome(state, rating, {
      dueAt: addDays(now, nextInterval),
      intervalDays: normalizeInterval(nextInterval),
      easeFactor: nextEase,
      repetitions: repetition,
      isLearning: false,
      phase: "review",
      explanation: `Review #${repetition} — interval ${Math.round(previousInterval)}d → ${normalizeInterval(nextInterval)}d via ${
        rating === "easy" ? `easy bonus ${easyBonus}×` : rating === "hard" ? `hard multiplier ${hardMultiplier}×` : `EF ${nextEase.toFixed(2)}×`
      }.`,
    });
  },
};

export const SM2_SCHEDULER_VERSION = sm2Scheduler.version;
export type { SrsRating };
