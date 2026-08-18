import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { env, isFeatureConfigured } from "@/lib/env";
import type { CheckoutQuote } from "@/lib/billing/types";

function razorpayClient(): Razorpay {
  if (!isFeatureConfigured("razorpay")) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET.");
  }

  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID!,
    key_secret: env.RAZORPAY_KEY_SECRET!,
  });
}

export async function createRazorpayOrder(input: {
  checkoutId: string;
  quote: CheckoutQuote;
  userId: string;
  institutionId?: string | null;
}): Promise<{ id: string; amount: number; currency: string; keyId: string }> {
  const order = await razorpayClient().orders.create({
    amount: input.quote.totalMinor,
    currency: input.quote.currency.toUpperCase(),
    receipt: input.checkoutId.slice(0, 40),
    notes: {
      checkoutId: input.checkoutId,
      userId: input.userId,
      planId: input.quote.planId,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    },
  });

  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID!,
  };
}

export async function createRazorpaySubscription(input: {
  checkoutId: string;
  razorpayPlanId: string;
  userId: string;
  institutionId?: string | null;
}): Promise<{ id: string; shortUrl: string | null; keyId: string }> {
  const subscription = await razorpayClient().subscriptions.create({
    plan_id: input.razorpayPlanId,
    total_count: 120,
    quantity: 1,
    customer_notify: 1,
    notes: {
      checkoutId: input.checkoutId,
      userId: input.userId,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    },
  });

  return {
    id: subscription.id,
    shortUrl: "short_url" in subscription && typeof subscription.short_url === "string" ? subscription.short_url : null,
    keyId: env.RAZORPAY_KEY_ID!,
  };
}

export async function createRazorpayRefund(input: {
  providerPaymentId: string;
  amountMinor?: number;
  notes?: Record<string, string>;
}): Promise<{ id: string; status: string }> {
  const refund = await razorpayClient().payments.refund(input.providerPaymentId, {
    ...(input.amountMinor ? { amount: input.amountMinor } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  });

  return { id: refund.id, status: refund.status };
}

function secureCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyRazorpayCheckoutSignature(input: {
  serverOrderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!isFeatureConfigured("razorpay")) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${input.serverOrderId}|${input.paymentId}`)
    .digest("hex");
  return secureCompare(expected, input.signature);
}

export function verifyRazorpaySubscriptionSignature(input: {
  serverSubscriptionId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!isFeatureConfigured("razorpay")) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${input.paymentId}|${input.serverSubscriptionId}`)
    .digest("hex");
  return secureCompare(expected, input.signature);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  if (!isFeatureConfigured("razorpay")) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return secureCompare(expected, signature);
}
