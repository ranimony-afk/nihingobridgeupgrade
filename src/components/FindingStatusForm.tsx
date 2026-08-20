"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const options = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "accepted_risk", label: "Accepted risk" },
];

export function FindingStatusForm({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setNote(null);
    const response = await fetch(`/api/v1/audit/findings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    setNote(data.ok ? "Updated" : (data.error ?? "Update failed"));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-extrabold uppercase tracking-widest text-[#777]">
        Workflow
        <select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="rounded-xl border-2 border-[#e5e5e5] bg-white px-3 py-2 text-sm font-bold text-[#3c3c3c]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" disabled={busy} onClick={save}>
        Save status
      </button>
      {note ? <p className="text-sm font-bold">{note}</p> : null}
    </div>
  );
}
