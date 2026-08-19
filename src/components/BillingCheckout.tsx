"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/billing/gst";

type Plan = { id: string; name: string; interval: string; currency: string; amount: number; entitles: string };

export function BillingCheckout({
  plans,
  providers,
  referralCode,
}: {
  plans: Plan[];
  providers: { stripe: boolean; razorpay: boolean; sandbox: boolean };
  referralCode: string;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    const response = await fetch("/api/v1/billing/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, coupon }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; data?: { quote: { total: number; currency: string; tax: number; discount: number } } };
    if (!data.ok || !data.data) {
      setError(data.error ?? "Quote failed");
      return;
    }
    const q = data.data.quote;
    setQuote(`${formatMoney(q.total, q.currency)} after ${formatMoney(q.discount, q.currency)} off · tax ${formatMoney(q.tax, q.currency)}`);
    setError(null);
  }

  async function pay(provider: "sandbox" | "stripe" | "razorpay") {
    setError(null);
    const response = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, coupon, provider }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      data?: { url?: string; sandboxUrl?: string; checkoutId?: string };
    };
    if (!data.ok || !data.data) {
      setError(data.error ?? "Checkout failed");
      return;
    }
    if (data.data.url) {
      window.location.href = data.data.url;
      return;
    }
    if (data.data.sandboxUrl) {
      window.location.href = data.data.sandboxUrl;
      return;
    }
    router.push(`/billing/success?checkout=${data.data.checkoutId ?? ""}`);
  }

  return (
    <section className="card p-5">
      <h2 className="text-xl font-black">Upgrade</h2>
      <p className="text-sm text-[#777]">Your referral code: {referralCode}</p>
      <select className="mt-3 w-full rounded-2xl border-2 px-3 py-2 font-bold" value={planId} onChange={(event) => setPlanId(event.target.value)}>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name} · {formatMoney(plan.amount, plan.currency)} / {plan.interval}
          </option>
        ))}
      </select>
      <input className="mt-3 w-full rounded-2xl border-2 px-3 py-2 font-bold" placeholder="SAVE20 or REFER-XXXX" value={coupon} onChange={(event) => setCoupon(event.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="press bg-white px-4 py-2" type="button" onClick={preview}>
          Preview GST
        </button>
        <button className="press bg-[#58cc02] px-4 py-2 text-white" type="button" onClick={() => pay("sandbox")}>
          Sandbox pay
        </button>
        {providers.stripe ? (
          <button className="press bg-[#635bff] px-4 py-2 text-white" type="button" onClick={() => pay("stripe")}>
            Stripe
          </button>
        ) : null}
        {providers.razorpay ? (
          <button className="press bg-[#072654] px-4 py-2 text-white" type="button" onClick={() => pay("razorpay")}>
            Razorpay
          </button>
        ) : null}
      </div>
      {quote ? <p className="mt-3 font-bold">{quote}</p> : null}
      {error ? <p className="mt-3 font-bold text-[#ff4b4b]">{error}</p> : null}
    </section>
  );
}
