"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeoTools() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: "today" | "backfill") {
    setBusy(true);
    setNote(action === "today" ? "Generating…" : "Backfilling 7 days…");
    const response = await fetch("/api/v1/admin/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, days: 7 }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      data?: { title?: string; created?: boolean; created_?: number; updated?: number; attempted?: number };
    };
    setBusy(false);
    if (!data.ok) setNote(data.error ?? "Failed");
    else if (action === "today") {
      setNote(`${data.data?.created ? "Created" : "Updated"}: ${data.data?.title ?? "post"}`);
    } else {
      setNote(`Backfill done — ${data.data?.attempted} days processed`);
    }
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" disabled={busy} onClick={() => run("today")}>
        Generate today&apos;s post
      </button>
      <button type="button" className="press bg-white/10 px-4 py-2 text-white" disabled={busy} onClick={() => run("backfill")}>
        Backfill 7 days
      </button>
      {note ? <p className="w-full text-xs text-white/60">{note}</p> : null}
    </div>
  );
}
