import { createHmac, timingSafeEqual } from "crypto";
import Stripe from "stripe";
import { appOrigin } from "@/lib/identity/mail";

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function createStripeSession(input: {
  checkoutId: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
}) {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    success_url: `${appOrigin()}/billing/success?checkout=${input.checkoutId}`,
    cancel_url: `${appOrigin()}/billing?canceled=1`,
    metadata: { checkoutId: input.checkoutId },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amount,
          product_data: { name: input.name },
        },
      },
    ],
  });
  return { id: session.id, url: session.url };
}

export async function createRazorpayOrder(input: { checkoutId: string; amount: number; currency: string }) {
  if (!razorpayConfigured()) return null;
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      receipt: input.checkoutId,
      notes: { checkoutId: input.checkoutId },
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { id: string };
  return { id: data.id, keyId: process.env.RAZORPAY_KEY_ID };
}

export function verifyStripeSignature(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const stripe = getStripe();
  if (!stripe) return false;
  try {
    stripe.webhooks.constructEvent(rawBody, signature, secret);
    return true;
  } catch {
    return false;
  }
}

export function verifyRazorpaySignature(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
