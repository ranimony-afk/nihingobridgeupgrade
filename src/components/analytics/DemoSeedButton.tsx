"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DemoSeedButton() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    const response = await fetch("/api/v1/admin/analytics/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      data?: { skipped?: boolean; reason?: string; learners?: number };
      error?: string;
    };
    setBusy(false);
    if (!data.ok) setNote(data.error ?? "Failed");
    else if (data.data?.skipped) setNote(`Skipped — ${data.data.reason}`);
    else setNote(`Seeded ${data.data?.learners} demo learners`);
    router.refresh();
  }

  return (
    <div className="mt-3">
      <button type="button" className="press bg-white/10 px-3 py-1 text-xs text-white" disabled={busy} onClick={seed}>
        {busy ? "Seeding…" : "Seed demo activity"}
      </button>
      {note ? <span className="ml-2 text-xs text-white/60">{note}</span> : null}
    </div>
  );
}
