"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GrammarAdminTools() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  async function run(action: "import" | "generate") {
    const response = await fetch("/api/v1/admin/grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, count: 100 }),
    });
    const data = (await response.json()) as { ok?: boolean; data?: unknown; error?: string };
    setNote(data.ok ? JSON.stringify(data.data) : data.error ?? "Failed");
    router.refresh();
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="press bg-[#58cc02] px-4 py-2 text-white" onClick={() => run("import")}>
        Re-import curated points
      </button>
      <button type="button" className="press bg-white px-4 py-2 text-black" onClick={() => run("generate")}>
        Generate +100 scaffolds
      </button>
      {note ? <p className="w-full font-mono text-xs">{note}</p> : null}
    </div>
  );
}
