import { createBillingCheckout, BillingError } from "@/lib/billing/service";
import { billingClients, billingProviders } from "@/lib/billing/types";
import { getRequestMetadata } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { applyRateLimit, rateLimitedJson } from "@/lib/auth/route";
import { authRateLimitPolicy } from "@/lib/rate-limit";
import { reportException } from "@/lib/observability";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(billingProviders),
  client: z.enum(billingClients).default("web"),
  institutionId: z.string().uuid().optional(),
  couponCode: z.string().trim().min(2).max(64).optional(),
  referralCode: z.string().trim().min(2).max(64).optional(),
  billingStateCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/).optional(),
  idempotencyKey: z.string().trim().min(12).max(255).optional(),
});

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, authRateLimitPolicy);
  if (rateLimit instanceof Response) return rateLimit;

  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  try {
    const payload = checkoutSchema.safeParse(await request.json());
    if (!payload.success) {
      return rateLimitedJson(
        { error: "The checkout request is invalid.", code: "VALIDATION_ERROR" },
        rateLimit,
        { status: 400 },
      );
    }

    const idempotencyKey = request.headers.get("idempotency-key") ?? payload.data.idempotencyKey;
    if (!idempotencyKey) {
      return rateLimitedJson(
        { error: "An Idempotency-Key header is required for checkout.", code: "IDEMPOTENCY_KEY_REQUIRED" },
        rateLimit,
        { status: 400 },
      );
    }

    const result = await createBillingCheckout({
      user: identity.identity.user,
      provider: payload.data.provider,
      client: payload.data.client,
      planId: payload.data.planId,
      institutionId: payload.data.institutionId ?? null,
      couponCode: payload.data.couponCode,
      referralCode: payload.data.referralCode,
      billingStateCode: payload.data.billingStateCode ?? null,
      idempotencyKey,
      metadata: getRequestMetadata(request),
    });

    return rateLimitedJson(
      {
        ok: true,
        checkout: {
          id: result.checkout.id,
          provider: result.checkout.provider,
          status: result.checkout.status,
          totalMinor: result.checkout.totalMinor,
          currency: result.checkout.currency,
          gstMinor: result.checkout.cgstMinor + result.checkout.sgstMinor + result.checkout.igstMinor,
        },
        payment: result.kind === "stripe_checkout"
          ? { type: "redirect", provider: "stripe", url: result.url }
          : result.kind === "stripe_payment_intent"
            ? { type: "stripe_payment_sheet", provider: "stripe", clientSecret: result.clientSecret, publishableKey: result.publishableKey }
            : result.kind === "razorpay_order"
              ? { type: "razorpay_order", provider: "razorpay", orderId: result.orderId, keyId: result.keyId, amount: result.amount, currency: result.currency }
              : result.kind === "razorpay_subscription"
                ? { type: "razorpay_subscription", provider: "razorpay", subscriptionId: result.subscriptionId, keyId: result.keyId, shortUrl: result.shortUrl }
                : { type: "free", provider: "internal" },
      },
      rateLimit,
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BillingError) {
      return rateLimitedJson({ error: error.message, code: error.code }, rateLimit, { status: error.status });
    }
    reportException(error, { route: "/api/v1/billing/checkout", method: "POST" }, "Checkout initialization failed");
    return rateLimitedJson(
      { error: "Checkout is temporarily unavailable.", code: "CHECKOUT_UNAVAILABLE" },
      rateLimit,
      { status: 503 },
    );
  }
}
