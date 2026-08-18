"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
};

type Summary = {
  subscription: { plan: string; status: string; currentPeriodEndsAt: string | null; cancelAtPeriodEnd: boolean } | null;
  invoices: Invoice[];
  checkouts: Array<{ id: string; status: string; provider: string; totalMinor: number; currency: string; createdAt: string }>;
};

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amountMinor / 100);
}

export function BillingCenter() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [legalName, setLegalName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [summaryResponse, referralResponse, taxResponse] = await Promise.all([
      fetch("/api/v1/billing/summary", { cache: "no-store" }),
      fetch("/api/v1/billing/referral-code", { cache: "no-store" }),
      fetch("/api/v1/billing/tax-profile", { cache: "no-store" }),
    ]);
    if (summaryResponse.ok) setSummary(await summaryResponse.json() as Summary);
    if (referralResponse.ok) {
      const body = (await referralResponse.json()) as { referralCode: { code: string } };
      setReferralCode(body.referralCode.code);
    }
    if (taxResponse.ok) {
      const body = (await taxResponse.json()) as { profile: { legalName: string; gstin: string | null; stateCode: string } | null };
      if (body.profile) {
        setLegalName(body.profile.legalName);
        setGstin(body.profile.gstin ?? "");
        setStateCode(body.profile.stateCode);
      }
    }
  }

  useEffect(() => { void load(); }, []);

  async function openPortal() {
    const response = await fetch("/api/v1/billing/portal", { method: "POST" });
    const body = (await response.json()) as { url?: string; error?: string };
    if (response.ok && body.url) window.location.assign(body.url);
    else setMessage(body.error ?? "A Stripe billing portal is not available for this account yet.");
  }

  async function saveTaxProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/v1/billing/tax-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalName, gstin: gstin || undefined, stateCode, billingAddress: {} }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Billing tax profile saved." : body.error ?? "Tax profile could not be saved.");
  }

  return (
    <div className="space-y-6">
      {message && <p role="status" className="rounded-xl bg-[#edf6ea] px-4 py-3 text-sm text-[#285e45]">{message}</p>}
      <section className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">CURRENT PLAN</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">{summary?.subscription?.plan ?? "Free learning"}</h2><p className="mt-1 text-sm text-[#657166]">{summary?.subscription ? `${summary.subscription.status}${summary.subscription.currentPeriodEndsAt ? ` · renews ${new Date(summary.subscription.currentPeriodEndsAt).toLocaleDateString()}` : ""}` : "Explore a premium plan when you are ready."}</p></div><div className="flex gap-2"><a href="/pricing" className="rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white">View plans</a><button type="button" onClick={() => void openPortal()} className="rounded-xl border border-[#cdd7ca] px-4 py-2.5 text-sm font-bold text-[#415247]">Billing portal</button></div></div></section>
      <section className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">INVOICES</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">GST billing history</h2><div className="mt-4 divide-y divide-[#e1e6de]">{summary?.invoices.map((invoice) => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={invoice.id}><div><p className="text-sm font-bold text-[#415247]">{invoice.invoiceNumber ?? invoice.id}</p><p className="mt-1 text-xs text-[#748076]">{invoice.status} · {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : "Awaiting payment"}</p></div><div className="flex items-center gap-3"><span className="font-serif text-lg text-[#18231d]">{money(invoice.totalMinor, invoice.currency)}</span>{(invoice.hostedInvoiceUrl || invoice.invoicePdfUrl) && <a className="text-sm font-bold text-[#277a5c] underline" href={invoice.invoicePdfUrl ?? invoice.hostedInvoiceUrl ?? "#"} target="_blank" rel="noreferrer">Open</a>}</div></div>)}{summary && summary.invoices.length === 0 && <p className="py-4 text-sm text-[#657166]">No invoices have been issued yet.</p>}</div></section>
      <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">REFER A LEARNER</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">Share your bridge</h2><p className="mt-2 text-sm leading-6 text-[#657166]">Your referral gives an eligible new learner a discount at checkout.</p><code className="mt-4 block rounded-xl bg-[#edf0e9] px-3 py-3 text-center font-mono text-sm text-[#18231d]">{referralCode ?? "Loading code…"}</code></div><form onSubmit={saveTaxProfile} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">GST PROFILE</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">Billing details</h2><div className="mt-4 grid gap-3"><input required value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Legal name" className="rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 text-sm"/><input value={gstin} onChange={(event) => setGstin(event.target.value)} placeholder="GSTIN (optional)" className="rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 text-sm"/><input required value={stateCode} onChange={(event) => setStateCode(event.target.value.toUpperCase())} placeholder="State code, e.g. KA" maxLength={3} className="rounded-xl border border-[#cdd7ca] bg-white px-3 py-2.5 text-sm"/><button className="rounded-xl bg-[#277a5c] px-4 py-2.5 text-sm font-extrabold text-white">Save billing profile</button></div></form></section>
    </div>
  );
}
