import "server-only";

import Stripe from "stripe";
import { env, isFeatureConfigured } from "@/lib/env";
import type { BillingPlanKind, CheckoutQuote } from "@/lib/billing/types";

function stripeClient(): Stripe {
  if (!isFeatureConfigured("stripe")) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.");
  }

  return new Stripe(env.STRIPE_SECRET_KEY!);
}

function recurringInterval(interval: string): "day" | "week" | "month" | "year" {
  if (interval === "day" || interval === "week" || interval === "month" || interval === "year") {
    return interval;
  }
  return "month";
}

export async function createStripeCustomer(input: {
  email: string;
  name: string | null;
  userId: string;
  institutionId?: string | null;
}): Promise<{ id: string }> {
  const customer = await stripeClient().customers.create({
    email: input.email,
    name: input.name ?? undefined,
    metadata: {
      userId: input.userId,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    },
  });

  return { id: customer.id };
}

export async function createStripeCheckoutSession(input: {
  checkoutId: string;
  providerCustomerId: string;
  quote: CheckoutQuote;
  userId: string;
  institutionId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const subscription = input.quote.planKind === "subscription";
  const metadata = {
    checkoutId: input.checkoutId,
    userId: input.userId,
    planId: input.quote.planId,
    ...(input.institutionId ? { institutionId: input.institutionId } : {}),
  };

  const session = await stripeClient().checkout.sessions.create({
    mode: subscription ? "subscription" : "payment",
    customer: input.providerCustomerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    billing_address_collection: "required",
    allow_promotion_codes: false,
    metadata,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.quote.currency.toLowerCase(),
          unit_amount: input.quote.totalMinor,
          product_data: {
            name: input.quote.planName,
            description: `NihongoBridge ${input.quote.planCode}`,
          },
          ...(subscription ? { recurring: { interval: recurringInterval(input.quote.interval) } } : {}),
        },
      },
    ],
    ...(subscription ? { subscription_data: { metadata } } : { invoice_creation: { enabled: true } }),
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { id: session.id, url: session.url };
}

export async function createStripePaymentIntent(input: {
  checkoutId: string;
  providerCustomerId: string;
  quote: CheckoutQuote;
  userId: string;
  institutionId?: string | null;
}): Promise<{ id: string; clientSecret: string }> {
  const paymentIntent = await stripeClient().paymentIntents.create({
    amount: input.quote.totalMinor,
    currency: input.quote.currency.toLowerCase(),
    customer: input.providerCustomerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      checkoutId: input.checkoutId,
      userId: input.userId,
      planId: input.quote.planId,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    },
  });

  if (!paymentIntent.client_secret) throw new Error("Stripe did not return a PaymentIntent client secret.");
  return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret };
}

export async function createStripeBillingPortal(input: {
  providerCustomerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const portal = await stripeClient().billingPortal.sessions.create({
    customer: input.providerCustomerId,
    return_url: input.returnUrl,
  });
  return { url: portal.url };
}

export async function createStripeRefund(input: {
  providerPaymentId: string;
  amountMinor?: number;
  reason?: string;
}): Promise<{ id: string; status: string | null }> {
  const isPaymentIntent = input.providerPaymentId.startsWith("pi_");
  const refund = await stripeClient().refunds.create({
    ...(isPaymentIntent
      ? { payment_intent: input.providerPaymentId }
      : { charge: input.providerPaymentId }),
    ...(input.amountMinor ? { amount: input.amountMinor } : {}),
    ...(input.reason ? { reason: input.reason as Stripe.RefundCreateParams.Reason } : {}),
  });

  return { id: refund.id, status: refund.status };
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  if (!isFeatureConfigured("stripe")) throw new Error("Stripe is not configured.");
  return stripeClient().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET!);
}

export function stripeSubscriptionStatus(status: Stripe.Subscription.Status): string {
  return status;
}

export function isStripeSubscriptionKind(kind: BillingPlanKind): boolean {
  return kind === "subscription";
}
