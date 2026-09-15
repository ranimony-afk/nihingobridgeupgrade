import {
  LevelInfo,
  XpEventType,
  XpParams,
  XpRule,
  XpRuleDescriptor,
} from "@/types/gamification";
import { XP_RULES } from "./rules";

/* ============================================================
 * XP RULE REGISTRY
 *
 * Single source of truth for which scoring rules exist. Mirrors the
 * Phase 11.1 scheduler registry: the database stores only a rule KEY
 * plus params, never the scoring maths.
 *
 * To add a rule:
 *   1. export an XpRule from ./rules
 *   2. append it to XP_RULES
 *   3. done — no migration
 * ============================================================ */
const REGISTRY: Record<string, XpRule> = XP_RULES.reduce(
  (acc, rule) => {
    acc[rule.key] = rule;
    return acc;
  },
  {} as Record<string, XpRule>
);

/** Event type → the rule that scores it. */
const BY_EVENT: Record<string, XpRule> = XP_RULES.reduce(
  (acc, rule) => {
    acc[rule.eventType] = rule;
    return acc;
  },
  {} as Record<string, XpRule>
);

export function getRule(key: string): XpRule | null {
  return REGISTRY[key] ?? null;
}

export function getRuleForEvent(eventType: XpEventType | string): XpRule | null {
  return BY_EVENT[eventType] ?? null;
}

export function listRuleKeys(): string[] {
  return XP_RULES.map((r) => r.key);
}

export const XP_RULE_COUNT = XP_RULES.length;

/** Coerce + clamp raw params against a rule's declared field schema. */
export function resolveParams(rule: XpRule, raw?: Record<string, unknown> | null): XpParams {
  const resolved: XpParams = { ...rule.defaultParams };
  if (!raw) return resolved;

  for (const field of rule.paramFields) {
    if (!(field.key in raw) || raw[field.key] == null) continue;
    const value = raw[field.key];

    if (field.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) continue;
      resolved[field.key] = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n));
    } else if (field.type === "boolean") {
      resolved[field.key] = Boolean(value);
    }
  }
  return resolved;
}

/** Worked examples so the UI can show what each rule actually pays. */
function buildExamples(rule: XpRule): Array<{ label: string; points: number }> {
  const base = {
    params: rule.defaultParams,
    awardedTodayByRule: 0,
    currentStreakDays: 1,
  };

  const scenarios: Record<string, Array<{ label: string; payload: Record<string, unknown> }>> = {
    "review-graded": [
      { label: "Good, young card", payload: { rating: "good", wasCorrect: true, intervalDays: 2 } },
      { label: "Good, mature (30d)", payload: { rating: "good", wasCorrect: true, intervalDays: 30 } },
      { label: "New card learned", payload: { rating: "good", wasCorrect: true, isNewCard: true } },
      { label: "Lapse (again)", payload: { rating: "again", wasCorrect: false } },
    ],
    "session-completed": [
      { label: "10 cards @ 80%", payload: { cardsAnswered: 10, accuracy: 80 } },
      { label: "20 cards @ 100%", payload: { cardsAnswered: 20, accuracy: 100 } },
    ],
    "quiz-answered": [
      { label: "N5 correct", payload: { wasCorrect: true, jlptLevel: "N5", questionDifficulty: 1 } },
      { label: "N1 hard correct", payload: { wasCorrect: true, jlptLevel: "N1", questionDifficulty: 5 } },
    ],
    "test-completed": [
      { label: "N5 mock, 85%, passed", payload: { scorePercent: 85, passed: true, totalQuestions: 32, jlptLevel: "N5" } },
      { label: "N5 mock, 40%, failed", payload: { scorePercent: 40, passed: false, totalQuestions: 32, jlptLevel: "N5" } },
    ],
    "knowledge-added": [
      { label: "1 kana card", payload: { cardsCreated: 1, knowledgeKind: "kana" } },
      { label: "5 kanji cards", payload: { cardsCreated: 5, knowledgeKind: "kanji" } },
    ],
    "streak-day": [
      { label: "Day 1", payload: { streakDays: 1 } },
      { label: "Day 7 milestone", payload: { streakDays: 7 } },
      { label: "Day 30 milestone", payload: { streakDays: 30 } },
    ],
  };

  return (scenarios[rule.key] ?? []).map((s) => {
    const outcome = rule.score({
      ...base,
      payload: {
        eventType: rule.eventType,
        userId: "preview",
        ...(s.payload as Record<string, never>),
      },
    });
    return { label: s.label, points: outcome.points };
  });
}

export function describeRule(rule: XpRule): XpRuleDescriptor {
  return {
    key: rule.key,
    version: rule.version,
    eventType: rule.eventType,
    name: rule.name,
    description: rule.description,
    basePoints: rule.basePoints,
    dailyCap: rule.dailyCap,
    defaultParams: rule.defaultParams,
    paramFields: rule.paramFields,
    examples: buildExamples(rule),
  };
}

export function listRules(): XpRuleDescriptor[] {
  return XP_RULES.map(describeRule);
}

/* ============================================================
 * LEVEL CURVE
 *
 * Derived from cumulative XP — never stored. A progressive curve so
 * early levels arrive quickly and later ones take real commitment.
 *
 *   xpForLevel(n) = round(BASE * n^EXPONENT)
 * ============================================================ */
const LEVEL_BASE = 60;
const LEVEL_EXPONENT = 1.45;
export const MAX_LEVEL = 60;

const LEVEL_TITLES: Array<{ upTo: number; title: string; japanese: string }> = [
  { upTo: 4, title: "Beginner", japanese: "入門" },
  { upTo: 9, title: "Student", japanese: "学生" },
  { upTo: 14, title: "Apprentice", japanese: "見習い" },
  { upTo: 19, title: "Practitioner", japanese: "実践者" },
  { upTo: 26, title: "Adept", japanese: "熟練者" },
  { upTo: 34, title: "Scholar", japanese: "学者" },
  { upTo: 43, title: "Expert", japanese: "専門家" },
  { upTo: 52, title: "Master", japanese: "達人" },
  { upTo: MAX_LEVEL, title: "Grandmaster", japanese: "師範" },
];

function titleForLevel(level: number) {
  return LEVEL_TITLES.find((t) => level <= t.upTo) ?? LEVEL_TITLES[LEVEL_TITLES.length - 1];
}

/** Cumulative XP required to *reach* a given level (level 1 = 0 XP). */
export function xpAtLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level; n += 1) {
    total += Math.round(LEVEL_BASE * Math.pow(n, LEVEL_EXPONENT));
  }
  return total;
}

export function levelForXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));

  let level = 1;
  while (level < MAX_LEVEL && xp >= xpAtLevel(level + 1)) {
    level += 1;
  }

  const start = xpAtLevel(level);
  const isMax = level >= MAX_LEVEL;
  const next = isMax ? null : xpAtLevel(level + 1);
  const span = next === null ? 0 : next - start;
  const into = xp - start;
  const meta = titleForLevel(level);

  return {
    level,
    title: meta.title,
    japanese: meta.japanese,
    xpAtLevelStart: start,
    xpAtNextLevel: next,
    xpIntoLevel: into,
    xpForThisLevel: span,
    progressPercent: span > 0 ? Math.min(100, Math.round((into / span) * 1000) / 10) : 100,
    isMaxLevel: isMax,
  };
}

/** Guardrail: every rule must declare complete metadata. */
export function assertRulesWellFormed(): true {
  if (XP_RULES.length === 0) throw new Error("No XP rules registered");
  const seenEvents = new Set<string>();
  for (const r of XP_RULES) {
    if (!r.key || !r.version || !r.eventType || !r.paramFields) {
      throw new Error(`XP rule ${r.key} is incompletely declared`);
    }
    if (seenEvents.has(r.eventType)) {
      throw new Error(`Duplicate rule for event type ${r.eventType}`);
    }
    seenEvents.add(r.eventType);
  }
  return true;
}
