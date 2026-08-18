import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  billingCheckouts,
  billingCoupons,
  billingInvoices,
  billingInvoiceLines,
  billingPlans,
  billingProfiles,
  billingRefunds,
  billingSubscriptions,
  billingWebhookEvents,
  identityUsers,
} from "@/db/schema";
import { enqueueMail } from "@/lib/identity/mail";
import { uid } from "@/lib/utils";
import { formatMoney, GSTIN, quotePrice } from "./gst";

export const PLANS = [
  { id: "plan-plus-month-usd", slug: "plus-monthly-usd", name: "Plus monthly", interval: "month", currency: "usd", amount: 999, entitles: "plus" },
  { id: "plan-plus-year-usd", slug: "plus-annual-usd", name: "Plus annual", interval: "year", currency: "usd", amount: 7900, entitles: "plus" },
  { id: "plan-plus-month-inr", slug: "plus-monthly-inr", name: "Plus monthly (IN)", interval: "month", currency: "inr", amount: 79900, entitles: "plus" },
  { id: "plan-inst-usd", slug: "institution-usd", name: "Institution seat", interval: "month", currency: "usd", amount: 2900, entitles: "institution" },
  { id: "plan-inst-inr", slug: "institution-inr", name: "Institution seat (IN)", interval: "month", currency: "inr", amount: 249900, entitles: "institution" },
];

export const COUPONS = [
  { id: "cpn-save20", code: "SAVE20", kind: "percent", percentOff: 20, amountOff: null },
  { id: "cpn-launch", code: "NIHONGO10", kind: "amount", percentOff: null, amountOff: 1000 },
];

function referralCodeFor(userId: string) {
  return `REFER-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}`;
}

export async function ensureBillingProfile(userId: string) {
  const [existing] = await db.select().from(billingProfiles).where(eq(billingProfiles.userId, userId));
  if (existing) return existing;
  const code = referralCodeFor(userId);
  await db.insert(billingProfiles).values({ userId, referralCode: code, creditPaise: 0 });
  const [row] = await db.select().from(billingProfiles).where(eq(billingProfiles.userId, userId));
  return row!;
}

export async function listPlans() {
  return db.select().from(billingPlans);
}

export async function resolveCoupon(codeRaw: string | undefined) {
  if (!codeRaw) return null;
  const code = codeRaw.trim().toUpperCase();
  if (code.startsWith("REFER-")) {
    const [profile] = await db.select().from(billingProfiles).where(eq(billingProfiles.referralCode, code));
    if (!profile) return { ok: false as const, error: "Unknown referral" };
    return { ok: true as const, kind: "referral" as const, code, amountOff: 1000, percentOff: 0, referrerId: profile.userId };
  }
  if (code.startsWith("AFFILIATE-")) {
    return { ok: true as const, kind: "affiliate" as const, code, percentOff: 15, amountOff: 0 };
  }
  const [coupon] = await db.select().from(billingCoupons).where(eq(billingCoupons.code, code));
  if (!coupon || !coupon.active) return { ok: false as const, error: "Invalid coupon" };
  if (coupon.maxRedemptions != null && coupon.redeemed >= coupon.maxRedemptions) {
    return { ok: false as const, error: "Coupon exhausted" };
  }
  return {
    ok: true as const,
    kind: "coupon" as const,
    code: coupon.code,
    percentOff: coupon.percentOff ?? 0,
    amountOff: coupon.amountOff ?? 0,
  };
}

export async function quoteCheckout(input: { planId: string; coupon?: string; userId?: string }) {
  const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, input.planId));
  if (!plan || !plan.active) throw new Error("Unknown plan");
  const coupon = await resolveCoupon(input.coupon);
  if (coupon && "error" in coupon) throw new Error(coupon.error);
  let credit = 0;
  if (input.userId) {
    const profile = await ensureBillingProfile(input.userId);
    credit = plan.currency === "inr" ? profile.creditPaise : Math.round(profile.creditPaise / 80);
  }
  const quote = quotePrice({
    currency: plan.currency,
    listPrice: plan.amount,
    percentOff: coupon?.percentOff,
    amountOff: coupon?.amountOff,
    credit,
  });
  return { plan, coupon, quote };
}

export async function createCheckout(input: {
  userId: string;
  planId: string;
  provider: "stripe" | "razorpay" | "sandbox";
  coupon?: string;
}) {
  const { plan, coupon, quote } = await quoteCheckout({ ...input, userId: input.userId });
  const id = uid("chk");
  await db.insert(billingCheckouts).values({
    id,
    userId: input.userId,
    planId: plan.id,
    provider: input.provider,
    status: "open",
    couponCode: coupon?.code ?? null,
    referralCode: coupon?.kind === "referral" ? coupon.code : null,
    currency: plan.currency,
    subtotal: quote.listPrice,
    discount: quote.discount + quote.credit,
    tax: quote.tax,
    total: quote.total,
  });
  return { id, plan, quote, coupon };
}

export async function fulfillCheckout(checkoutId: string, providerRef?: string) {
  const [checkout] = await db.select().from(billingCheckouts).where(eq(billingCheckouts.id, checkoutId));
  if (!checkout) throw new Error("Checkout missing");
  if (checkout.status === "paid") return { already: true, checkout };
  const [plan] = await db.select().from(billingPlans).where(eq(billingPlans.id, checkout.planId));
  if (!plan) throw new Error("Plan missing");

  await db.update(billingCheckouts).set({ status: "paid", providerRef: providerRef ?? checkout.providerRef }).where(eq(billingCheckouts.id, checkout.id));
  const periodMs = plan.interval === "year" ? 365 * 86400000 : 30 * 86400000;
  await db.insert(billingSubscriptions).values({
    id: uid("sub"),
    userId: checkout.userId,
    planId: plan.id,
    status: "active",
    provider: checkout.provider,
    currentPeriodEnd: new Date(Date.now() + periodMs),
  });
  await db.update(identityUsers).set({ plan: plan.entitles, planExpiresAt: new Date(Date.now() + periodMs) }).where(eq(identityUsers.id, checkout.userId));

  if (checkout.couponCode) {
    const [coupon] = await db.select().from(billingCoupons).where(eq(billingCoupons.code, checkout.couponCode));
    if (coupon) {
      await db.update(billingCoupons).set({ redeemed: coupon.redeemed + 1 }).where(eq(billingCoupons.id, coupon.id));
    }
  }
  if (checkout.referralCode) {
    const [referrer] = await db.select().from(billingProfiles).where(eq(billingProfiles.referralCode, checkout.referralCode));
    if (referrer) {
      await db.update(billingProfiles).set({ creditPaise: referrer.creditPaise + 1000 }).where(eq(billingProfiles.userId, referrer.userId));
    }
  }

  const number = `NB-${new Date().getUTCFullYear()}-${checkout.id.slice(-6).toUpperCase()}`;
  const invoiceId = uid("inv");
  await db.insert(billingInvoices).values({
    id: invoiceId,
    userId: checkout.userId,
    checkoutId: checkout.id,
    number,
    currency: checkout.currency,
    subtotal: checkout.subtotal - checkout.discount,
    tax: checkout.tax,
    cgst: checkout.currency === "inr" ? Math.floor(checkout.tax / 2) : 0,
    sgst: checkout.currency === "inr" ? checkout.tax - Math.floor(checkout.tax / 2) : 0,
    total: checkout.total,
    gstin: checkout.currency === "inr" ? GSTIN : null,
    status: "paid",
  });
  await db.insert(billingInvoiceLines).values({
    id: uid("inl"),
    invoiceId,
    description: plan.name,
    amount: checkout.total,
  });
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, checkout.userId));
  if (user) {
    await enqueueMail({
      to: user.email,
      subject: `Invoice ${number}`,
      body: `Thanks for subscribing to ${plan.name}. Total ${formatMoney(checkout.total, checkout.currency)}.`,
      kind: "invoice",
    });
  }
  return { already: false, checkout, invoiceId, number };
}

export async function refundInvoice(invoiceId: string, reason: string) {
  const [invoice] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoiceId));
  if (!invoice) throw new Error("Invoice missing");
  await db.insert(billingRefunds).values({
    id: uid("rfd"),
    invoiceId,
    amount: invoice.total,
    reason,
    status: "succeeded",
  });
  await db.update(billingInvoices).set({ status: "refunded" }).where(eq(billingInvoices.id, invoiceId));
  await db.update(identityUsers).set({ plan: "free" }).where(eq(identityUsers.id, invoice.userId));
  return { ok: true };
}

export async function recordWebhook(provider: string, eventType: string, payload: Record<string, unknown>) {
  await db.insert(billingWebhookEvents).values({
    id: uid("whk"),
    provider,
    eventType,
    payload,
    processed: true,
  });
}

export async function billingSnapshot(userId: string) {
  const profile = await ensureBillingProfile(userId);
  const [subscription] = await db
    .select()
    .from(billingSubscriptions)
    .where(and(eq(billingSubscriptions.userId, userId), eq(billingSubscriptions.status, "active")))
    .orderBy(desc(billingSubscriptions.createdAt));
  const invoices = await db.select().from(billingInvoices).where(eq(billingInvoices.userId, userId)).orderBy(desc(billingInvoices.createdAt));
  const plans = await listPlans();
  return { profile, subscription: subscription ?? null, invoices, plans };
}

export async function adminBilling() {
  const [subscriptions, invoices, coupons, refunds, webhooks] = await Promise.all([
    db.select().from(billingSubscriptions).orderBy(desc(billingSubscriptions.createdAt)),
    db.select().from(billingInvoices).orderBy(desc(billingInvoices.createdAt)),
    db.select().from(billingCoupons),
    db.select().from(billingRefunds).orderBy(desc(billingRefunds.createdAt)),
    db.select().from(billingWebhookEvents).orderBy(desc(billingWebhookEvents.createdAt)).limit(20),
  ]);
  return { subscriptions, invoices, coupons, refunds, webhooks };
}

export async function getInvoice(id: string) {
  const [invoice] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id));
  if (!invoice) return null;
  const lines = await db.select().from(billingInvoiceLines).where(eq(billingInvoiceLines.invoiceId, id));
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, invoice.userId));
  return { invoice, lines, user };
}
