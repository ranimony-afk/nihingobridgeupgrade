"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function reset() {
    setLoading(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
      >
        Reset progress
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Sure?</span>
      <button
        onClick={reset}
        disabled={loading}
        className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60"
      >
        {loading ? "Resetting…" : "Yes, reset"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}
