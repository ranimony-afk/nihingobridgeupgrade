"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubscriptionControls({ status, endsAt }: { status: string; endsAt: string | null }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: "cancel" | "resume") {
    setBusy(true);
    const response = await fetch("/api/v1/billing/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string; data?: { endsAt?: string } };
    setBusy(false);
    setNote(
      data.ok
        ? action === "cancel"
          ? `Cancelled. Access continues until ${String(data.data?.endsAt ?? "period end").slice(0, 10)}.`
          : "Subscription resumed."
        : data.error ?? "Failed",
    );
    router.refresh();
  }

  return (
    <section className="card p-5">
      <h2 className="text-xl font-black">Subscription</h2>
      <p className="text-sm text-[#777]">
        Status <strong>{status}</strong>
        {endsAt ? ` · renews ${endsAt.slice(0, 10)}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "canceling" ? (
          <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" disabled={busy} onClick={() => run("resume")}>
            Resume
          </button>
        ) : (
          <button type="button" className="press bg-white px-4 py-2" disabled={busy || status === "none"} onClick={() => run("cancel")}>
            Cancel at period end
          </button>
        )}
      </div>
      {note ? <p className="mt-2 text-sm font-bold">{note}</p> : null}
    </section>
  );
}
