"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/billing/gst";

type Affiliate = {
  id: string;
  code: string;
  name: string;
  status: string;
  discountPercent: number;
  commissionPercent: number;
  pending: number;
  paid: number;
  conversions: number;
};

export function AffiliateDesk({ affiliates }: { affiliates: Affiliate[] }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "AFFILIATE-", name: "", email: "" });

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/v1/admin/affiliates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Saved" : data.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-black">New partner</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            placeholder="AFFILIATE-CODE"
            className="rounded-xl px-3 py-2 text-black"
          />
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Partner name"
            className="rounded-xl px-3 py-2 text-black"
          />
          <input
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="partner@example.com"
            className="rounded-xl px-3 py-2 text-black"
          />
        </div>
        <button
          type="button"
          className="press mt-3 bg-[#58cc02] px-4 py-2 text-white"
          onClick={() => post({ action: "create", ...form })}
        >
          Create affiliate
        </button>
        {note ? <p className="mt-2 text-sm font-bold">{note}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/10 text-xs uppercase tracking-widest text-white/60">
            <tr>
              <th className="px-3 py-3">Partner</th>
              <th className="px-3 py-3">Terms</th>
              <th className="px-3 py-3">Conversions</th>
              <th className="px-3 py-3">Owed</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {affiliates.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <td className="px-3 py-3">
                  <p className="font-black">{row.name}</p>
                  <p className="text-white/60">{row.code}</p>
                </td>
                <td className="px-3 py-3 text-white/70">
                  {row.discountPercent}% off · {row.commissionPercent}% commission
                </td>
                <td className="px-3 py-3">{row.conversions}</td>
                <td className="px-3 py-3">
                  <span className="font-black text-[#ffc800]">{formatMoney(row.pending, "usd")}</span>
                  <span className="text-white/50"> / {formatMoney(row.paid, "usd")} paid</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="press bg-white px-2 py-1 text-xs text-black"
                      onClick={() => post({ action: "payout", id: row.id })}
                    >
                      Pay out
                    </button>
                    <button
                      type="button"
                      className="press bg-white/10 px-2 py-1 text-xs text-white"
                      onClick={() =>
                        post({ action: "status", id: row.id, status: row.status === "active" ? "paused" : "active" })
                      }
                    >
                      {row.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {affiliates.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-white/60" colSpan={5}>
                  No affiliates yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
