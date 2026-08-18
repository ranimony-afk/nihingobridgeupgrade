import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyRazorpayCheckoutSignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
} from "@/lib/billing/razorpay";

describe("Razorpay cryptographic verification", () => {
  it("verifies the server order ID and payment ID signature", () => {
    const orderId = "order_123";
    const paymentId = "pay_123";
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    expect(verifyRazorpayCheckoutSignature({ serverOrderId: orderId, paymentId, signature })).toBe(true);
    expect(verifyRazorpayCheckoutSignature({ serverOrderId: orderId, paymentId: "pay_other", signature })).toBe(false);
  });

  it("verifies subscription and raw webhook signatures", () => {
    const subscriptionId = "sub_123";
    const paymentId = "pay_123";
    const subscriptionSignature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${paymentId}|${subscriptionId}`)
      .digest("hex");
    const rawBody = JSON.stringify({ event: "payment.captured", payload: {} });
    const webhookSignature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest("hex");

    expect(verifyRazorpaySubscriptionSignature({ serverSubscriptionId: subscriptionId, paymentId, signature: subscriptionSignature })).toBe(true);
    expect(verifyRazorpayWebhookSignature(rawBody, webhookSignature)).toBe(true);
    expect(verifyRazorpayWebhookSignature(`${rawBody}x`, webhookSignature)).toBe(false);
  });
});
