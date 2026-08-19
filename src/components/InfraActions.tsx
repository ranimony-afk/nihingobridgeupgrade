"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InfraActions() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    setNote(null);
    const response = await fetch("/api/v1/admin/backups", { method: "POST" });
    const data = (await response.json()) as { ok?: boolean; error?: string; data?: { filename: string; bytes: number } };
    setBusy(false);
    setNote(data.ok ? `Wrote ${data.data?.filename} (${data.data?.bytes} bytes)` : (data.error ?? "Backup failed"));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" disabled={busy} onClick={backup}>
        {busy ? "Snapshotting…" : "Run logical backup"}
      </button>
      {note ? <p className="text-sm font-bold">{note}</p> : null}
    </div>
  );
}
