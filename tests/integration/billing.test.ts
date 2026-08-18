import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { createCheckout, fulfillCheckout, refundInvoice, resolveCoupon } from "../../src/lib/billing/service.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("sandbox checkout fulfills plus and can refund", async () => {
  assert.equal(await seedReady(), true);
  const checkout = await createCheckout({
    userId: "idn-student",
    planId: "plan-plus-month-usd",
    provider: "sandbox",
    coupon: "SAVE20",
  });
  assert.ok(checkout.quote.total < checkout.plan.amount);
  const paid = await fulfillCheckout(checkout.id, "test");
  assert.equal(paid.already, false);
  assert.ok(paid.invoiceId);
  const refunded = await refundInvoice(paid.invoiceId!, "test");
  assert.equal(refunded.ok, true);
});

test("referral and affiliate codes resolve", async () => {
  assert.equal(await seedReady(), true);
  const affiliate = await resolveCoupon("AFFILIATE-PARTNER");
  assert.equal(affiliate && "percentOff" in affiliate && affiliate.percentOff, 15);
});
