import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arpu,
  arr,
  buildCohorts,
  buildFunnel,
  churnRate,
  lastNDays,
  ltv,
  median,
  monthlyValue,
  mrr,
  ratio,
  stickiness,
  trend,
  worstFunnelStep,
} from "../../src/lib/analytics/metrics.ts";

test("annual plans are normalised to a monthly figure", () => {
  // 7900/yr must not count as 7900 of MRR.
  assert.equal(monthlyValue(7900, "year"), 658);
  assert.equal(monthlyValue(999, "month"), 999);
});

test("MRR counts active and canceling, excludes churned", () => {
  const value = mrr([
    { amount: 999, interval: "month", status: "active" },
    { amount: 7900, interval: "year", status: "canceling" },
    { amount: 999, interval: "month", status: "canceled" },
    { amount: 999, interval: "month", status: "expired" },
  ]);
  // canceling still pays this period, so it belongs in MRR.
  assert.equal(value, 999 + 658);
  assert.equal(arr(value), (999 + 658) * 12);
});

test("ARPU and churn guard divide-by-zero", () => {
  assert.equal(arpu(1000, 0), 0);
  assert.equal(churnRate(0, 5), 0);
  assert.equal(ratio(5, 0), 0);
});

test("churn is measured against accounts that could have churned", () => {
  assert.equal(churnRate(10, 2), 0.2);
  // Never exceeds 100% even with dirty data.
  assert.equal(churnRate(2, 10), 1);
});

test("LTV is capped instead of returning Infinity at zero churn", () => {
  assert.equal(ltv(1000, 0), 36000);
  assert.equal(ltv(1000, 0.25), 4000);
  assert.equal(ltv(0, 0.1), 0);
});

test("funnel computes step, overall, and drop-off", () => {
  const steps = buildFunnel([
    { key: "a", label: "Visited", count: 1000 },
    { key: "b", label: "Signed up", count: 400 },
    { key: "c", label: "Paid", count: 40 },
  ]);
  assert.equal(steps[0]?.stepRate, 1);
  assert.equal(steps[1]?.stepRate, 0.4);
  assert.equal(steps[1]?.dropOff, 600);
  assert.equal(steps[2]?.overallRate, 0.04);
  assert.equal(worstFunnelStep(steps)?.key, "c");
});

test("empty funnel does not divide by zero", () => {
  const steps = buildFunnel([
    { key: "a", label: "Visited", count: 0 },
    { key: "b", label: "Paid", count: 0 },
  ]);
  assert.equal(steps[1]?.overallRate, 0);
  assert.equal(steps[1]?.stepRate, 0);
});

test("cohort retention counts unique members only", () => {
  const rows = buildCohorts(
    [
      {
        cohort: "2026-01-05",
        members: ["a", "b", "c", "c"],
        activeByOffset: { 0: ["a", "b", "c"], 1: ["a", "a", "b"], 2: [] },
      },
    ],
    [0, 1, 2],
  );
  assert.equal(rows[0]?.size, 3);
  assert.equal(rows[0]?.retention[0]?.rate, 1);
  // "a" listed twice must count once.
  assert.equal(rows[0]?.retention[1]?.count, 2);
  assert.equal(rows[0]?.retention[2]?.rate, 0);
});

test("stickiness and trend behave on edges", () => {
  assert.equal(stickiness(5, 20), 0.25);
  assert.equal(stickiness(5, 0), 0);
  assert.equal(trend([1, 1, 2, 2]), 1);
  assert.equal(trend([2, 2, 1, 1]), -0.5);
  assert.equal(trend([]), 0);
});

test("median resists outliers that skew the mean", () => {
  assert.equal(median([1, 2, 3, 4, 1000]), 3);
  assert.equal(median([2, 4]), 3);
  assert.equal(median([]), 0);
});

test("lastNDays returns an inclusive ascending window", () => {
  const days = lastNDays(7, new Date("2026-03-10T12:00:00Z"));
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-03-04");
  assert.equal(days[6], "2026-03-10");
});

test("funnel flags a stage that grows instead of shrinking", async () => {
  const { funnelAnomalies } = await import("../../src/lib/analytics/metrics.ts");
  // A later stage can never contain more actors than the one above it.
  const steps = buildFunnel([
    { key: "a", label: "Visited", count: 10 },
    { key: "b", label: "Onboarded", count: 0 },
    { key: "c", label: "Earned XP", count: 68 },
  ]);
  assert.equal(steps[1]?.inconsistent, false);
  assert.equal(steps[2]?.inconsistent, true);
  assert.equal(funnelAnomalies(steps).length, 1);
  // Counts are reported as-is, never clamped, so the bug stays visible.
  assert.equal(steps[2]?.count, 68);
});
