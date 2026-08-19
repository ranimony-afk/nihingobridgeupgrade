"use client";

import { useEffect, useState } from "react";

const KEY = "nb-dict-offline-v1";

export function OfflineDict() {
  const [count, setCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    try {
      const pack = JSON.parse(raw) as { lexemes?: unknown[] };
      setCount(pack.lexemes?.length ?? 0);
    } catch {
      setCount(0);
    }
  }, []);

  async function download() {
    const response = await fetch("/api/v1/dict/offline");
    const data = (await response.json()) as { ok?: boolean; data?: { lexemes: unknown[] } };
    if (!data.ok || !data.data) {
      setNote("Could not fetch pack");
      return;
    }
    window.localStorage.setItem(KEY, JSON.stringify(data.data));
    setCount(data.data.lexemes.length);
    setNote("Cached for offline / Flutter hydrate");
  }

  return (
    <div className="text-sm">
      <button type="button" className="press bg-white px-3 py-1" onClick={download}>
        Cache N5 pack
      </button>
      <span className="ml-2 font-bold text-[#777]">{count ? `${count} entries cached` : "No local pack"}</span>
      {note ? <p className="mt-1 font-bold">{note}</p> : null}
    </div>
  );
}
