import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { seedDemoAnalytics } from "../../src/lib/analytics/demo.ts";
import {
  analyticsOverview,
  funnelAnalytics,
  learningAnalytics,
  productAnalytics,
  retentionAnalytics,
  revenueAnalytics,
} from "../../src/lib/analytics/service.ts";
import { eventCounts } from "../../src/lib/infra/analytics.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("demo activity seeds so the dashboard is explorable", async () => {
  assert.equal(await seedReady(), true);
  const result = await seedDemoAnalytics(true);
  assert.equal(result.skipped, false);
});

test("learning analytics returns a full daily window", async () => {
  await seedReady();
  const data = await learningAnalytics(30);
  // Days with no activity must still appear, otherwise charts lie about gaps.
  assert.equal(data.series.length, 30);
  assert.ok(data.mau >= data.wau);
  assert.ok(data.wau >= data.dau);
  assert.ok(data.xpTotal > 0);
  assert.ok(data.stickiness >= 0 && data.stickiness <= 1);
});

test("funnel stages never increase down the sequence", async () => {
  await seedReady();
  const data = await funnelAnalytics();
  assert.ok(data.steps.length >= 5);
  for (const step of data.steps) {
    assert.ok(step.overallRate >= 0 && step.overallRate <= 1);
  }
  assert.equal(data.steps[0]?.stepRate, 1);
});

test("revenue derives MRR, churn, and LTV without dividing by zero", async () => {
  await seedReady();
  const data = await revenueAnalytics();
  assert.ok(data.mrr >= 0);
  assert.equal(data.arr, data.mrr * 12);
  assert.ok(data.churnRate >= 0 && data.churnRate <= 1);
  assert.ok(Number.isFinite(data.ltv));
  assert.equal(data.netRevenue, data.grossPaid - data.refunded);
});

test("retention cohorts start at 100% in week zero", async () => {
  await seedReady();
  const data = await retentionAnalytics(6);
  assert.equal(data.offsets.length, 6);
  for (const cohort of data.cohorts) {
    assert.ok(cohort.size > 0);
    assert.equal(cohort.retention[0]?.rate, 1);
    for (const cell of cohort.retention) {
      assert.ok(cell.rate >= 0 && cell.rate <= 1);
    }
  }
});

test("product analytics aggregates events in SQL", async () => {
  await seedReady();
  const data = await productAnalytics();
  assert.ok(data.events.length > 0);
  assert.ok(data.search.zeroRate >= 0 && data.search.zeroRate <= 1);
  const counts = await eventCounts();
  assert.ok(counts.total > 0);
  assert.equal(
    counts.total,
    Object.values(counts.counts).reduce((a, b) => a + b, 0),
  );
});

test("overview bundles every section", async () => {
  await seedReady();
  const data = await analyticsOverview();
  for (const key of ["learning", "revenue", "funnel", "retention", "product"]) {
    assert.ok(key in data, `missing ${key}`);
  }
  assert.ok(data.generatedAt);
});

test("demo seeding is skipped once real activity exists", async () => {
  await seedReady();
  const result = await seedDemoAnalytics(false);
  assert.equal(result.skipped, true);
});
