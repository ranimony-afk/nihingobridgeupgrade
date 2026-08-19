"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function KgImport() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  async function run(source: "core" | "simulate") {
    const response = await fetch("/api/v1/admin/kg/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, limit: 80 }),
    });
    const data = (await response.json()) as { ok?: boolean; data?: unknown; error?: string };
    setNote(data.ok ? JSON.stringify(data.data) : data.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="press bg-[#1cb0f6] px-4 py-2 text-white" onClick={() => run("core")}>
        Incremental core
      </button>
      <button type="button" className="press bg-white px-4 py-2 text-black" onClick={() => run("simulate")}>
        Simulate +80 lexemes
      </button>
      <button
        type="button"
        className="press bg-[#ce82ff] px-4 py-2 text-white"
        onClick={async () => {
          const response = await fetch("/api/v1/admin/dict/enrich", { method: "POST" });
          const data = (await response.json()) as { ok?: boolean; data?: unknown; error?: string };
          setNote(data.ok ? JSON.stringify(data.data) : data.error ?? "Failed");
          router.refresh();
        }}
      >
        Enrich dictionary
      </button>
      {note ? <p className="w-full font-mono text-xs">{note}</p> : null}
    </div>
  );
}
