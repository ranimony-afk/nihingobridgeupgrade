import "server-only";

import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billingCheckouts,
  billingCouponRedemptions,
  billingCoupons,
  billingCustomers,
  billingInvoices,
  billingPayments,
  billingPlans,
  billingRefunds,
  billingReferrals,
  billingTaxProfiles,
  billingWebhookEvents,
  institutionMembers,
  institutions,
  referralCodes,
  subscriptions,
  users,
} from "@/db/schema";
import { env, isFeatureConfigured } from "@/lib/env";
import { roleAtLeast } from "@/lib/auth/permissions";
import type { AuthenticatedUser, RequestMetadata } from "@/lib/auth/identity";
import { calculateGst } from "@/lib/billing/tax";
import type {
  BillingClient,
  BillingPlanKind,
  BillingProvider,
  CheckoutQuote,
  TaxBreakdown,
} from "@/lib/billing/types";
import {
  createStripeBillingPortal,
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePaymentIntent,
  createStripeRefund,
} from "@/lib/billing/stripe";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  createRazorpaySubscription,
  verifyRazorpayCheckoutSignature,
  verifyRazorpaySubscriptionSignature,
} from "@/lib/billing/razorpay";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "paid", "free"]);

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BILLING_UNAVAILABLE"
      | "PLAN_NOT_FOUND"
      | "PLAN_UNAVAILABLE"
      | "COUPON_INVALID"
      | "REFERRAL_INVALID"
      | "INVALID_PROVIDER"
      | "CHECKOUT_CONFLICT"
      | "TAX_PROFILE_REQUIRED"
      | "PAYMENT_NOT_FOUND"
      | "REFUND_INVALID"
      | "INSTITUTION_FORBIDDEN",
    public readonly status: number = 400,
  ) {
    super(message);
  }
}

export type BillingPlan = typeof billingPlans.$inferSelect;
export type BillingCheckout = typeof billingCheckouts.$inferSelect;

export async function listActiveBillingPlans(): Promise<BillingPlan[]> {
  return db
    .select()
    .from(billingPlans)
    .where(eq(billingPlans.active, true))
    .orderBy(billingPlans.amountMinor, billingPlans.createdAt);
}

export async function listAllBillingPlans(): Promise<BillingPlan[]> {
  return db.select().from(billingPlans).orderBy(desc(billingPlans.createdAt));
}

export async function createBillingPlan(input: {
  code: string;
  name: string;
  description: string;
  kind: BillingPlanKind;
  interval: string;
  currency: string;
  amountMinor: number;
  gstRateBps: number;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  razorpayPlanId?: string | null;
  active: boolean;
  premium: boolean;
  features: string[];
}): Promise<BillingPlan> {
  const [plan] = await db
    .insert(billingPlans)
    .values({
      ...input,
      code: input.code.trim().toUpperCase(),
      currency: input.currency.trim().toUpperCase(),
      stripePriceId: input.stripePriceId?.trim() || null,
      stripeProductId: input.stripeProductId?.trim() || null,
      razorpayPlanId: input.razorpayPlanId?.trim() || null,
      features: input.features.map((feature) => feature.trim()).filter(Boolean),
    })
    .returning();
  return plan;
}

export async function updateBillingPlan(
  planId: string,
  input: Partial<{
    name: string;
    description: string;
    kind: BillingPlanKind;
    interval: string;
    currency: string;
    amountMinor: number;
    gstRateBps: number;
    stripePriceId: string | null;
    stripeProductId: string | null;
    razorpayPlanId: string | null;
    active: boolean;
    premium: boolean;
    features: string[];
  }>,
): Promise<BillingPlan | null> {
  const [plan] = await db
    .update(billingPlans)
    .set({
      ...input,
      ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
      ...(input.features ? { features: input.features.map((feature) => feature.trim()).filter(Boolean) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(billingPlans.id, planId))
    .returning();
  return plan ?? null;
}

export async function upsertBillingTaxProfile(input: {
  userId: string;
  institutionId?: string | null;
  legalName: string;
  gstin?: string | null;
  stateCode: string;
  billingAddress: Record<string, string>;
}) {
  const values = {
    userId: input.institutionId ? null : input.userId,
    institutionId: input.institutionId ?? null,
    legalName: input.legalName.trim(),
    gstin: input.gstin?.trim().toUpperCase() || null,
    stateCode: input.stateCode.trim().toUpperCase(),
    billingAddress: input.billingAddress,
    updatedAt: new Date(),
  };

  if (input.institutionId) {
    const [profile] = await db
      .insert(billingTaxProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: billingTaxProfiles.institutionId,
        set: values,
      })
      .returning();
    return profile;
  }

  const [profile] = await db
    .insert(billingTaxProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: billingTaxProfiles.userId,
      set: values,
    })
    .returning();
  return profile;
}

export async function createBillingCheckout(input: {
  user: AuthenticatedUser;
  provider: BillingProvider;
  client: BillingClient;
  planId: string;
  institutionId?: string | null;
  couponCode?: string | null;
  referralCode?: string | null;
  billingStateCode?: string | null;
  idempotencyKey: string;
  metadata: RequestMetadata;
}): Promise<
  | { kind: "stripe_checkout"; checkout: BillingCheckout; url: string }
  | { kind: "stripe_payment_intent"; checkout: BillingCheckout; clientSecret: string; publishableKey: string }
  | { kind: "razorpay_order"; checkout: BillingCheckout; orderId: string; amount: number; currency: string; keyId: string }
  | { kind: "razorpay_subscription"; checkout: BillingCheckout; subscriptionId: string; shortUrl: string | null; keyId: string }
  | { kind: "free"; checkout: BillingCheckout }
> {
  const [existing] = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.userId, input.user.id), eq(billingCheckouts.idempotencyKey, input.idempotencyKey)))
    .limit(1);
  if (existing) {
    throw new BillingError("A checkout with this idempotency key already exists. Retrieve its status before retrying.", "CHECKOUT_CONFLICT", 409);
  }

  const plan = await getActivePlan(input.planId);
  await assertInstitutionCheckoutAccess(input.user, input.institutionId ?? null);

  if (input.provider === "razorpay" && plan.kind === "subscription" && (input.couponCode || input.referralCode)) {
    throw new BillingError(
      "Razorpay recurring plans must use provider-managed discounts. Use Stripe for server-priced coupon or referral checkout.",
      "PLAN_UNAVAILABLE",
      400,
    );
  }

  const pricing = await buildQuote({
    userId: input.user.id,
    plan,
    couponCode: input.couponCode,
    referralCode: input.referralCode,
    institutionId: input.institutionId ?? null,
    billingStateCode: input.billingStateCode ?? null,
  });

  const checkout = await reserveCheckout({
    userId: input.user.id,
    institutionId: input.institutionId ?? null,
    plan,
    provider: input.provider,
    client: input.client,
    quote: pricing.quote,
    couponId: pricing.couponId,
    referralCodeId: pricing.referralCodeId,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });

  if (pricing.quote.totalMinor === 0) {
    const paidCheckout = await markFreeCheckoutPaid(checkout.id, pricing.quote, input);
    return { kind: "free", checkout: paidCheckout };
  }

  if (input.provider === "stripe") {
    const customer = await getOrCreateStripeCustomer(input.user, input.institutionId ?? null);
    if (input.client === "flutter" && plan.kind === "one_time") {
      const intent = await createStripePaymentIntent({
        checkoutId: checkout.id,
        providerCustomerId: customer.providerCustomerId,
        quote: pricing.quote,
        userId: input.user.id,
        institutionId: input.institutionId ?? null,
      });
      const updated = await updateCheckoutProviderReference(checkout.id, "stripe", intent.id, customer.providerCustomerId, {
        paymentIntentId: intent.id,
      });
      if (!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
        throw new BillingError("Stripe Flutter payments require NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.", "BILLING_UNAVAILABLE", 503);
      }
      return {
        kind: "stripe_payment_intent",
        checkout: updated,
        clientSecret: intent.clientSecret,
        publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      };
    }

    const successUrl = new URL("/billing/success", env.NEXT_PUBLIC_APP_URL);
    successUrl.searchParams.set("checkout_id", checkout.id);
    const cancelUrl = new URL("/pricing", env.NEXT_PUBLIC_APP_URL);
    const stripeSession = await createStripeCheckoutSession({
      checkoutId: checkout.id,
      providerCustomerId: customer.providerCustomerId,
      quote: pricing.quote,
      userId: input.user.id,
      institutionId: input.institutionId ?? null,
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    });
    const updated = await updateCheckoutProviderReference(checkout.id, "stripe", stripeSession.id, customer.providerCustomerId, {
      checkoutUrl: stripeSession.url,
    });
    return { kind: "stripe_checkout", checkout: updated, url: stripeSession.url };
  }

  if (plan.kind === "subscription") {
    if (!plan.razorpayPlanId) {
      throw new BillingError("This plan is not connected to a Razorpay subscription plan.", "PLAN_UNAVAILABLE", 400);
    }
    const subscription = await createRazorpaySubscription({
      checkoutId: checkout.id,
      razorpayPlanId: plan.razorpayPlanId,
      userId: input.user.id,
      institutionId: input.institutionId ?? null,
    });
    const updated = await updateCheckoutProviderReference(checkout.id, "razorpay", subscription.id, null, {
      shortUrl: subscription.shortUrl,
    });
    return {
      kind: "razorpay_subscription",
      checkout: updated,
      subscriptionId: subscription.id,
      shortUrl: subscription.shortUrl,
      keyId: subscription.keyId,
    };
  }

  const order = await createRazorpayOrder({
    checkoutId: checkout.id,
    quote: pricing.quote,
    userId: input.user.id,
    institutionId: input.institutionId ?? null,
  });
  const updated = await updateCheckoutProviderReference(checkout.id, "razorpay", order.id, null, {});
  return {
    kind: "razorpay_order",
    checkout: updated,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: order.keyId,
  };
}

async function getActivePlan(planId: string): Promise<BillingPlan> {
  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(and(eq(billingPlans.id, planId), eq(billingPlans.active, true)))
    .limit(1);
  if (!plan) throw new BillingError("The selected billing plan is unavailable.", "PLAN_NOT_FOUND", 404);
  if (plan.amountMinor < 0) throw new BillingError("The plan configuration is invalid.", "PLAN_UNAVAILABLE", 500);
  return plan;
}

async function assertInstitutionCheckoutAccess(user: AuthenticatedUser, institutionId: string | null): Promise<void> {
  if (!institutionId) return;
  const [membership] = await db
    .select({ role: institutionMembers.role })
    .from(institutionMembers)
    .where(and(eq(institutionMembers.institutionId, institutionId), eq(institutionMembers.userId, user.id)))
    .limit(1);
  if (!membership || !roleAtLeast(membership.role, "admin")) {
    throw new BillingError("Only institution administrators can manage organization billing.", "INSTITUTION_FORBIDDEN", 403);
  }
}

async function buildQuote(input: {
  userId: string;
  plan: BillingPlan;
  couponCode?: string | null;
  referralCode?: string | null;
  institutionId: string | null;
  billingStateCode: string | null;
}): Promise<{ quote: CheckoutQuote; couponId: string | null; referralCodeId: string | null }> {
  if (input.couponCode && input.referralCode) {
    throw new BillingError("Only one coupon or referral code can be applied to a checkout.", "COUPON_INVALID", 400);
  }

  let discountMinor = 0;
  let couponId: string | null = null;
  let referralCodeId: string | null = null;

  if (input.couponCode) {
    const coupon = await validateCoupon(input.userId, input.plan, input.couponCode);
    couponId = coupon.id;
    discountMinor = coupon.percentOffBps
      ? Math.floor((input.plan.amountMinor * coupon.percentOffBps) / 10_000)
      : Math.min(input.plan.amountMinor, coupon.amountOffMinor ?? 0);
  }

  if (input.referralCode) {
    const referral = await validateReferral(input.userId, input.referralCode);
    referralCodeId = referral.id;
    discountMinor = Math.floor((input.plan.amountMinor * referral.percentOffBps) / 10_000);
  }

  const taxProfile = await findTaxProfile(input.userId, input.institutionId);
  const tax = calculateGst({
    currency: input.plan.currency,
    subtotalMinor: input.plan.amountMinor,
    discountMinor,
    gstRateBps: input.plan.gstRateBps ?? env.GST_DEFAULT_RATE_BPS,
    supplierStateCode: env.GST_SUPPLY_STATE,
    customerStateCode: input.billingStateCode ?? taxProfile?.stateCode ?? null,
  });

  return {
    quote: {
      ...tax,
      planId: input.plan.id,
      planCode: input.plan.code,
      planName: input.plan.name,
      planKind: input.plan.kind as BillingPlanKind,
      interval: input.plan.interval,
      currency: input.plan.currency,
      couponId,
      referralCodeId,
    },
    couponId,
    referralCodeId,
  };
}

async function validateCoupon(userId: string, plan: BillingPlan, code: string) {
  const normalized = code.trim().toUpperCase();
  const [coupon] = await db.select().from(billingCoupons).where(eq(billingCoupons.code, normalized)).limit(1);
  const now = new Date();
  if (
    !coupon ||
    !coupon.active ||
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.expiresAt && coupon.expiresAt <= now) ||
    (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) ||
    (coupon.billingPlanId && coupon.billingPlanId !== plan.id) ||
    (coupon.currency && coupon.currency !== plan.currency) ||
    (!coupon.percentOffBps && !coupon.amountOffMinor)
  ) {
    throw new BillingError("The coupon is invalid for this plan.", "COUPON_INVALID", 400);
  }

  const [priorRedemption] = await db
    .select({ id: billingCouponRedemptions.id })
    .from(billingCouponRedemptions)
    .where(and(eq(billingCouponRedemptions.billingCouponId, coupon.id), eq(billingCouponRedemptions.userId, userId)))
    .limit(1);
  if (priorRedemption) throw new BillingError("This coupon has already been used on this account.", "COUPON_INVALID", 400);
  return coupon;
}

async function validateReferral(userId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  const [referral] = await db.select().from(referralCodes).where(eq(referralCodes.code, normalized)).limit(1);
  const now = new Date();
  if (
    !referral ||
    !referral.active ||
    referral.userId === userId ||
    (referral.expiresAt && referral.expiresAt <= now) ||
    (referral.maxUses !== null && referral.usesCount >= referral.maxUses)
  ) {
    throw new BillingError("The referral code is invalid for this account.", "REFERRAL_INVALID", 400);
  }

  const [priorReferral] = await db
    .select({ id: billingReferrals.id })
    .from(billingReferrals)
    .where(eq(billingReferrals.referredUserId, userId))
    .limit(1);
  if (priorReferral) throw new BillingError("A referral has already been applied to this account.", "REFERRAL_INVALID", 400);
  return referral;
}

async function findTaxProfile(userId: string, institutionId: string | null) {
  const conditions = institutionId
    ? eq(billingTaxProfiles.institutionId, institutionId)
    : eq(billingTaxProfiles.userId, userId);
  const [profile] = await db.select().from(billingTaxProfiles).where(conditions).limit(1);
  return profile ?? null;
}

async function reserveCheckout(input: {
  userId: string;
  institutionId: string | null;
  plan: BillingPlan;
  provider: BillingProvider;
  client: BillingClient;
  quote: CheckoutQuote;
  couponId: string | null;
  referralCodeId: string | null;
  idempotencyKey: string;
  metadata: RequestMetadata;
}): Promise<BillingCheckout> {
  return db.transaction(async (transaction) => {
    const [checkout] = await transaction
      .insert(billingCheckouts)
      .values({
        userId: input.userId,
        institutionId: input.institutionId,
        billingPlanId: input.plan.id,
        provider: input.provider,
        client: input.client,
        currency: input.quote.currency,
        subtotalMinor: input.quote.subtotalMinor,
        discountMinor: input.quote.discountMinor,
        taxableMinor: input.quote.taxableMinor,
        gstRateBps: input.quote.gstRateBps,
        cgstMinor: input.quote.cgstMinor,
        sgstMinor: input.quote.sgstMinor,
        igstMinor: input.quote.igstMinor,
        totalMinor: input.quote.totalMinor,
        billingCouponId: input.couponId,
        referralCodeId: input.referralCodeId,
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        metadata: {
          ipAddress: input.metadata.ipAddress ?? "",
          userAgent: input.metadata.userAgent ?? "",
        },
      })
      .returning();

    if (input.couponId) {
      await transaction.insert(billingCouponRedemptions).values({
        billingCouponId: input.couponId,
        userId: input.userId,
        billingCheckoutId: checkout.id,
        discountMinor: input.quote.discountMinor,
      });
      await transaction
        .update(billingCoupons)
        .set({ redeemedCount: sql`${billingCoupons.redeemedCount} + 1`, updatedAt: new Date() })
        .where(eq(billingCoupons.id, input.couponId));
    }

    if (input.referralCodeId) {
      const [referral] = await transaction
        .select()
        .from(referralCodes)
        .where(eq(referralCodes.id, input.referralCodeId))
        .limit(1);
      if (!referral) throw new BillingError("The referral code is invalid.", "REFERRAL_INVALID", 400);
      await transaction.insert(billingReferrals).values({
        referralCodeId: referral.id,
        referrerUserId: referral.userId,
        referredUserId: input.userId,
        billingCheckoutId: checkout.id,
      });
      await transaction
        .update(referralCodes)
        .set({ usesCount: sql`${referralCodes.usesCount} + 1` })
        .where(eq(referralCodes.id, referral.id));
    }

    return checkout;
  });
}

async function getOrCreateStripeCustomer(user: AuthenticatedUser, institutionId: string | null) {
  const [existing] = await db
    .select()
    .from(billingCustomers)
    .where(
      and(
        eq(billingCustomers.provider, "stripe"),
        eq(billingCustomers.userId, user.id),
        institutionId ? eq(billingCustomers.institutionId, institutionId) : isNull(billingCustomers.institutionId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  if (!user.email) throw new BillingError("A verified billing email is required.", "BILLING_UNAVAILABLE", 400);
  const providerCustomer = await createStripeCustomer({
    email: user.email,
    name: user.name,
    userId: user.id,
    institutionId,
  });
  const [customer] = await db
    .insert(billingCustomers)
    .values({
      userId: user.id,
      institutionId,
      provider: "stripe",
      providerCustomerId: providerCustomer.id,
      email: user.email,
    })
    .returning();
  return customer;
}

async function updateCheckoutProviderReference(
  checkoutId: string,
  provider: BillingProvider,
  providerCheckoutId: string,
  providerCustomerId: string | null,
  extraMetadata: Record<string, unknown>,
): Promise<BillingCheckout> {
  const [checkout] = await db
    .update(billingCheckouts)
    .set({
      provider,
      providerCheckoutId,
      providerCustomerId,
      status: "pending_payment",
      metadata: extraMetadata,
      updatedAt: new Date(),
    })
    .where(eq(billingCheckouts.id, checkoutId))
    .returning();
  if (!checkout) throw new Error("Checkout record was not found after provider creation.");
  return checkout;
}

async function markFreeCheckoutPaid(
  checkoutId: string,
  quote: CheckoutQuote,
  input: { user: AuthenticatedUser; institutionId?: string | null },
): Promise<BillingCheckout> {
  const [checkout] = await db
    .update(billingCheckouts)
    .set({ status: "paid", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(billingCheckouts.id, checkoutId))
    .returning();
  if (!checkout) throw new Error("Checkout record was not found.");

  await provisionPaidCheckout(checkout, quote, "internal", `free_${checkout.id}`);
  return checkout;
}

export async function provisionPaidCheckout(
  checkout: BillingCheckout,
  quote: CheckoutQuote,
  provider: string,
  providerPaymentId: string,
  input?: { providerSubscriptionId?: string | null; providerCustomerId?: string | null; providerInvoiceId?: string | null },
): Promise<void> {
  await db.transaction(async (transaction) => {
    const [plan] = await transaction.select().from(billingPlans).where(eq(billingPlans.id, checkout.billingPlanId)).limit(1);
    if (!plan) throw new Error("Checkout plan no longer exists.");

    let subscriptionId: string | null = null;
    if (plan.kind === "subscription") {
      const [existing] = input?.providerSubscriptionId
        ? await transaction
            .select()
            .from(subscriptions)
            .where(and(eq(subscriptions.provider, provider), eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId)))
            .limit(1)
        : [];

      const subscriptionValues = {
        userId: checkout.userId,
        institutionId: checkout.institutionId,
        billingPlanId: plan.id,
        provider,
        providerCustomerId: input?.providerCustomerId ?? checkout.providerCustomerId,
        providerSubscriptionId: input?.providerSubscriptionId ?? null,
        plan: plan.code,
        status: "active",
        currentPeriodEndsAt: plan.kind === "subscription" ? inferPeriodEnd(plan.interval) : null,
        metadata: { checkoutId: checkout.id },
        updatedAt: new Date(),
      };

      if (existing) {
        const [updated] = await transaction
          .update(subscriptions)
          .set(subscriptionValues)
          .where(eq(subscriptions.id, existing.id))
          .returning({ id: subscriptions.id });
        subscriptionId = updated?.id ?? null;
      } else {
        const [created] = await transaction.insert(subscriptions).values(subscriptionValues).returning({ id: subscriptions.id });
        subscriptionId = created?.id ?? null;
      }
    }

    const [invoice] = await transaction
      .insert(billingInvoices)
      .values({
        subscriptionId,
        billingCheckoutId: checkout.id,
        userId: checkout.userId,
        institutionId: checkout.institutionId,
        provider,
        providerInvoiceId: input?.providerInvoiceId ?? null,
        invoiceNumber: `NB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${checkout.id.slice(0, 8).toUpperCase()}`,
        status: "paid",
        currency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        discountMinor: quote.discountMinor,
        taxableMinor: quote.taxableMinor,
        gstRateBps: quote.gstRateBps,
        cgstMinor: quote.cgstMinor,
        sgstMinor: quote.sgstMinor,
        igstMinor: quote.igstMinor,
        totalMinor: quote.totalMinor,
        amountPaidMinor: quote.totalMinor,
        paidAt: new Date(),
        metadata: { planCode: quote.planCode },
      })
      .returning();

    await transaction
      .insert(billingPayments)
      .values({
        billingCheckoutId: checkout.id,
        billingInvoiceId: invoice.id,
        provider,
        providerPaymentId,
        status: "paid",
        currency: quote.currency,
        amountMinor: quote.totalMinor,
        capturedAt: new Date(),
      })
      .onConflictDoNothing({ target: [billingPayments.provider, billingPayments.providerPaymentId] });

    await transaction
      .update(billingCheckouts)
      .set({ status: "paid", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(billingCheckouts.id, checkout.id));

    if (checkout.referralCodeId) {
      await transaction
        .update(billingReferrals)
        .set({ status: "rewarded", rewardedAt: new Date() })
        .where(eq(billingReferrals.billingCheckoutId, checkout.id));
    }
  });
}

function inferPeriodEnd(interval: string): Date {
  const now = new Date();
  if (interval === "year") now.setFullYear(now.getFullYear() + 1);
  else if (interval === "week") now.setDate(now.getDate() + 7);
  else if (interval === "day") now.setDate(now.getDate() + 1);
  else now.setMonth(now.getMonth() + 1);
  return now;
}

export async function verifyRazorpayCheckoutPayment(input: {
  userId: string;
  checkoutId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const [checkout] = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.id, input.checkoutId), eq(billingCheckouts.userId, input.userId), eq(billingCheckouts.provider, "razorpay")))
    .limit(1);
  if (!checkout || checkout.providerCheckoutId !== input.orderId) return false;

  const verified = verifyRazorpayCheckoutSignature({
    serverOrderId: checkout.providerCheckoutId,
    paymentId: input.paymentId,
    signature: input.signature,
  });
  if (!verified) return false;

  await db
    .update(billingCheckouts)
    .set({ status: "payment_verification_pending", updatedAt: new Date() })
    .where(eq(billingCheckouts.id, checkout.id));
  return true;
}

export async function verifyRazorpaySubscriptionPayment(input: {
  userId: string;
  checkoutId: string;
  subscriptionId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const [checkout] = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.id, input.checkoutId), eq(billingCheckouts.userId, input.userId), eq(billingCheckouts.provider, "razorpay")))
    .limit(1);
  if (!checkout || checkout.providerCheckoutId !== input.subscriptionId) return false;

  const verified = verifyRazorpaySubscriptionSignature({
    serverSubscriptionId: checkout.providerCheckoutId,
    paymentId: input.paymentId,
    signature: input.signature,
  });
  if (!verified) return false;

  await db
    .update(billingCheckouts)
    .set({ status: "payment_verification_pending", updatedAt: new Date() })
    .where(eq(billingCheckouts.id, checkout.id));
  return true;
}

export async function createBillingPortal(user: AuthenticatedUser): Promise<{ url: string }> {
  const [customer] = await db
    .select()
    .from(billingCustomers)
    .where(and(eq(billingCustomers.userId, user.id), eq(billingCustomers.provider, "stripe")))
    .limit(1);
  if (!customer) throw new BillingError("No Stripe billing customer was found for this account.", "PAYMENT_NOT_FOUND", 404);
  return createStripeBillingPortal({
    providerCustomerId: customer.providerCustomerId,
    returnUrl: new URL("/account/billing", env.NEXT_PUBLIC_APP_URL).toString(),
  });
}

export async function requestRefund(input: {
  paymentId: string;
  amountMinor?: number;
  reason?: string;
  actorUserId: string;
}): Promise<typeof billingRefunds.$inferSelect> {
  const [payment] = await db
    .select({ payment: billingPayments, checkout: billingCheckouts })
    .from(billingPayments)
    .innerJoin(billingCheckouts, eq(billingPayments.billingCheckoutId, billingCheckouts.id))
    .where(eq(billingPayments.id, input.paymentId))
    .limit(1);
  if (!payment) throw new BillingError("Payment record was not found.", "PAYMENT_NOT_FOUND", 404);
  if (input.amountMinor && (input.amountMinor <= 0 || input.amountMinor > payment.payment.amountMinor)) {
    throw new BillingError("Refund amount is invalid.", "REFUND_INVALID", 400);
  }

  const amountMinor = input.amountMinor ?? payment.payment.amountMinor;
  const providerRefund = payment.payment.provider === "stripe"
    ? await createStripeRefund({ providerPaymentId: payment.payment.providerPaymentId, amountMinor, reason: input.reason })
    : payment.payment.provider === "razorpay"
      ? await createRazorpayRefund({ providerPaymentId: payment.payment.providerPaymentId, amountMinor, notes: { actorUserId: input.actorUserId } })
      : null;
  if (!providerRefund) throw new BillingError("This payment provider cannot issue refunds.", "REFUND_INVALID", 400);

  const [refund] = await db
    .insert(billingRefunds)
    .values({
      billingPaymentId: payment.payment.id,
      provider: payment.payment.provider,
      providerRefundId: providerRefund.id,
      status: providerRefund.status ?? "pending",
      amountMinor,
      reason: input.reason ?? null,
      metadata: { requestedBy: input.actorUserId },
    })
    .returning();
  return refund;
}

export async function getBillingSummary(userId: string) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);
  const invoices = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.userId, userId))
    .orderBy(desc(billingInvoices.createdAt))
    .limit(25);
  const checkouts = await db
    .select()
    .from(billingCheckouts)
    .where(eq(billingCheckouts.userId, userId))
    .orderBy(desc(billingCheckouts.createdAt))
    .limit(10);
  return { subscription: subscription ?? null, invoices, checkouts };
}

export async function claimWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ process: boolean; id: number }> {
  const [existing] = await db
    .select()
    .from(billingWebhookEvents)
    .where(and(eq(billingWebhookEvents.provider, input.provider), eq(billingWebhookEvents.providerEventId, input.providerEventId)))
    .limit(1);
  if (existing?.status === "processed") return { process: false, id: existing.id };
  if (existing) {
    const [updated] = await db
      .update(billingWebhookEvents)
      .set({ status: "received", processingError: null })
      .where(eq(billingWebhookEvents.id, existing.id))
      .returning({ id: billingWebhookEvents.id });
    return { process: true, id: updated!.id };
  }

  const [created] = await db
    .insert(billingWebhookEvents)
    .values(input)
    .returning({ id: billingWebhookEvents.id });
  return { process: true, id: created.id };
}

export async function finishWebhookEvent(id: number, error?: string): Promise<void> {
  await db
    .update(billingWebhookEvents)
    .set({
      status: error ? "failed" : "processed",
      processingError: error ?? null,
      processedAt: error ? null : new Date(),
    })
    .where(eq(billingWebhookEvents.id, id));
}

export async function syncProviderSubscription(input: {
  provider: string;
  providerSubscriptionId: string;
  providerCustomerId?: string | null;
  checkoutId?: string | null;
  status: string;
  currentPeriodEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  planId?: string | null;
  userId?: string | null;
  institutionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const [checkout] = input.checkoutId
    ? await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, input.checkoutId)).limit(1)
    : [];
  const planId = input.planId ?? checkout?.billingPlanId;
  const userId = input.userId ?? checkout?.userId;
  if (!planId || !userId) return;
  const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, planId)).limit(1);
  if (!plan) return;

  const values = {
    userId,
    institutionId: input.institutionId ?? checkout?.institutionId ?? null,
    billingPlanId: plan.id,
    provider: input.provider,
    providerCustomerId: input.providerCustomerId ?? checkout?.providerCustomerId ?? null,
    providerSubscriptionId: input.providerSubscriptionId,
    plan: plan.code,
    status: input.status,
    currentPeriodEndsAt: input.currentPeriodEndsAt ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    metadata: input.metadata ?? {},
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, input.provider), eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId)))
    .limit(1);
  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values(values);
  }
}

export async function findCheckoutByProviderReference(provider: string, providerCheckoutId: string): Promise<BillingCheckout | null> {
  const [checkout] = await db
    .select()
    .from(billingCheckouts)
    .where(and(eq(billingCheckouts.provider, provider), eq(billingCheckouts.providerCheckoutId, providerCheckoutId)))
    .limit(1);
  return checkout ?? null;
}

async function quoteFromCheckout(checkout: BillingCheckout): Promise<CheckoutQuote> {
  const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, checkout.billingPlanId)).limit(1);
  if (!plan) throw new Error("Billing plan is missing for checkout reconciliation.");

  return {
    planId: plan.id,
    planCode: plan.code,
    planName: plan.name,
    planKind: plan.kind as BillingPlanKind,
    interval: plan.interval,
    currency: checkout.currency,
    couponId: checkout.billingCouponId,
    referralCodeId: checkout.referralCodeId,
    subtotalMinor: checkout.subtotalMinor,
    discountMinor: checkout.discountMinor,
    taxableMinor: checkout.taxableMinor,
    gstRateBps: checkout.gstRateBps,
    cgstMinor: checkout.cgstMinor,
    sgstMinor: checkout.sgstMinor,
    igstMinor: checkout.igstMinor,
    gstMinor: checkout.cgstMinor + checkout.sgstMinor + checkout.igstMinor,
    totalMinor: checkout.totalMinor,
  };
}

export async function settleProviderPayment(input: {
  provider: string;
  providerCheckoutId: string;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  providerInvoiceId?: string | null;
}): Promise<void> {
  const [alreadyRecorded] = await db
    .select({ id: billingPayments.id })
    .from(billingPayments)
    .where(and(eq(billingPayments.provider, input.provider), eq(billingPayments.providerPaymentId, input.providerPaymentId)))
    .limit(1);
  if (alreadyRecorded) return;

  const checkout = await findCheckoutByProviderReference(input.provider, input.providerCheckoutId);
  if (!checkout) return;
  const quote = await quoteFromCheckout(checkout);

  await provisionPaidCheckout(checkout, quote, input.provider, input.providerPaymentId, {
    providerSubscriptionId: input.providerSubscriptionId,
    providerCustomerId: input.providerCustomerId,
    providerInvoiceId: input.providerInvoiceId,
  });
}

export async function syncProviderInvoice(input: {
  provider: string;
  providerInvoiceId: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  status: string;
  amountPaidMinor: number;
  amountDueMinor: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  dueAt?: Date | null;
  paidAt?: Date | null;
}): Promise<void> {
  const [subscription] = input.providerSubscriptionId
    ? await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.provider, input.provider), eq(subscriptions.providerSubscriptionId, input.providerSubscriptionId)))
        .limit(1)
    : [];
  if (!subscription) return;

  const [existing] = await db
    .select()
    .from(billingInvoices)
    .where(and(eq(billingInvoices.provider, input.provider), eq(billingInvoices.providerInvoiceId, input.providerInvoiceId)))
    .limit(1);

  const values = {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    institutionId: subscription.institutionId,
    provider: input.provider,
    providerInvoiceId: input.providerInvoiceId,
    status: input.status,
    currency: input.currency.toUpperCase(),
    subtotalMinor: input.amountDueMinor,
    discountMinor: 0,
    taxableMinor: input.amountDueMinor,
    gstRateBps: 0,
    cgstMinor: 0,
    sgstMinor: 0,
    igstMinor: 0,
    totalMinor: input.amountDueMinor,
    amountPaidMinor: input.amountPaidMinor,
    hostedInvoiceUrl: input.hostedInvoiceUrl ?? null,
    invoicePdfUrl: input.invoicePdfUrl ?? null,
    dueAt: input.dueAt ?? null,
    paidAt: input.paidAt ?? null,
    metadata: { providerCustomerId: input.providerCustomerId ?? null },
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(billingInvoices).set(values).where(eq(billingInvoices.id, existing.id));
  } else {
    await db.insert(billingInvoices).values(values);
  }

  await db
    .update(subscriptions)
    .set({ latestInvoiceReference: input.providerInvoiceId, updatedAt: new Date() })
    .where(eq(subscriptions.id, subscription.id));
}

export async function syncProviderRefund(input: {
  provider: string;
  providerRefundId: string;
  providerPaymentId?: string | null;
  status: string;
  amountMinor?: number | null;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(billingRefunds)
    .where(and(eq(billingRefunds.provider, input.provider), eq(billingRefunds.providerRefundId, input.providerRefundId)))
    .limit(1);
  if (existing) {
    await db.update(billingRefunds).set({ status: input.status, updatedAt: new Date() }).where(eq(billingRefunds.id, existing.id));
    return;
  }
  if (!input.providerPaymentId) return;

  const [payment] = await db
    .select()
    .from(billingPayments)
    .where(and(eq(billingPayments.provider, input.provider), eq(billingPayments.providerPaymentId, input.providerPaymentId)))
    .limit(1);
  if (!payment) return;
  await db.insert(billingRefunds).values({
    billingPaymentId: payment.id,
    provider: input.provider,
    providerRefundId: input.providerRefundId,
    status: input.status,
    amountMinor: input.amountMinor ?? payment.amountMinor,
  });
}

export async function getOrCreateReferralCode(userId: string): Promise<typeof referralCodes.$inferSelect> {
  const [existing] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `KOTO-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    try {
      const [created] = await db.insert(referralCodes).values({ userId, code }).returning();
      return created;
    } catch {
      // A unique-code collision is retried with a fresh random value.
    }
  }

  throw new BillingError("A referral code could not be generated. Please retry.", "BILLING_UNAVAILABLE", 503);
}

export async function getAdminBillingOverview() {
  const [checkoutCounts] = await db
    .select({
      paid: sql<number>`count(*) filter (where ${billingCheckouts.status} = 'paid')`,
      pending: sql<number>`count(*) filter (where ${billingCheckouts.status} in ('created', 'pending_payment', 'payment_verification_pending'))`,
    })
    .from(billingCheckouts);
  const [revenue] = await db
    .select({ totalMinor: sql<number>`coalesce(sum(${billingPayments.amountMinor}) filter (where ${billingPayments.status} = 'paid'), 0)` })
    .from(billingPayments);
  const [refundTotal] = await db
    .select({ totalMinor: sql<number>`coalesce(sum(${billingRefunds.amountMinor}) filter (where ${billingRefunds.status} in ('processed', 'succeeded')), 0)` })
    .from(billingRefunds);
  const activeSubscriptions = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(or(eq(subscriptions.status, "active"), eq(subscriptions.status, "trialing")));
  const latestInvoices = await db.select().from(billingInvoices).orderBy(desc(billingInvoices.createdAt)).limit(12);

  return {
    metrics: {
      paidCheckouts: Number(checkoutCounts?.paid ?? 0),
      pendingCheckouts: Number(checkoutCounts?.pending ?? 0),
      revenueMinor: Number(revenue?.totalMinor ?? 0),
      refundsMinor: Number(refundTotal?.totalMinor ?? 0),
      activeSubscriptions: Number(activeSubscriptions[0]?.count ?? 0),
    },
    invoices: latestInvoices,
  };
}

export function isPremiumActive(status: string): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}
