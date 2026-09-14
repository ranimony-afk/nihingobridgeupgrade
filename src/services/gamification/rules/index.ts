import {
  XpBreakdownLine,
  XpParams,
  XpRule,
  XpRuleContext,
  XpRuleOutcome,
} from "@/types/gamification";

/* ============================================================
 * SHARED HELPERS
 * ============================================================ */
function num(p: XpParams, key: string, fallback: number): number {
  const v = p[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(p: XpParams, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === "boolean" ? v : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Streak multiplier, saturating so long streaks cannot runaway-inflate XP. */
export function streakMultiplier(streakDays: number, perDay: number, max: number): number {
  if (streakDays <= 1) return 1;
  return clamp(1 + (streakDays - 1) * perDay, 1, max);
}

/**
 * Apply multipliers and the daily cap, producing the final outcome.
 * Centralised so every rule enforces caps identically.
 */
function finalise(
  rule: { dailyCap: number },
  ctx: XpRuleContext,
  basePoints: number,
  multiplier: number,
  breakdown: XpBreakdownLine[]
): XpRuleOutcome {
  const raw = Math.max(0, Math.round(basePoints * multiplier));

  let points = raw;
  let cappedByDaily = false;

  if (rule.dailyCap > 0) {
    const remaining = Math.max(0, rule.dailyCap - ctx.awardedTodayByRule);
    if (raw > remaining) {
      points = remaining;
      cappedByDaily = true;
      breakdown.push({
        label: `Daily cap reached (${rule.dailyCap} XP)`,
        value: points - raw,
        kind: "cap",
      });
    }
  }

  return {
    basePoints,
    multiplier: Math.round(multiplier * 100) / 100,
    points,
    breakdown,
    cappedByDaily,
    skipped: false,
  };
}

function skip(reason: string): XpRuleOutcome {
  return {
    basePoints: 0,
    multiplier: 1,
    points: 0,
    breakdown: [],
    cappedByDaily: false,
    skipped: true,
    skipReason: reason,
  };
}

/* ============================================================
 * RULE 1 — SRS review graded
 * ============================================================ */
export const reviewGradedRule: XpRule = {
  key: "review-graded",
  version: "1.0.0",
  eventType: "review.graded",
  name: "Card Reviewed",
  description:
    "Awards XP each time a card is graded. Correct recalls pay more than lapses, mature cards pay a maturity bonus, and a streak multiplier applies.",
  basePoints: 10,
  dailyCap: 600,
  defaultParams: {
    basePoints: 10,
    againPoints: 3,
    hardMultiplier: 0.8,
    goodMultiplier: 1.0,
    easyMultiplier: 1.1,
    newCardBonus: 5,
    maturityBonusPerInterval: 0.15,
    maturityBonusMax: 8,
    streakBonusPerDay: 0.02,
    streakBonusMax: 1.5,
    payForLapses: true,
  },
  paramFields: [
    { key: "basePoints", label: "Base points", type: "number", min: 0, max: 100, step: 1, description: "XP for a correct review before bonuses." },
    { key: "againPoints", label: "Lapse points", type: "number", min: 0, max: 50, step: 1, description: "Consolation XP for an 'again' — effort still counts." },
    { key: "hardMultiplier", label: "Hard multiplier", type: "number", min: 0, max: 2, step: 0.05, description: "Multiplier when answering Hard." },
    { key: "easyMultiplier", label: "Easy multiplier", type: "number", min: 0, max: 2, step: 0.05, description: "Multiplier when answering Easy." },
    { key: "newCardBonus", label: "New-card bonus", type: "number", min: 0, max: 50, step: 1, description: "Extra XP the first time a card is studied." },
    { key: "maturityBonusPerInterval", label: "Maturity bonus / day", type: "number", min: 0, max: 2, step: 0.05, description: "Bonus scaling with the card's interval." },
    { key: "maturityBonusMax", label: "Maturity bonus cap", type: "number", min: 0, max: 100, step: 1, description: "Upper bound on the maturity bonus." },
    { key: "streakBonusPerDay", label: "Streak bonus / day", type: "number", min: 0, max: 0.2, step: 0.01, description: "Multiplier added per consecutive study day." },
    { key: "streakBonusMax", label: "Streak multiplier cap", type: "number", min: 1, max: 3, step: 0.1, description: "Maximum streak multiplier." },
    { key: "payForLapses", label: "Pay for lapses", type: "boolean", description: "Award consolation XP when a card is forgotten." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const breakdown: XpBreakdownLine[] = [];

    const isLapse = p.rating === "again" || p.wasCorrect === false;

    if (isLapse && !bool(params, "payForLapses", true)) {
      return skip("Lapses do not earn XP under current settings");
    }

    let base: number;
    if (isLapse) {
      base = num(params, "againPoints", 3);
      breakdown.push({ label: "Lapse — effort credit", value: base, kind: "base" });
    } else {
      base = num(params, "basePoints", 10);
      breakdown.push({ label: "Correct recall", value: base, kind: "base" });
    }

    /* New-card bonus */
    if (p.isNewCard) {
      const bonus = num(params, "newCardBonus", 5);
      base += bonus;
      breakdown.push({ label: "New card learned", value: bonus, kind: "bonus" });
    }

    /* Maturity bonus — remembering a long-interval card is worth more */
    if (!isLapse && (p.intervalDays ?? 0) > 1) {
      const bonus = Math.min(
        num(params, "maturityBonusMax", 8),
        Math.round((p.intervalDays ?? 0) * num(params, "maturityBonusPerInterval", 0.15))
      );
      if (bonus > 0) {
        base += bonus;
        breakdown.push({
          label: `Mature card (${Math.round(p.intervalDays ?? 0)}d interval)`,
          value: bonus,
          kind: "bonus",
        });
      }
    }

    /* Rating multiplier */
    let multiplier = 1;
    if (!isLapse) {
      if (p.rating === "hard") multiplier = num(params, "hardMultiplier", 0.8);
      else if (p.rating === "easy") multiplier = num(params, "easyMultiplier", 1.1);
      else multiplier = num(params, "goodMultiplier", 1.0);

      if (multiplier !== 1) {
        breakdown.push({ label: `Rated "${p.rating}"`, value: multiplier, kind: "multiplier" });
      }
    }

    /* Streak multiplier */
    const streakMult = streakMultiplier(
      ctx.currentStreakDays,
      num(params, "streakBonusPerDay", 0.02),
      num(params, "streakBonusMax", 1.5)
    );
    if (streakMult > 1) {
      multiplier *= streakMult;
      breakdown.push({
        label: `${ctx.currentStreakDays}-day streak`,
        value: Math.round(streakMult * 100) / 100,
        kind: "multiplier",
      });
    }

    return finalise(this, ctx, base, multiplier, breakdown);
  },
};

/* ============================================================
 * RULE 2 — Review session completed
 * ============================================================ */
export const sessionCompletedRule: XpRule = {
  key: "session-completed",
  version: "1.0.0",
  eventType: "review.session_completed",
  name: "Session Finished",
  description:
    "A completion bonus for finishing a planned review session, scaled by how many cards were answered and how accurate the session was.",
  basePoints: 25,
  dailyCap: 250,
  defaultParams: {
    basePoints: 25,
    perCardBonus: 1,
    perCardBonusMax: 40,
    accuracyThreshold: 0.85,
    accuracyBonus: 20,
    perfectBonus: 30,
    minCardsToQualify: 3,
  },
  paramFields: [
    { key: "basePoints", label: "Completion bonus", type: "number", min: 0, max: 200, step: 5, description: "Flat XP for finishing a session." },
    { key: "perCardBonus", label: "Per-card bonus", type: "number", min: 0, max: 10, step: 0.5, description: "Extra XP per card answered." },
    { key: "perCardBonusMax", label: "Per-card bonus cap", type: "number", min: 0, max: 200, step: 5, description: "Cap on the per-card component." },
    { key: "accuracyThreshold", label: "High-accuracy threshold", type: "number", min: 0.5, max: 1, step: 0.05, description: "Accuracy needed for the precision bonus." },
    { key: "accuracyBonus", label: "High-accuracy bonus", type: "number", min: 0, max: 100, step: 5, description: "XP for beating the accuracy threshold." },
    { key: "perfectBonus", label: "Flawless bonus", type: "number", min: 0, max: 200, step: 5, description: "XP for a 100% session." },
    { key: "minCardsToQualify", label: "Minimum cards", type: "number", min: 1, max: 20, step: 1, description: "Sessions shorter than this earn no completion bonus." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const answered = p.cardsAnswered ?? 0;
    const minCards = num(params, "minCardsToQualify", 3);

    if (answered < minCards) {
      return skip(`Session too short (${answered} < ${minCards} cards)`);
    }

    const breakdown: XpBreakdownLine[] = [];
    let base = num(params, "basePoints", 25);
    breakdown.push({ label: "Session completed", value: base, kind: "base" });

    const perCard = Math.min(
      num(params, "perCardBonusMax", 40),
      Math.round(answered * num(params, "perCardBonus", 1))
    );
    if (perCard > 0) {
      base += perCard;
      breakdown.push({ label: `${answered} cards answered`, value: perCard, kind: "bonus" });
    }

    const accuracy = (p.accuracy ?? 0) / 100;
    if (accuracy >= 1) {
      const bonus = num(params, "perfectBonus", 30);
      base += bonus;
      breakdown.push({ label: "Flawless session (100%)", value: bonus, kind: "bonus" });
    } else if (accuracy >= num(params, "accuracyThreshold", 0.85)) {
      const bonus = num(params, "accuracyBonus", 20);
      base += bonus;
      breakdown.push({
        label: `High accuracy (${Math.round(accuracy * 100)}%)`,
        value: bonus,
        kind: "bonus",
      });
    }

    return finalise(this, ctx, base, 1, breakdown);
  },
};

/* ============================================================
 * RULE 3 — JLPT question answered
 * ============================================================ */
export const quizAnsweredRule: XpRule = {
  key: "quiz-answered",
  version: "1.0.0",
  eventType: "quiz.answered",
  name: "Question Answered",
  description:
    "XP for each correctly answered JLPT question, scaled by the question's difficulty and JLPT level.",
  basePoints: 8,
  dailyCap: 400,
  defaultParams: {
    basePoints: 8,
    incorrectPoints: 2,
    difficultyBonusPerPoint: 2,
    n5Multiplier: 1.0,
    n4Multiplier: 1.15,
    n3Multiplier: 1.3,
    n2Multiplier: 1.5,
    n1Multiplier: 1.75,
  },
  paramFields: [
    { key: "basePoints", label: "Base points", type: "number", min: 0, max: 100, step: 1, description: "XP for a correct answer." },
    { key: "incorrectPoints", label: "Incorrect points", type: "number", min: 0, max: 50, step: 1, description: "Consolation XP for attempting." },
    { key: "difficultyBonusPerPoint", label: "Difficulty bonus", type: "number", min: 0, max: 20, step: 1, description: "Extra XP per difficulty point (1-5)." },
    { key: "n5Multiplier", label: "N5 multiplier", type: "number", min: 0.5, max: 3, step: 0.05, description: "Level weighting for N5." },
    { key: "n1Multiplier", label: "N1 multiplier", type: "number", min: 0.5, max: 3, step: 0.05, description: "Level weighting for N1." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const breakdown: XpBreakdownLine[] = [];

    const correct = p.wasCorrect !== false;
    let base = correct ? num(params, "basePoints", 8) : num(params, "incorrectPoints", 2);
    breakdown.push({
      label: correct ? "Correct answer" : "Attempted",
      value: base,
      kind: "base",
    });

    if (correct && (p.questionDifficulty ?? 0) > 1) {
      const bonus = Math.round(
        ((p.questionDifficulty ?? 1) - 1) * num(params, "difficultyBonusPerPoint", 2)
      );
      if (bonus > 0) {
        base += bonus;
        breakdown.push({
          label: `Difficulty ${p.questionDifficulty}/5`,
          value: bonus,
          kind: "bonus",
        });
      }
    }

    const levelKey = `${(p.jlptLevel ?? "N5").toLowerCase()}Multiplier`;
    const multiplier = num(params, levelKey, 1);
    if (multiplier !== 1) {
      breakdown.push({ label: `${p.jlptLevel} level`, value: multiplier, kind: "multiplier" });
    }

    return finalise(this, ctx, base, multiplier, breakdown);
  },
};

/* ============================================================
 * RULE 4 — JLPT mock test completed
 * ============================================================ */
export const testCompletedRule: XpRule = {
  key: "test-completed",
  version: "1.0.0",
  eventType: "quiz.test_completed",
  name: "Mock Exam Completed",
  description:
    "A substantial bonus for finishing a full JLPT mock exam, scaled by score, with an extra award for passing.",
  basePoints: 100,
  dailyCap: 0,
  defaultParams: {
    basePoints: 100,
    scoreBonusMax: 150,
    passBonus: 200,
    perQuestionBonus: 2,
  },
  paramFields: [
    { key: "basePoints", label: "Completion bonus", type: "number", min: 0, max: 500, step: 10, description: "Flat XP for submitting a mock exam." },
    { key: "scoreBonusMax", label: "Score bonus cap", type: "number", min: 0, max: 500, step: 10, description: "Maximum XP from the score component." },
    { key: "passBonus", label: "Pass bonus", type: "number", min: 0, max: 1000, step: 25, description: "XP awarded for meeting the passing threshold." },
    { key: "perQuestionBonus", label: "Per-question bonus", type: "number", min: 0, max: 20, step: 1, description: "Extra XP per question in the exam." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const breakdown: XpBreakdownLine[] = [];

    let base = num(params, "basePoints", 100);
    breakdown.push({ label: "Mock exam completed", value: base, kind: "base" });

    const pct = clamp((p.scorePercent ?? 0) / 100, 0, 1);
    const scoreBonus = Math.round(pct * num(params, "scoreBonusMax", 150));
    if (scoreBonus > 0) {
      base += scoreBonus;
      breakdown.push({
        label: `Score ${Math.round(pct * 100)}%`,
        value: scoreBonus,
        kind: "bonus",
      });
    }

    const qBonus = Math.round((p.totalQuestions ?? 0) * num(params, "perQuestionBonus", 2));
    if (qBonus > 0) {
      base += qBonus;
      breakdown.push({
        label: `${p.totalQuestions} questions`,
        value: qBonus,
        kind: "bonus",
      });
    }

    if (p.passed) {
      const bonus = num(params, "passBonus", 200);
      base += bonus;
      breakdown.push({ label: `${p.jlptLevel} PASSED 合格`, value: bonus, kind: "bonus" });
    }

    return finalise(this, ctx, base, 1, breakdown);
  },
};

/* ============================================================
 * RULE 5 — Knowledge added to SRS
 * ============================================================ */
export const knowledgeAddedRule: XpRule = {
  key: "knowledge-added",
  version: "1.0.0",
  eventType: "knowledge.card_added",
  name: "Knowledge Captured",
  description:
    "A small award for turning kana-chart or kanji-mind-tree entries into reviewable SRS cards — rewards building your own study material.",
  basePoints: 5,
  dailyCap: 100,
  defaultParams: {
    basePoints: 5,
    perCardBonus: 2,
    kanjiMultiplier: 1.5,
  },
  paramFields: [
    { key: "basePoints", label: "Base points", type: "number", min: 0, max: 50, step: 1, description: "XP for a capture action." },
    { key: "perCardBonus", label: "Per-card bonus", type: "number", min: 0, max: 20, step: 1, description: "Extra XP per card created in a bulk add." },
    { key: "kanjiMultiplier", label: "Kanji multiplier", type: "number", min: 0.5, max: 3, step: 0.1, description: "Kanji entries are worth more than kana." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const created = p.cardsCreated ?? 1;

    if (created <= 0) return skip("No new cards were created");

    const breakdown: XpBreakdownLine[] = [];
    let base = num(params, "basePoints", 5);
    breakdown.push({ label: "Knowledge captured", value: base, kind: "base" });

    const perCard = Math.round(created * num(params, "perCardBonus", 2));
    if (perCard > 0) {
      base += perCard;
      breakdown.push({ label: `${created} card(s) created`, value: perCard, kind: "bonus" });
    }

    let multiplier = 1;
    if (p.knowledgeKind === "kanji") {
      multiplier = num(params, "kanjiMultiplier", 1.5);
      breakdown.push({ label: "Kanji entry", value: multiplier, kind: "multiplier" });
    }

    return finalise(this, ctx, base, multiplier, breakdown);
  },
};

/* ============================================================
 * RULE 6 — Daily streak maintained
 * ============================================================ */
export const streakDayRule: XpRule = {
  key: "streak-day",
  version: "1.0.0",
  eventType: "streak.day_completed",
  name: "Daily Streak",
  description:
    "Awarded once per day when the learner studies, scaling with streak length and paying milestone bonuses at 7, 30 and 100 days.",
  basePoints: 20,
  dailyCap: 0,
  defaultParams: {
    basePoints: 20,
    perDayBonus: 2,
    perDayBonusMax: 60,
    milestone7: 50,
    milestone30: 200,
    milestone100: 750,
  },
  paramFields: [
    { key: "basePoints", label: "Base points", type: "number", min: 0, max: 200, step: 5, description: "Flat daily XP for studying at all." },
    { key: "perDayBonus", label: "Per-day bonus", type: "number", min: 0, max: 20, step: 1, description: "Extra XP per consecutive day." },
    { key: "perDayBonusMax", label: "Per-day bonus cap", type: "number", min: 0, max: 500, step: 10, description: "Cap on the streak-length component." },
    { key: "milestone7", label: "7-day milestone", type: "number", min: 0, max: 500, step: 10, description: "One-off bonus at a 7-day streak." },
    { key: "milestone30", label: "30-day milestone", type: "number", min: 0, max: 2000, step: 25, description: "One-off bonus at a 30-day streak." },
    { key: "milestone100", label: "100-day milestone", type: "number", min: 0, max: 5000, step: 50, description: "One-off bonus at a 100-day streak." },
  ],

  score(ctx: XpRuleContext): XpRuleOutcome {
    const { payload: p, params } = ctx;
    const streak = Math.max(1, p.streakDays ?? ctx.currentStreakDays ?? 1);
    const breakdown: XpBreakdownLine[] = [];

    let base = num(params, "basePoints", 20);
    breakdown.push({ label: "Studied today", value: base, kind: "base" });

    const streakBonus = Math.min(
      num(params, "perDayBonusMax", 60),
      Math.round((streak - 1) * num(params, "perDayBonus", 2))
    );
    if (streakBonus > 0) {
      base += streakBonus;
      breakdown.push({ label: `${streak}-day streak`, value: streakBonus, kind: "bonus" });
    }

    for (const [days, key] of [
      [100, "milestone100"],
      [30, "milestone30"],
      [7, "milestone7"],
    ] as const) {
      if (streak === days) {
        const bonus = num(params, key, 0);
        if (bonus > 0) {
          base += bonus;
          breakdown.push({ label: `${days}-day milestone!`, value: bonus, kind: "bonus" });
        }
        break;
      }
    }

    return finalise(this, ctx, base, 1, breakdown);
  },
};

/** Every rule the platform knows about. */
export const XP_RULES: XpRule[] = [
  reviewGradedRule,
  sessionCompletedRule,
  quizAnsweredRule,
  testCompletedRule,
  knowledgeAddedRule,
  streakDayRule,
];
