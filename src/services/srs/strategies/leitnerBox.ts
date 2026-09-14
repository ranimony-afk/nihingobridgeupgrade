import {
  SrsScheduler,
  SchedulerReviewContext,
  SchedulerReviewOutcome,
  RATING_TO_QUALITY,
} from "@/types/srs";
import {
  addDays,
  buildOutcome,
  clamp,
  describeInterval,
  isPassRating,
  list,
  normalizeInterval,
  num,
} from "./shared";

/**
 * Leitner Box System (Sebastian Leitner, 1972).
 *
 * Cards live in numbered boxes. Correct answers promote a card toward a
 * slower box; incorrect answers demote it back to a fast box. Intervals are
 * declared per box rather than computed, which makes the schedule completely
 * transparent and learner-controllable.
 *
 * v1.1.0 — configurable promotion/demotion counts + demotion target box.
 */
export const leitnerScheduler: SrsScheduler = {
  key: "leitner-box",
  name: "Leitner Box System",
  shortName: "Leitner",
  version: "1.1.0",
  description:
    "Box-based scheduling. Each box owns a fixed interval; correct answers promote the card to a slower box and mistakes demote it to a fast box. The most transparent and easiest algorithm to explain to learners.",
  strengths: [
    "Perfectly predictable — intervals are declared, not derived",
    "Ideal for beginners and classroom use",
    "Trivial to visualise and reason about",
    "Zero easiness drift or parameter instability",
  ],
  defaultParams: {
    boxIntervalsDays: [0.007, 1, 3, 7, 16, 35],
    promoteOnGood: 1,
    promoteOnEasy: 2,
    demoteOnHard: 0,
    demoteOnAgain: 3,
    minimumBox: 1,
    maximumBox: 5,
  },
  paramFields: [
    { key: "boxIntervalsDays", label: "Box intervals", type: "array", unit: "days", description: "Interval for each box index (index 0 is the entry/learning box)." },
    { key: "promoteOnGood", label: "Promote on Good", type: "number", min: 1, max: 3, step: 1, unit: "count", description: "Boxes gained when answering Good." },
    { key: "promoteOnEasy", label: "Promote on Easy", type: "number", min: 1, max: 3, step: 1, unit: "count", description: "Boxes gained when answering Easy." },
    { key: "demoteOnHard", label: "Demote on Hard", type: "number", min: 0, max: 2, step: 1, unit: "count", description: "Boxes lost when answering Hard." },
    { key: "demoteOnAgain", label: "Demote on Again", type: "number", min: 1, max: 5, step: 1, unit: "count", description: "Boxes lost when answering Again." },
    { key: "minimumBox", label: "Minimum box", type: "number", min: 0, max: 3, step: 1, description: "Lowest box a card can be demoted to." },
    { key: "maximumBox", label: "Maximum box", type: "number", min: 1, max: 10, step: 1, description: "Highest reachable box (graduation point)." },
  ],

  isDue(state, now) {
    return new Date(state.dueAt).getTime() <= now.getTime();
  },

  newCardGraduatingIntervalDays(params) {
    const boxes = list(params, "boxIntervalsDays", [0.007, 1, 3, 7, 16, 35]);
    const maxBox = num(params, "maximumBox", 5);
    return normalizeInterval(boxes[Math.min(maxBox - 1, boxes.length - 1)] ?? 1);
  },

  review(ctx: SchedulerReviewContext): SchedulerReviewOutcome {
    const { state, rating, now } = ctx;
    const p = ctx.params;
    const boxes = list(p, "boxIntervalsDays", [0.007, 1, 3, 7, 16, 35]);
    const promoteGood = num(p, "promoteOnGood", 1);
    const promoteEasy = num(p, "promoteOnEasy", 2);
    const demoteHard = num(p, "demoteOnHard", 0);
    const demoteAgain = num(p, "demoteOnAgain", 3);
    const minBox = num(p, "minimumBox", 1);
    const maxBox = num(p, "maximumBox", 5);

    const highestIndex = Math.min(maxBox, boxes.length - 1);

    let delta = 0;
    if (rating === "good") delta = promoteGood;
    else if (rating === "easy") delta = promoteEasy;
    else if (rating === "hard") delta = -demoteHard;
    else delta = -demoteAgain;

    const previousBox = state.box;
    let nextBox = clamp(previousBox + delta, Math.min(minBox, highestIndex), highestIndex);

    // Graduation: leaving the top box converts the card to review phase.
    const graduated = nextBox >= highestIndex && previousBox < highestIndex;
    const isLearningBox = nextBox <= 0;

    const intervalDaysRaw = boxes[nextBox] ?? boxes[boxes.length - 1];
    const intervalDays = normalizeInterval(intervalDaysRaw);

    const boxMs = Math.max(1, intervalDaysRaw * 1440);
    const dueAt = new Date(now.getTime() + boxMs * 60_000);

    const quality = RATING_TO_QUALITY[rating];

    return buildOutcome(state, rating, {
      dueAt,
      intervalDays,
      box: nextBox,
      stepIndex: nextBox,
      isLearning: isLearningBox,
      phase: isLearningBox ? "learning" : "review",
      repetitions: isPassRating(rating) ? state.repetitions + 1 : 0,
      lapses: rating === "again" ? state.lapses + 1 : state.lapses,
      explanation: `Box ${previousBox} → ${nextBox} (${describeInterval(intervalDays)}) after "${rating}" (quality ${quality})${
        graduated ? " — reached the top box." : "."
      }`,
    });
  },
};
