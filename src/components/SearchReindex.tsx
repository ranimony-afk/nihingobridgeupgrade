"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchReindex() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reindex() {
    setBusy(true);
    setNote("Rebuilding index…");
    const response = await fetch("/api/v1/admin/search", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      data?: { indexed: number; tookMs: number };
      error?: string;
    };
    setBusy(false);
    setNote(
      data.ok
        ? `Indexed ${data.data?.indexed} documents in ${data.data?.tookMs}ms`
        : data.error ?? "Reindex failed",
    );
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button type="button" className="press bg-[#1cb0f6] px-4 py-2 text-white" disabled={busy} onClick={reindex}>
        {busy ? "Working…" : "Rebuild search index"}
      </button>
      {note ? <p className="mt-2 font-mono text-xs">{note}</p> : null}
    </div>
  );
}
