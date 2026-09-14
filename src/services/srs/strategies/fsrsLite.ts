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
  intervalForRetention,
  isPassRating,
  learningSteps,
  normalizeInterval,
  num,
  retrievability,
} from "./shared";

/**
 * FSRS-Lite — a reduced, fully deterministic re-implementation of the
 * Free Spaced Repetition Scheduler (FSRS) three-component memory model:
 *
 *   D (Difficulty)  1–10  how hard the item is for this learner
 *   S (Stability)   days  time for retrievability to fall to 90%
 *   R (Retrievability) 0–1  probability of successful recall right now
 *
 * Forgetting curve:  R(t, S) = (1 + FACTOR * t / S) ^ DECAY
 * Interval at target retention:  t = (S / FACTOR) * (R_target^(1/DECAY) - 1)
 *
 * v1.3.0 — post-lapse stability scaling and difficulty mean-reversion.
 */
export const fsrsLiteScheduler: SrsScheduler = {
  key: "fsrs-lite",
  name: "FSRS-Lite (3-Component Memory Model)",
  shortName: "FSRS-Lite",
  version: "1.3.0",
  description:
    "Modern three-component memory model. Instead of a single easiness number it tracks per-item Difficulty and Stability, then picks the interval that lands exactly on your requested retention probability. More accurate than SM-2, especially for uneven learners.",
  strengths: [
    "Intervals target an explicit retention probability",
    "Difficulty and stability evolve independently",
    "Recognises when a card was reviewed early vs. late",
    "Best for long-term retention with fewer total reviews",
  ],
  defaultParams: {
    requestRetention: 0.9,
    defaultDifficulty: 5.0,
    defaultStabilityDays: 1.0,
    difficultyGainPerRating: 0.6,
    difficultyMeanReversion: 0.2,
    postLapseStabilityFactor: 0.35,
    stabilityGrowthScale: 2.0,
    hardStabilityFactor: 1.2,
    easyStabilityBonus: 1.3,
    maxIntervalDays: 3650,
    learningSteps: [1, 10],
    useLearningSteps: true,
  },
  paramFields: [
    { key: "requestRetention", label: "Target retention", type: "number", min: 0.7, max: 0.97, step: 0.01, unit: "%", description: "Desired recall probability. Lower = fewer reviews, more forgetting." },
    { key: "defaultDifficulty", label: "Initial difficulty", type: "number", min: 1, max: 10, step: 0.1, description: "Starting D value for unseen cards." },
    { key: "defaultStabilityDays", label: "Initial stability", type: "number", min: 0.1, max: 30, step: 0.1, unit: "days", description: "Starting memory stability for unseen cards." },
    { key: "difficultyGainPerRating", label: "Difficulty step", type: "number", min: 0.1, max: 2, step: 0.1, description: "How strongly each rating moves the D value." },
    { key: "difficultyMeanReversion", label: "Difficulty mean reversion", type: "number", min: 0, max: 1, step: 0.05, description: "Pull of the D value back toward the initial difficulty." },
    { key: "postLapseStabilityFactor", label: "Post-lapse stability", type: "number", min: 0.05, max: 1, step: 0.05, description: "Fraction of stability retained after a lapse." },
    { key: "stabilityGrowthScale", label: "Stability growth scale", type: "number", min: 0.5, max: 6, step: 0.1, unit: "x", description: "Multiplier cap on per-review stability growth." },
    { key: "hardStabilityFactor", label: "Hard factor", type: "number", min: 1, max: 2, step: 0.05, unit: "x", description: "Stability growth multiplier when answering Hard." },
    { key: "easyStabilityBonus", label: "Easy bonus", type: "number", min: 1, max: 3, step: 0.05, unit: "x", description: "Stability growth multiplier when answering Easy." },
    { key: "maxIntervalDays", label: "Maximum interval", type: "number", min: 30, max: 36500, step: 30, unit: "days", description: "Upper bound on any scheduled interval." },
    { key: "learningSteps", label: "Learning steps", type: "array", unit: "minutes", description: "Minute-based ladder before the first real review." },
    { key: "useLearningSteps", label: "Use learning steps", type: "boolean", description: "Disable to schedule the first review immediately." },
  ],

  isDue(state, now) {
    return new Date(state.dueAt).getTime() <= now.getTime();
  },

  newCardGraduatingIntervalDays(params) {
    const retention = num(params, "requestRetention", 0.9);
    const stability = num(params, "defaultStabilityDays", 1);
    return normalizeInterval(intervalForRetention(stability * 3, retention));
  },

  review(ctx: SchedulerReviewContext): SchedulerReviewOutcome {
    const { state, rating, now, historyCount } = ctx;
    const p = ctx.params;
    const retention = clamp(num(p, "requestRetention", 0.9), 0.7, 0.97);
    const initDifficulty = num(p, "defaultDifficulty", 5);
    const initStability = num(p, "defaultStabilityDays", 1);
    const dStep = num(p, "difficultyGainPerRating", 0.6);
    const dReversion = num(p, "difficultyMeanReversion", 0.2);
    const postLapse = num(p, "postLapseStabilityFactor", 0.35);
    const growthScale = num(p, "stabilityGrowthScale", 2);
    const hardFactor = num(p, "hardStabilityFactor", 1.2);
    const easyBonus = num(p, "easyStabilityBonus", 1.3);
    const maxInterval = num(p, "maxIntervalDays", 3650);
    const steps = learningSteps(p);
    const useSteps = bool(p, "useLearningSteps", true);

    /* ---------- Difficulty update: rating-driven with mean reversion ---------- */
    const ratingValue = rating === "again" ? 0 : rating === "hard" ? 2 : rating === "easy" ? 5 : 4;
    const rawD = state.difficulty - dStep * (ratingValue - 3);
    const meanPulled = initDifficulty + (rawD - initDifficulty) * (1 - dReversion);
    const nextDifficulty = clamp(meanPulled, 1, 10);

    /* ------------------ First contact: initialise S & D ------------------ */
    if (state.stabilityDays <= 0 || state.repetitions === 0) {
      if (useSteps && isPassRating(rating) && state.stepIndex + 1 < steps.length) {
        const nextStep = state.stepIndex + 1;
        return buildOutcome(state, rating, {
          dueAt: addMinutes(now, steps[nextStep]),
          intervalDays: normalizeInterval(steps[nextStep] / 1440),
          stabilityDays: initStability,
          difficulty: nextDifficulty,
          easeFactor: 2.5,
          stepIndex: nextStep,
          isLearning: true,
          phase: "learning",
          repetitions: 0,
          explanation: `FSRS initialising (D ${nextDifficulty.toFixed(1)}, S ${initStability.toFixed(2)}d) — learning step ${nextStep + 1}/${steps.length}.`,
        });
      }

      const ratingMultiplier = rating === "again" ? 0.5 : rating === "hard" ? 0.75 : rating === "easy" ? 1.6 : 1;
      const stability = Math.max(0.05, initStability * ratingMultiplier);
      const interval = Math.min(maxInterval, intervalForRetention(stability, retention));

      return buildOutcome(state, rating, {
        dueAt: rating === "again" && useSteps
          ? addMinutes(now, steps[0])
          : addDays(now, interval),
        intervalDays: normalizeInterval(rating === "again" && useSteps ? steps[0] / 1440 : interval),
        stabilityDays: stability,
        difficulty: nextDifficulty,
        easeFactor: 2.5,
        stepIndex: 0,
        isLearning: rating === "again" && useSteps,
        phase: rating === "again" && useSteps ? "relearning" : "review",
        repetitions: 1,
        lapses: rating === "again" ? 1 : 0,
        explanation: `First review at retention ${Math.round(retention * 100)}% → D ${nextDifficulty.toFixed(1)}, S ${stability.toFixed(2)}d, interval ${normalizeInterval(interval)}d.`,
      });
    }

    /* -------- Compute retrievability at the moment of this review -------- */
    const lastReviewed = state.lastReviewedAt ? new Date(state.lastReviewedAt) : new Date(now.getTime() - state.intervalDays * 86_400_000);
    const elapsedDays = Math.max(0, (now.getTime() - lastReviewed.getTime()) / 86_400_000);
    const r = retrievability(elapsedDays, state.stabilityDays);

    if (!isPassRating(rating)) {
      const newStability = Math.max(0.05, state.stabilityDays * postLapse);
      const interval = Math.min(maxInterval, intervalForRetention(newStability, retention));
      const relearn = useSteps ? steps[0] / 1440 : interval;

      return buildOutcome(state, rating, {
        dueAt: useSteps ? addMinutes(now, steps[0]) : addDays(now, interval),
        intervalDays: normalizeInterval(relearn),
        stabilityDays: newStability,
        difficulty: nextDifficulty,
        stepIndex: 0,
        isLearning: useSteps,
        phase: useSteps ? "relearning" : "review",
        lapses: state.lapses + 1,
        repetitions: 0,
        explanation: `Forget event — R was ${(r * 100).toFixed(0)}% (elapsed ${elapsedDays.toFixed(1)}d). S ${state.stabilityDays.toFixed(2)}d → ${newStability.toFixed(2)}d, D ${nextDifficulty.toFixed(1)}.`,
      });
    }

    /* -------- Successful recall: stability grows with D and current R -------- */
    const baseGrowth =
      1 + growthScale * (1 + (11 - nextDifficulty) / 10) * Math.pow(r, 0.5);
    const ratingFactor = rating === "easy" ? easyBonus : rating === "hard" ? hardFactor : 1;
    const newStability = state.stabilityDays * Math.min(baseGrowth, 12) * ratingFactor;
    const interval = Math.min(maxInterval, intervalForRetention(newStability, retention));

    return buildOutcome(state, rating, {
      dueAt: addDays(now, interval),
      intervalDays: normalizeInterval(interval),
      stabilityDays: newStability,
      difficulty: nextDifficulty,
      isLearning: false,
      phase: "review",
      repetitions: state.repetitions + 1,
      explanation: `Recall #${historyCount + 1} — R ${(r * 100).toFixed(0)}% → growth ${baseGrowth.toFixed(2)}×${ratingFactor !== 1 ? ` × ${ratingFactor} ${rating}` : ""}: S ${state.stabilityDays.toFixed(2)}d → ${newStability.toFixed(2)}d, D ${nextDifficulty.toFixed(1)}, interval ${normalizeInterval(interval)}d for ${(retention * 100).toFixed(0)}% retention.`,
    });
  },
};
