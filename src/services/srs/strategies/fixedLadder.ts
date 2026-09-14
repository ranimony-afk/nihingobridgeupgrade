import {
  SrsScheduler,
  SchedulerReviewContext,
  SchedulerReviewOutcome,
} from "@/types/srs";
import {
  addDays,
  addMinutes,
  bool,
  buildOutcome,
  clamp,
  isPassRating,
  learningSteps,
  list,
  normalizeInterval,
  num,
} from "./shared";

/**
 * Fixed Interval Ladder — a fully declarative, zero-surprise scheduler.
 *
 * The operator writes the exact ladder (e.g. 1 → 3 → 7 → 14 → 30 days).
 * Ratings move the card up or down the ladder by a fixed number of rungs.
 * No easiness, no stability, no drift: identical inputs always produce the
 * identical interval, which makes it ideal for curriculum-locked courses
 * and for regression-testing the SRS engine itself.
 *
 * v1.0.1 — added easy-bonus rungs and hard "hold" behaviour.
 */
export const fixedLadderScheduler: SrsScheduler = {
  key: "fixed-ladder",
  name: "Fixed Interval Ladder",
  shortName: "Ladder",
  version: "1.0.1",
  description:
    "Deterministic curriculum scheduling. The operator defines an explicit interval ladder and ratings move the card up or down by a fixed number of rungs. Perfect when a course must control pacing exactly.",
  strengths: [
    "100% deterministic and reproducible",
    "Course authors control pacing exactly",
    "No parameter drift or easiness instability",
    "Excellent for A/B benchmarking other schedulers",
  ],
  defaultParams: {
    ladderDays: [1, 3, 7, 14, 30, 60, 120],
    learningSteps: [1, 10],
    useLearningSteps: true,
    advanceOnGood: 1,
    advanceOnEasy: 2,
    regressOnAgain: 3,
    holdOnHard: true,
    easyGraduatingRung: 2,
  },
  paramFields: [
    { key: "ladderDays", label: "Ladder intervals", type: "array", unit: "days", description: "The exact interval ladder, from first review to mastery." },
    { key: "learningSteps", label: "Learning steps", type: "array", unit: "minutes", description: "Minute-based ladder used before the first rung." },
    { key: "useLearningSteps", label: "Use learning steps", type: "boolean", description: "Disable to send new cards straight to rung 0." },
    { key: "advanceOnGood", label: "Advance on Good", type: "number", min: 1, max: 3, step: 1, unit: "count", description: "Rungs climbed when answering Good." },
    { key: "advanceOnEasy", label: "Advance on Easy", type: "number", min: 1, max: 3, step: 1, unit: "count", description: "Rungs climbed when answering Easy." },
    { key: "regressOnAgain", label: "Regress on Again", type: "number", min: 1, max: 5, step: 1, unit: "count", description: "Rungs dropped when answering Again." },
    { key: "holdOnHard", label: "Hold on Hard", type: "boolean", description: "Keep the same rung when answering Hard instead of advancing one." },
    { key: "easyGraduatingRung", label: "Easy graduating rung", type: "number", min: 0, max: 5, step: 1, description: "Rung granted when a new card is answered Easy immediately." },
  ],

  isDue(state, now) {
    return new Date(state.dueAt).getTime() <= now.getTime();
  },

  newCardGraduatingIntervalDays(params) {
    const ladder = list(params, "ladderDays", [1, 3, 7, 14, 30, 60, 120]);
    return normalizeInterval(ladder[0] ?? 1);
  },

  review(ctx: SchedulerReviewContext): SchedulerReviewOutcome {
    const { state, rating, now } = ctx;
    const p = ctx.params;
    const ladder = list(p, "ladderDays", [1, 3, 7, 14, 30, 60, 120]);
    const steps = learningSteps(p);
    const useSteps = bool(p, "useLearningSteps", true);
    const advanceGood = num(p, "advanceOnGood", 1);
    const advanceEasy = num(p, "advanceOnEasy", 2);
    const regressAgain = num(p, "regressOnAgain", 3);
    const holdOnHard = bool(p, "holdOnHard", true);
    const easyRung = num(p, "easyGraduatingRung", 2);

    const topRung = ladder.length - 1;

    /* -------------------- Learning-step ladder -------------------- */
    if (useSteps && state.isLearning && state.repetitions === 0) {
      if (rating === "again") {
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, steps[0]),
          intervalDays: normalizeInterval(steps[0] / 1440),
          stepIndex: 0,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Learning step reset to step 1/${steps.length} (${steps[0]} min).`,
        });
      }

      if (rating === "hard") {
        const stepMin = steps[Math.min(state.stepIndex, steps.length - 1)] * 1.5;
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, stepMin),
          intervalDays: normalizeInterval(stepMin / 1440),
          stepIndex: state.stepIndex,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Holding learning step ${state.stepIndex + 1}/${steps.length} (${Math.round(stepMin)} min).`,
        });
      }

      if (rating === "easy") {
        const rung = Math.min(easyRung, topRung);
        return buildOutcome(state, rating, {
          dueAt: addDays(now, ladder[rung]),
          intervalDays: normalizeInterval(ladder[rung]),
          stepIndex: rung,
          isLearning: false,
          phase: "review",
          repetitions: 1,
          explanation: `Easy — skipped ahead to ladder rung ${rung + 1} (${normalizeInterval(ladder[rung])}d).`,
        });
      }

      const nextStep = state.stepIndex + 1;
      if (nextStep < steps.length) {
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, steps[nextStep]),
          intervalDays: normalizeInterval(steps[nextStep] / 1440),
          stepIndex: nextStep,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `Learning step ${nextStep + 1}/${steps.length} (${steps[nextStep]} min).`,
        });
      }

      const rung = Math.min(advanceGood - 1, topRung);
      return buildOutcome(state, rating, {
        dueAt: addDays(now, ladder[rung]),
        intervalDays: normalizeInterval(ladder[rung]),
        stepIndex: rung,
        isLearning: false,
        phase: "review",
        repetitions: 1,
        explanation: `Graduated to ladder rung ${rung + 1} (${normalizeInterval(ladder[rung])}d).`,
      });
    }

    /* ------------------------ Ladder review ------------------------ */
    const currentRung = clamp(state.stepIndex, 0, topRung);

    let nextRung: number;
    let rationale: string;

    if (rating === "again") {
      nextRung = clamp(currentRung - regressAgain, 0, topRung);
      rationale = `dropped ${currentRung - nextRung} rung(s)`;
    } else if (rating === "hard") {
      nextRung = holdOnHard ? currentRung : clamp(currentRung, 0, topRung);
      rationale = "rung held (Hard)";
    } else if (rating === "easy") {
      nextRung = clamp(currentRung + advanceEasy, 0, topRung);
      rationale = `climbed ${nextRung - currentRung} rung(s) (Easy)`;
    } else {
      nextRung = clamp(currentRung + advanceGood, 0, topRung);
      rationale = `climbed ${nextRung - currentRung} rung(s)`;
    }

    const intervalDays = normalizeInterval(ladder[nextRung]);
    const mastered = nextRung >= topRung;

    return buildOutcome(state, rating, {
      dueAt: addDays(now, intervalDays),
      intervalDays,
      stepIndex: nextRung,
      isLearning: false,
      phase: "review",
      repetitions: isPassRating(rating) ? state.repetitions + 1 : 0,
      lapses: rating === "again" ? state.lapses + 1 : state.lapses,
      explanation: `Ladder rung ${currentRung + 1} → ${nextRung + 1} (${intervalDays}d) — ${rationale}${
        mastered ? " — top rung reached." : "."
      }`,
    });
  },
};
