"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/billing/gst";

type Invited = { id: string; name: string; email: string; reward: number; currency: string };

export function ReferralPanel() {
  const [code, setCode] = useState("");
  const [credit, setCredit] = useState(0);
  const [invited, setInvited] = useState<Invited[]>([]);
  const [earned, setEarned] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/billing/referrals")
      .then((response) => response.json())
      .then((payload: { data?: { referralCode: string; credit: number; invited: Invited[]; earned: number } }) => {
        if (!payload.data) return;
        setCode(payload.data.referralCode);
        setCredit(payload.data.credit);
        setInvited(payload.data.invited);
        setEarned(payload.data.earned);
      });
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="card p-5">
      <h2 className="text-xl font-black">Invite friends</h2>
      <p className="text-sm text-[#777]">
        They get a discount at checkout, you earn credit when they subscribe.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-2xl bg-[#f7f7f7] px-4 py-2 font-black">{code || "…"}</code>
        <button type="button" className="press bg-white px-3 py-2 text-sm" onClick={copy} disabled={!code}>
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-2xl bg-[#f7f7f7] p-3">
          <p className="text-[10px] font-extrabold uppercase text-[#777]">Invited</p>
          <p className="text-xl font-black">{invited.length}</p>
        </div>
        <div className="rounded-2xl bg-[#f7f7f7] p-3">
          <p className="text-[10px] font-extrabold uppercase text-[#777]">Earned</p>
          <p className="text-xl font-black text-[#58cc02]">{formatMoney(earned, "inr")}</p>
        </div>
        <div className="rounded-2xl bg-[#f7f7f7] p-3">
          <p className="text-[10px] font-extrabold uppercase text-[#777]">Credit</p>
          <p className="text-xl font-black text-[#1cb0f6]">{formatMoney(credit, "inr")}</p>
        </div>
      </div>

      {invited.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {invited.map((row) => (
            <li key={row.id} className="flex justify-between">
              <span>{row.name}</span>
              <span className="text-[#777]">{row.email}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
