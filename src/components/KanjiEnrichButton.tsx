"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function KanjiEnrichButton() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    const response = await fetch("/api/v1/admin/kanji/enrich", { method: "POST" });
    const data = (await response.json()) as { ok?: boolean; data?: unknown; error?: string };
    setNote(data.ok ? JSON.stringify(data.data) : data.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button type="button" className="press bg-[#86efac] px-4 py-2 text-[#14532d]" onClick={run}>
        Enrich explorer
      </button>
      {note ? <p className="mt-2 font-mono text-xs">{note}</p> : null}
    </div>
  );
}
