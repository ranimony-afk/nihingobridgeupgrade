"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Starts a JLPT attempt from a published blueprint. The blueprint only carries
 * structure — the questions are sampled from the bank at this moment.
 */
export function JlptStartButton({
  slug,
  available,
  label = "Start timed attempt",
}: {
  slug: string;
  available: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/jlpt/tests/${encodeURIComponent(slug)}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "Could not start the attempt.");
        return;
      }
      router.push(`/jlpt/${encodeURIComponent(slug)}/attempt/${payload.data.run.publicId}`);
    } catch {
      setError("Network error — the attempt was not started.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy || !available}
        className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="jlpt-start"
      >
        {busy ? "Preparing…" : available ? label : "Bank cannot fill this test yet"}
      </button>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
