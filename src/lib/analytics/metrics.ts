/**
 * Pure analytics maths. No database imports, so every rule here is unit
 * testable and reusable from any runtime.
 *
 * Money is always in minor units (cents / paise) to avoid float drift.
 */

export type Interval = "month" | "year";

/**
 * Monthly Recurring Revenue. Annual plans are normalised to a monthly figure —
 * counting a year's payment as one month's revenue would inflate MRR ~12x.
 */
export function monthlyValue(amount: number, interval: Interval | string) {
  if (amount <= 0) return 0;
  return interval === "year" ? Math.round(amount / 12) : amount;
}

export function mrr(subscriptions: { amount: number; interval: string; status: string }[]) {
  return subscriptions
    .filter((row) => row.status === "active" || row.status === "canceling")
    .reduce((sum, row) => sum + monthlyValue(row.amount, row.interval), 0);
}

/** ARR is a projection, not observed cash. */
export function arr(monthlyRecurring: number) {
  return monthlyRecurring * 12;
}

/** Average revenue per paying account. Zero payers must not divide by zero. */
export function arpu(monthlyRecurring: number, payingAccounts: number) {
  if (payingAccounts <= 0) return 0;
  return Math.round(monthlyRecurring / payingAccounts);
}

/**
 * Churn over a window: cancellations divided by the accounts that could have
 * churned (active at the start), not by today's total.
 */
export function churnRate(activeAtStart: number, churnedDuring: number) {
  if (activeAtStart <= 0) return 0;
  return clampRate(churnedDuring / activeAtStart);
}

/**
 * Lifetime value. With zero churn the true answer is unbounded, so we cap the
 * horizon at 36 months rather than returning Infinity into a dashboard.
 */
export function ltv(arpuValue: number, monthlyChurn: number, maxMonths = 36) {
  if (arpuValue <= 0) return 0;
  const months = monthlyChurn <= 0 ? maxMonths : Math.min(1 / monthlyChurn, maxMonths);
  return Math.round(arpuValue * months);
}

export function clampRate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function percent(value: number, digits = 1) {
  return Number((clampRate(value) * 100).toFixed(digits));
}

/** Ratio of two counts as a percentage, guarding divide-by-zero. */
export function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return clampRate(numerator / denominator);
}

export type FunnelStage = { key: string; label: string; count: number };

export type FunnelStep = FunnelStage & {
  /** Conversion from the immediately preceding stage. */
  stepRate: number;
  /** Conversion from the very top of the funnel. */
  overallRate: number;
  dropOff: number;
  inconsistent: boolean;
};

/**
 * Builds a funnel report. Stages must be monotonically decreasing — each is a
 * subset of the one above. We never clamp a rising count, because that would
 * hide the bug; instead the step is flagged so the UI can surface it.
 */
export function buildFunnel(stages: FunnelStage[]): FunnelStep[] {
  const top = stages[0]?.count ?? 0;
  return stages.map((stage, index) => {
    const previous = index === 0 ? stage.count : (stages[index - 1]?.count ?? 0);
    return {
      ...stage,
      stepRate: index === 0 ? 1 : ratio(stage.count, previous),
      overallRate: ratio(stage.count, top),
      dropOff: Math.max(0, previous - stage.count),
      /** True when this stage reports more actors than the one before it. */
      inconsistent: index > 0 && stage.count > previous,
    };
  });
}

/** Stages whose counts exceed the stage above — always a measurement bug. */
export function funnelAnomalies(steps: FunnelStep[]) {
  return steps.filter((step) => step.inconsistent);
}

/** Finds the biggest proportional drop, which is where to focus product work. */
export function worstFunnelStep(steps: FunnelStep[]) {
  const candidates = steps.slice(1);
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, step) => (step.stepRate < worst.stepRate ? step : worst));
}

export type CohortInput = {
  cohort: string;
  /** Actor ids that joined in this cohort. */
  members: string[];
  /** activeByOffset[n] = ids active n periods after joining. */
  activeByOffset: Record<number, string[]>;
};

export type CohortRow = {
  cohort: string;
  size: number;
  retention: { offset: number; count: number; rate: number }[];
};

/**
 * Classic cohort retention. Offset 0 is the joining period itself, so it is
 * 100% by definition and is reported for shape, not insight.
 */
export function buildCohorts(inputs: CohortInput[], offsets: number[]): CohortRow[] {
  return inputs.map((input) => {
    const size = new Set(input.members).size;
    return {
      cohort: input.cohort,
      size,
      retention: offsets.map((offset) => {
        const active = new Set(input.activeByOffset[offset] ?? []);
        const retained = [...new Set(input.members)].filter((id) => active.has(id)).length;
        return { offset, count: retained, rate: ratio(retained, size) };
      }),
    };
  });
}

/**
 * Stickiness = DAU / MAU. Above ~0.2 is healthy for a learning product;
 * it says the average monthly user shows up 6 days a month.
 */
export function stickiness(dau: number, mau: number) {
  return ratio(dau, mau);
}

/** Simple linear trend: positive means the second half beat the first. */
export function trend(series: number[]) {
  if (series.length < 2) return 0;
  const middle = Math.floor(series.length / 2);
  const first = series.slice(0, middle);
  const second = series.slice(middle);
  const avg = (rows: number[]) => (rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0);
  const before = avg(first);
  const after = avg(second);
  if (before === 0) return after > 0 ? 1 : 0;
  return Number(((after - before) / before).toFixed(3));
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(sum(values) / values.length);
}

/** Median is more honest than mean for skewed data like XP or session length. */
export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : (sorted[middle] ?? 0);
}

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of ISO day keys ending today. */
export function lastNDays(n: number, from = new Date()) {
  return Array.from({ length: n }, (_, index) => {
    const day = new Date(from);
    day.setUTCDate(day.getUTCDate() - (n - 1 - index));
    return isoDay(day);
  });
}
