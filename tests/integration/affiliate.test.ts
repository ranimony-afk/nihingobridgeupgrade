import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import {
  accrueCommission,
  affiliateStats,
  createAffiliate,
  findAffiliate,
  payoutAffiliate,
  reverseCommission,
  setAffiliateStatus,
} from "../../src/lib/billing/affiliate.ts";
import {
  cancelSubscription,
  createCheckout,
  fulfillCheckout,
  recordWebhook,
  resolveCoupon,
  resumeSubscription,
} from "../../src/lib/billing/service.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("unknown affiliate codes are rejected, seeded ones work", async () => {
  assert.equal(await seedReady(), true);
  // Phase 4 gave 15% off to ANY string starting with AFFILIATE-.
  const bogus = await resolveCoupon("AFFILIATE-TOTALLYMADEUP");
  assert.equal(bogus?.ok, false);

  const real = await resolveCoupon("AFFILIATE-SAKURA");
  assert.equal(real?.ok, true);
  if (real?.ok) assert.equal(real.percentOff, 15);
});

test("paused affiliates stop discounting", async () => {
  await seedReady();
  const partner = await findAffiliate("AFFILIATE-SAKURA");
  assert.ok(partner);
  await setAffiliateStatus(partner.id, "paused");
  assert.equal(await findAffiliate("AFFILIATE-SAKURA"), null);
  await setAffiliateStatus(partner.id, "active");
  assert.ok(await findAffiliate("AFFILIATE-SAKURA"));
});

test("affiliate checkout accrues commission and pays out once", async () => {
  await seedReady();
  const code = `AFFILIATE-T${Date.now().toString().slice(-6)}`;
  const created = await createAffiliate({ code, name: "Test", email: "t@example.com" });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const checkout = await createCheckout({
    userId: "idn-student",
    planId: "plan-plus-month-usd",
    provider: "sandbox",
    coupon: code,
  });
  const paid = await fulfillCheckout(checkout.id, "test");
  assert.equal(paid.already, false);

  const stats = await affiliateStats(created.affiliate!.id);
  assert.equal(stats.conversions, 1);
  assert.equal(stats.pending, Math.round((checkout.quote.total * 20) / 100));

  const payout = await payoutAffiliate(created.affiliate!.id, "test-run");
  assert.equal(payout.ok, true);

  // Second payout has nothing left to pay.
  const again = await payoutAffiliate(created.affiliate!.id, "test-run-2");
  assert.equal(again.ok, false);
});

test("commission is not double counted for the same checkout", async () => {
  await seedReady();
  const partner = await findAffiliate("AFFILIATE-SAKURA");
  assert.ok(partner);
  const checkoutId = `chk-dupe-${Date.now()}`;
  const first = await accrueCommission({
    code: partner.code,
    checkoutId,
    currency: "usd",
    netAmount: 5000,
  });
  const second = await accrueCommission({
    code: partner.code,
    checkoutId,
    currency: "usd",
    netAmount: 5000,
  });
  assert.equal(first?.id, second?.id);
});

test("refund reverses an unpaid commission", async () => {
  await seedReady();
  const partner = await findAffiliate("AFFILIATE-SAKURA");
  assert.ok(partner);
  const invoiceId = `inv-rev-${Date.now()}`;
  await accrueCommission({
    code: partner.code,
    checkoutId: `chk-rev-${Date.now()}`,
    invoiceId,
    currency: "usd",
    netAmount: 4000,
  });
  const reversed = await reverseCommission(invoiceId);
  assert.ok(reversed >= 1);
});

test("duplicate webhooks are ignored", async () => {
  await seedReady();
  const key = `evt_${Date.now()}`;
  const first = await recordWebhook("stripe", "checkout.session.completed", { id: key }, key);
  const second = await recordWebhook("stripe", "checkout.session.completed", { id: key }, key);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test("subscription can cancel then resume", async () => {
  await seedReady();
  const checkout = await createCheckout({
    userId: "idn-teacher",
    planId: "plan-plus-month-usd",
    provider: "sandbox",
  });
  await fulfillCheckout(checkout.id, "test");

  const cancelled = await cancelSubscription("idn-teacher");
  assert.equal(cancelled.ok, true);
  const resumed = await resumeSubscription("idn-teacher");
  assert.equal(resumed.ok, true);
});
