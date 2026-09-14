import {
  SchedulerDescriptor,
  SchedulerKey,
  SchedulerParams,
  SchedulerParamField,
  SrsScheduler,
} from "@/types/srs";
import { sm2Scheduler } from "./strategies/sm2";
import { leitnerScheduler } from "./strategies/leitnerBox";
import { fsrsLiteScheduler } from "./strategies/fsrsLite";
import { fixedLadderScheduler } from "./strategies/fixedLadder";
import { describeInterval, freshState, simulateIntervalLadder } from "./strategies/shared";

/**
 * ============================================================
 * SCHEDULER REGISTRY
 * ============================================================
 * The single source of truth for which algorithms exist.
 *
 * To add a new algorithm:
 *   1. create src/services/srs/strategies/<name>.ts exporting an SrsScheduler
 *   2. import it here and add it to the PLUGINS array
 *   3. done — decks can now reference it by key. No migration.
 *
 * Nothing outside this file may branch on a scheduler key.
 * ============================================================
 */
const PLUGINS: SrsScheduler[] = [
  sm2Scheduler,
  leitnerScheduler,
  fsrsLiteScheduler,
  fixedLadderScheduler,
];

export const DEFAULT_SCHEDULER_KEY: SchedulerKey = "sm2";

const REGISTRY: Record<string, SrsScheduler> = PLUGINS.reduce(
  (acc, plugin) => {
    acc[plugin.key] = plugin;
    return acc;
  },
  {} as Record<string, SrsScheduler>
);

/** Resolve a scheduler by key, falling back to the platform default. */
export function getScheduler(key?: string | null): SrsScheduler {
  if (key && REGISTRY[key]) return REGISTRY[key];
  return REGISTRY[DEFAULT_SCHEDULER_KEY];
}

export function hasScheduler(key: string): boolean {
  return Boolean(REGISTRY[key]);
}

export function listSchedulerKeys(): SchedulerKey[] {
  return PLUGINS.map((p) => p.key);
}

/** Coerce + clamp raw params against a scheduler's declared field schema. */
export function resolveParams(
  scheduler: SrsScheduler,
  raw?: Record<string, unknown> | null
): SchedulerParams {
  const resolved: SchedulerParams = { ...scheduler.defaultParams };

  if (!raw) return resolved;

  for (const field of scheduler.paramFields) {
    if (!(field.key in raw) || raw[field.key] === undefined || raw[field.key] === null) continue;
    const value = raw[field.key];

    if (field.type === "number") {
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) continue;
      resolved[field.key] = clampNumber(parsed, field.min ?? -Infinity, field.max ?? Infinity);
    } else if (field.type === "boolean") {
      resolved[field.key] = Boolean(value);
    } else if (field.type === "array") {
      if (Array.isArray(value)) {
        const nums = value.map(Number).filter((n) => Number.isFinite(n) && n > 0);
        if (nums.length > 0) resolved[field.key] = nums;
      }
    }
  }

  return resolved;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Simulate the ladder a card would walk if the learner kept answering `rating`. */
export function buildIntervalLadder(
  scheduler: SrsScheduler,
  params: SchedulerParams,
  steps = 8,
  rating: "again" | "hard" | "good" | "easy" = "good"
): Array<{ step: number; intervalDays: number; label: string }> {
  return simulateIntervalLadder(scheduler.review.bind(scheduler), params, steps, rating);
}

/** Public descriptor for the UI — includes a truthful interval preview. */
export function describeScheduler(
  scheduler: SrsScheduler,
  paramsOverride?: Record<string, unknown> | null
): SchedulerDescriptor {
  const params = resolveParams(scheduler, paramsOverride);
  return {
    key: scheduler.key,
    name: scheduler.name,
    shortName: scheduler.shortName,
    version: scheduler.version,
    description: scheduler.description,
    strengths: scheduler.strengths,
    defaultParams: scheduler.defaultParams,
    paramFields: scheduler.paramFields,
    intervalLadder: buildIntervalLadder(scheduler, params, 8),
  };
}

export function listSchedulers(): SchedulerDescriptor[] {
  return PLUGINS.map((p) => describeScheduler(p));
}

/** Preview a single hypothetical grade without touching persistence. */
export function previewGrade(input: {
  schedulerKey: string;
  params?: Record<string, unknown> | null;
  rating: "again" | "hard" | "good" | "easy";
  repetitions?: number;
  easeFactor?: number;
  intervalDays?: number;
  stabilityDays?: number;
  difficulty?: number;
  box?: number;
  stepIndex?: number;
  isLearning?: boolean;
  lapses?: number;
  lastReviewedAt?: string | null;
}) {
  const scheduler = getScheduler(input.schedulerKey);
  const params = resolveParams(scheduler, input.params);
  const baseState = freshState();

  const state = {
    ...baseState,
    repetitions: input.repetitions ?? baseState.repetitions,
    easeFactor: input.easeFactor ?? baseState.easeFactor,
    intervalDays: input.intervalDays ?? baseState.intervalDays,
    stabilityDays: input.stabilityDays ?? baseState.stabilityDays,
    difficulty: input.difficulty ?? baseState.difficulty,
    box: input.box ?? baseState.box,
    stepIndex: input.stepIndex ?? baseState.stepIndex,
    isLearning: input.isLearning ?? baseState.isLearning,
    lapses: input.lapses ?? baseState.lapses,
    lastReviewedAt: input.lastReviewedAt ?? null,
    dueAt: new Date(),
  };

  const outcome = scheduler.review({
    state,
    rating: input.rating,
    now: new Date(),
    params,
    historyCount: state.repetitions,
  });

  return {
    scheduler: {
      key: scheduler.key,
      name: scheduler.name,
      version: scheduler.version,
    },
    paramsApplied: params,
    rating: input.rating,
    stateBefore: state,
    outcome: {
      ...outcome,
      intervalLabel: describeInterval(outcome.intervalDays),
    },
  };
}

export const SCHEDULER_PLUGIN_COUNT = PLUGINS.length;

export function assertNoHardcodedAlgorithms(): true {
  // Guardrail: every plugin must declare metadata + params, not just math,
  // so the DB never needs to encode behaviour.
  if (PLUGINS.length === 0) throw new Error("No schedulers registered");
  for (const p of PLUGINS) {
    if (!p.key || !p.version || !p.paramFields?.length || !p.defaultParams) {
      throw new Error(`Scheduler ${p.key} is incompletely declared`);
    }
  }
  return true;
}
