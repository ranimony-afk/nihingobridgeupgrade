/* ============================================================
 * PHASE 12 — Prompt 12.1: Event-Based XP
 *
 * Contracts for the XP engine. Rules are pure functions over an
 * event payload; nothing here touches the database.
 * ============================================================ */

/** Domain events the platform can emit for scoring. */
export type XpEventType =
  | "review.graded"
  | "review.session_completed"
  | "quiz.answered"
  | "quiz.test_completed"
  | "knowledge.card_added"
  | "streak.day_completed"
  | "content.read";

export const XP_EVENT_TYPES: XpEventType[] = [
  "review.graded",
  "review.session_completed",
  "quiz.answered",
  "quiz.test_completed",
  "knowledge.card_added",
  "streak.day_completed",
  "content.read",
];

export type XpParams = Record<string, number | boolean>;

export interface XpParamField {
  key: string;
  label: string;
  type: "number" | "boolean";
  description: string;
  min?: number;
  max?: number;
  step?: number;
}

/** One line of the scoring explanation, shown in the ledger UI. */
export interface XpBreakdownLine {
  label: string;
  value: number;
  kind: "base" | "bonus" | "multiplier" | "cap";
}

/** Normalised payload every rule receives. */
export interface XpEventPayload {
  eventType: XpEventType;
  userId: string;
  /** Stable id of the originating entity — drives the dedupe key. */
  sourceId?: string;
  sourceType?: string;
  occurredAt?: string;

  /* ---- review.graded ---- */
  rating?: "again" | "hard" | "good" | "easy";
  wasCorrect?: boolean;
  intervalDays?: number;
  isNewCard?: boolean;
  isLapse?: boolean;
  cardType?: string;
  schedulerKey?: string;

  /* ---- review.session_completed ---- */
  cardsAnswered?: number;
  accuracy?: number;
  durationSeconds?: number;

  /* ---- quiz.* ---- */
  jlptLevel?: string;
  questionDifficulty?: number;
  scorePercent?: number;
  passed?: boolean;
  totalQuestions?: number;

  /* ---- knowledge.card_added ---- */
  knowledgeKind?: string;
  cardsCreated?: number;

  /* ---- streak.day_completed ---- */
  streakDays?: number;

  /** Free-form extras preserved on the ledger row. */
  detail?: Record<string, unknown>;
}

/** Context handed to a rule, including derived daily usage. */
export interface XpRuleContext {
  payload: XpEventPayload;
  params: XpParams;
  /** XP already awarded by THIS rule today (for cap enforcement). */
  awardedTodayByRule: number;
  /** Learner's current streak, used by bonus multipliers. */
  currentStreakDays: number;
}

export interface XpRuleOutcome {
  /** Points before multipliers. */
  basePoints: number;
  /** Combined multiplier. */
  multiplier: number;
  /** Final awarded points after multipliers and caps. */
  points: number;
  breakdown: XpBreakdownLine[];
  /** True when the daily cap clipped the award. */
  cappedByDaily: boolean;
  /** Rules may decline to award (e.g. incorrect answer earns nothing). */
  skipped: boolean;
  skipReason?: string;
}

/** The contract every XP rule implements. */
export interface XpRule {
  key: string;
  version: string;
  eventType: XpEventType;
  name: string;
  description: string;
  basePoints: number;
  /** 0 = uncapped. */
  dailyCap: number;
  defaultParams: XpParams;
  paramFields: XpParamField[];
  /** Pure function: (payload, params) -> outcome. */
  score(ctx: XpRuleContext): XpRuleOutcome;
}

export interface XpRuleDescriptor {
  key: string;
  version: string;
  eventType: XpEventType;
  name: string;
  description: string;
  basePoints: number;
  dailyCap: number;
  defaultParams: XpParams;
  paramFields: XpParamField[];
  /** Worked examples so the UI can show what the rule pays. */
  examples: Array<{ label: string; points: number }>;
}

/* ============================================================
 * LEVELS — derived from cumulative XP, never stored
 * ============================================================ */
export interface LevelInfo {
  level: number;
  title: string;
  japanese: string;
  /** Cumulative XP needed to reach this level. */
  xpAtLevelStart: number;
  /** Cumulative XP needed for the next level (null at max). */
  xpAtNextLevel: number | null;
  xpIntoLevel: number;
  xpForThisLevel: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export interface XpLedgerEntry {
  id: string;
  eventType: string;
  ruleKey: string;
  ruleVersion: string;
  points: number;
  basePoints: number;
  multiplier: number;
  sourceType: string;
  sourceId: string | null;
  breakdown: XpBreakdownLine[];
  revokedAt: string | null;
  revokedReason: string | null;
  occurredAt: string;
}

export interface XpDailyPoint {
  date: string;
  weekday: string;
  points: number;
  events: number;
}

export interface XpSourceBreakdown {
  eventType: string;
  ruleKey: string;
  points: number;
  events: number;
  percentOfTotal: number;
}

export interface XpSummary {
  userId: string;
  totalXp: number;
  level: LevelInfo;
  todayXp: number;
  weekXp: number;
  totalEvents: number;
  revokedEvents: number;
  currentStreakDays: number;
  bySource: XpSourceBreakdown[];
  daily: XpDailyPoint[];
  recent: XpLedgerEntry[];
  /** Per-rule daily cap usage so the UI can warn before grinding stops paying. */
  capUsage: Array<{
    ruleKey: string;
    name: string;
    dailyCap: number;
    usedToday: number;
    remaining: number;
    isCapped: boolean;
  }>;
}

export interface XpAwardResult {
  awarded: boolean;
  duplicate: boolean;
  skipped: boolean;
  skipReason?: string;
  eventId?: string;
  points: number;
  ruleKey?: string;
  ruleVersion?: string;
  breakdown: XpBreakdownLine[];
  cappedByDaily: boolean;
  /** Set when this award pushed the learner across a level boundary. */
  levelUp?: { from: number; to: number; title: string } | null;
  totalXp: number;
}
