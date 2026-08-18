"use client";

import { useState } from "react";

export function PinSrs({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [note, setNote] = useState<string | null>(null);

  async function pin() {
    const response = await fetch("/api/v1/kg/srs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Queued in SRS" : data.error ?? "Sign in as a learner first");
  }

  return (
    <span>
      <button type="button" className="press bg-[#fff2d0] px-3 py-1 text-sm text-[#d68b00]" onClick={pin}>
        + SRS
      </button>
      {note ? <span className="ml-2 text-xs font-bold">{note}</span> : null}
    </span>
  );
}
