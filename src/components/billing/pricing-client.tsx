"use client";

import { useState } from "react";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: string;
  interval: string;
  currency: string;
  amountMinor: number;
  gstRateBps: number;
  premium: boolean;
  features: string[];
};

type PricingClientProps = { plans: Plan[]; locked: boolean };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function displayPrice(plan: Plan): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: plan.currency }).format(plan.amountMinor / 100);
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay Checkout did not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay Checkout did not load."));
    document.body.appendChild(script);
  });
}

export function PricingClient({ plans, locked }: PricingClientProps) {
  const [provider, setProvider] = useState<"stripe" | "razorpay">("stripe");
  const [couponCode, setCouponCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [billingStateCode, setBillingStateCode] = useState("");
  const [message, setMessage] = useState<string | null>(locked ? "Premium content is locked until you activate a plan." : null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  async function verifyRazorpay(checkoutId: string, response: Record<string, string>, subscription = false) {
    const payload = subscription
      ? {
          checkoutId,
          razorpaySubscriptionId: response.razorpay_subscription_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        }
      : {
          checkoutId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        };
    const verification = await fetch("/api/v1/billing/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await verification.json()) as { message?: string; error?: string };
    setMessage(verification.ok ? body.message ?? "Payment verification is pending provider confirmation." : body.error ?? "Payment verification failed.");
  }

  async function startCheckout(plan: Plan) {
    setMessage(null);
    setPendingPlanId(plan.id);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          planId: plan.id,
          provider,
          client: "web",
          couponCode: couponCode || undefined,
          referralCode: referralCode || undefined,
          billingStateCode: billingStateCode || undefined,
          idempotencyKey,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        payment?: { type: string; url?: string; orderId?: string; subscriptionId?: string; keyId?: string; amount?: number; currency?: string };
        checkout?: { id: string };
      };
      if (!response.ok || !body.payment || !body.checkout) {
        setMessage(body.error ?? "Checkout could not be started.");
        return;
      }

      if (body.payment.type === "redirect" && body.payment.url) {
        window.location.assign(body.payment.url);
        return;
      }
      if (body.payment.type === "free") {
        setMessage("Your plan has been activated.");
        return;
      }
      if ((body.payment.type === "razorpay_order" || body.payment.type === "razorpay_subscription") && body.payment.keyId) {
        await loadRazorpayScript();
        if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");
        const isSubscription = body.payment.type === "razorpay_subscription";
        const razorpay = new window.Razorpay({
          key: body.payment.keyId,
          amount: body.payment.amount,
          currency: body.payment.currency,
          name: "NihongoBridge",
          description: plan.name,
          ...(isSubscription ? { subscription_id: body.payment.subscriptionId } : { order_id: body.payment.orderId }),
          handler: (paymentResult: Record<string, string>) => {
            void verifyRazorpay(body.checkout!.id, paymentResult, isSubscription);
          },
          modal: { ondismiss: () => setMessage("Checkout was dismissed. No premium access has been granted.") },
          prefill: {},
          theme: { color: "#277a5c" },
        });
        razorpay.open();
        return;
      }

      setMessage("This checkout flow is available in the NihongoBridge mobile app.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not be started.");
    } finally {
      setPendingPlanId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-extrabold tracking-[0.16em] text-[#277a5c]">NIHONGOBRIDGE PREMIUM</p><h1 className="mt-2 font-serif text-5xl font-normal tracking-tight text-[#18231d]">Invest in every bridge you build.</h1><p className="mt-4 text-sm leading-6 text-[#657166]">Secure billing, clear GST totals, instant provider checkout, and premium access only after verified payment events.</p></div>
      {message && <p role="status" className="mx-auto mt-6 max-w-2xl rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}
      <div className="mx-auto mt-8 grid max-w-2xl gap-3 rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-4 sm:grid-cols-3"><label className="text-xs font-bold text-[#415247]">Provider<select value={provider} onChange={(event) => setProvider(event.target.value as "stripe" | "razorpay")} className="mt-1.5 w-full rounded-lg border border-[#cdd7ca] bg-white px-2 py-2 text-sm"><option value="stripe">Stripe</option><option value="razorpay">Razorpay</option></select></label><label className="text-xs font-bold text-[#415247]">Coupon<select value={couponCode} onChange={(event) => setCouponCode(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[#cdd7ca] bg-white px-2 py-2 text-sm"><option value="">No coupon</option></select><input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Enter code" className="mt-1 w-full rounded-lg border border-[#cdd7ca] bg-white px-2 py-2 text-sm" /></label><label className="text-xs font-bold text-[#415247]">GST state code<input value={billingStateCode} onChange={(event) => setBillingStateCode(event.target.value.toUpperCase())} placeholder="e.g. KA" maxLength={3} className="mt-1.5 w-full rounded-lg border border-[#cdd7ca] bg-white px-2 py-2 text-sm" /><span className="mt-1 block font-normal text-[#748076]">Use your billing state for GST split.</span></label></div>
      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{plans.map((plan) => <article className="flex flex-col rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-6 shadow-[0_10px_28px_rgba(40,59,43,0.05)]" key={plan.id}><p className="text-xs font-extrabold tracking-[0.14em] text-[#277a5c]">{plan.kind === "subscription" ? plan.interval.toUpperCase() : "ONE TIME"}</p><h2 className="mt-2 font-serif text-3xl font-normal text-[#18231d]">{plan.name}</h2><p className="mt-3 min-h-12 text-sm leading-6 text-[#657166]">{plan.description}</p><p className="mt-6 font-serif text-4xl text-[#18231d]">{displayPrice(plan)}<span className="font-sans text-sm text-[#748076]">/{plan.kind === "subscription" ? plan.interval : "access"}</span></p><p className="mt-2 text-xs text-[#748076]">GST rate: {(plan.gstRateBps / 100).toFixed(2)}% · final tax shown at checkout</p><ul className="mt-5 space-y-2 text-sm text-[#415247]">{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button type="button" onClick={() => void startCheckout(plan)} disabled={pendingPlanId === plan.id} className="mt-7 rounded-xl bg-[#277a5c] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">{pendingPlanId === plan.id ? "Preparing secure checkout…" : "Choose this plan"}</button></article>)}{plans.length === 0 && <section className="col-span-full rounded-2xl border border-dashed border-[#cdd7ca] bg-[#fbfcf7] p-8 text-center text-sm text-[#657166]">No billing plans are currently available. An administrator can publish plans from the billing dashboard.</section>}</div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-[#748076]">Premium access is provisioned from verified Stripe or Razorpay webhooks, never from a browser redirect alone.</p>
    </div>
  );
}
