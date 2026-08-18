"use client";

import { FormEvent, useEffect, useState } from "react";

type Overview = {
  metrics: { paidCheckouts: number; pendingCheckouts: number; revenueMinor: number; refundsMinor: number; activeSubscriptions: number };
  invoices: Array<{ id: string; invoiceNumber: string | null; status: string; currency: string; totalMinor: number; createdAt: string }>;
};

type Plan = { id: string; code: string; name: string; kind: string; amountMinor: number; currency: string; active: boolean };

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
}

export function BillingAdminConsole() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState("");
  const [planName, setPlanName] = useState("");
  const [amount, setAmount] = useState("79900");
  const [kind, setKind] = useState("subscription");
  const [interval, setInterval] = useState("month");
  const [couponCode, setCouponCode] = useState("");
  const [couponPercent, setCouponPercent] = useState("10");

  async function load() {
    const [overviewResponse, plansResponse] = await Promise.all([
      fetch("/api/v1/admin/billing/overview", { cache: "no-store" }),
      fetch("/api/v1/admin/billing/plans", { cache: "no-store" }),
    ]);
    if (overviewResponse.ok) setOverview(await overviewResponse.json() as Overview);
    if (plansResponse.ok) {
      const body = (await plansResponse.json()) as { plans: Plan[] };
      setPlans(body.plans);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/v1/admin/billing/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: planCode,
        name: planName,
        description: `${planName} premium access`,
        kind,
        interval,
        currency: "INR",
        amountMinor: Number(amount),
        gstRateBps: 1800,
        active: true,
        premium: true,
        features: ["Premium learning paths", "Advanced practice feedback"],
      }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Billing plan created." : body.error ?? "Plan could not be created.");
    if (response.ok) { setPlanCode(""); setPlanName(""); await load(); }
  }

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/v1/admin/billing/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponCode,
        name: `${couponCode} campaign`,
        percentOffBps: Math.round(Number(couponPercent) * 100),
        active: true,
      }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Coupon created." : body.error ?? "Coupon could not be created.");
    if (response.ok) setCouponCode("");
  }

  return (
    <div className="space-y-6">{message && <p role="status" className="rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[{ label: "Paid checkouts", value: overview?.metrics.paidCheckouts ?? 0 }, { label: "Pending", value: overview?.metrics.pendingCheckouts ?? 0 }, { label: "Gross revenue", value: money(overview?.metrics.revenueMinor ?? 0) }, { label: "Refunds", value: money(overview?.metrics.refundsMinor ?? 0) }, { label: "Active subscriptions", value: overview?.metrics.activeSubscriptions ?? 0 }].map((metric) => <article key={metric.label} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-4"><p className="text-xs font-bold uppercase tracking-[.11em] text-[#748076]">{metric.label}</p><p className="mt-2 font-serif text-2xl text-[#18231d]">{metric.value}</p></article>)}</section><section className="grid gap-6 lg:grid-cols-2"><form onSubmit={createPlan} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">CREATE PLAN</p><div className="mt-4 grid gap-3"><input required value={planCode} onChange={(event) => setPlanCode(event.target.value.toUpperCase())} placeholder="Code, e.g. PLUS_MONTHLY" className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"/><input required value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder="Plan name" className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"/><input required type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in paise" className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"/><div className="grid grid-cols-2 gap-3"><select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"><option value="subscription">Subscription</option><option value="one_time">One time</option></select><select value={interval} onChange={(event) => setInterval(event.target.value)} className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"><option value="month">Month</option><option value="year">Year</option></select></div><button className="rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white">Create plan</button></div></form><form onSubmit={createCoupon} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">CREATE COUPON</p><div className="mt-4 grid gap-3"><input required value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Code, e.g. WELCOME10" className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"/><input required type="number" min="1" max="100" value={couponPercent} onChange={(event) => setCouponPercent(event.target.value)} placeholder="Percent off" className="rounded-xl border border-[#cdd7ca] px-3 py-2.5 text-sm"/><button className="rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white">Create coupon</button></div></form></section><section className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">CURRENT PLANS</p><div className="mt-3 divide-y divide-[#e1e6de]">{plans.map((plan) => <div className="flex items-center justify-between gap-3 py-3" key={plan.id}><div><p className="text-sm font-bold text-[#415247]">{plan.name} <span className="font-mono text-xs text-[#748076]">{plan.code}</span></p><p className="text-xs text-[#748076]">{plan.kind} · {plan.active ? "active" : "retired"}</p></div><span className="font-serif text-lg text-[#18231d]">{new Intl.NumberFormat("en-IN", { style: "currency", currency: plan.currency }).format(plan.amountMinor / 100)}</span></div>)}{plans.length === 0 && <p className="py-4 text-sm text-[#657166]">No plans created yet.</p>}</div></section></div>
  );
}
