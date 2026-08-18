import {
  verifyRazorpayCheckoutPayment,
  verifyRazorpaySubscriptionPayment,
} from "@/lib/billing/service";
import { requireIdentity } from "@/lib/auth/guard";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shared = {
  checkoutId: z.string().uuid(),
  razorpayPaymentId: z.string().min(1).max(255),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
};
const orderVerificationSchema = z.object({ ...shared, razorpayOrderId: z.string().min(1).max(255) });
const subscriptionVerificationSchema = z.object({ ...shared, razorpaySubscriptionId: z.string().min(1).max(255) });

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const rawPayload = await request.json();
  const orderPayload = orderVerificationSchema.safeParse(rawPayload);
  const subscriptionPayload = subscriptionVerificationSchema.safeParse(rawPayload);

  let verified = false;
  if (orderPayload.success && !subscriptionPayload.success) {
    verified = await verifyRazorpayCheckoutPayment({
      userId: identity.identity.user.id,
      checkoutId: orderPayload.data.checkoutId,
      orderId: orderPayload.data.razorpayOrderId,
      paymentId: orderPayload.data.razorpayPaymentId,
      signature: orderPayload.data.razorpaySignature,
    });
  } else if (subscriptionPayload.success && !orderPayload.success) {
    verified = await verifyRazorpaySubscriptionPayment({
      userId: identity.identity.user.id,
      checkoutId: subscriptionPayload.data.checkoutId,
      subscriptionId: subscriptionPayload.data.razorpaySubscriptionId,
      paymentId: subscriptionPayload.data.razorpayPaymentId,
      signature: subscriptionPayload.data.razorpaySignature,
    });
  } else {
    return rateLimitedJson(
      { error: "The Razorpay verification payload is invalid.", code: "VALIDATION_ERROR" },
      rateLimit,
      { status: 400 },
    );
  }

  if (!verified) {
    return rateLimitedJson(
      { error: "Razorpay payment verification failed.", code: "PAYMENT_VERIFICATION_FAILED" },
      rateLimit,
      { status: 400 },
    );
  }

  return rateLimitedJson(
    {
      ok: true,
      status: "verification_pending_webhook",
      message: "Payment is verified. Premium access will activate after provider capture confirmation.",
    },
    rateLimit,
    { status: 202 },
  );
}
