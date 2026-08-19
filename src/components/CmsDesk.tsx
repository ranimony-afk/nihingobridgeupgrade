"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CmsDesk() {
  const router = useRouter();
  const [tab, setTab] = useState<"post" | "notify" | "seo">("post");
  const [fields, setFields] = useState<Record<string, string>>({ status: "draft", audience: "all", path: "/" });
  const [note, setNote] = useState<string | null>(null);

  function set(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    const response = await fetch("/api/v1/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: tab, ...fields }),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    setNote(data.ok ? "Saved" : data.error ?? "Failed");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-white/10 p-5">
      <div className="flex gap-2">
        {(["post", "notify", "seo"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`press px-3 py-1 text-sm ${tab === item ? "bg-[#58cc02] text-white" : "bg-white/10 text-white"}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {tab === "post" ? (
          <>
            <input placeholder="slug" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("slug", e.target.value)} />
            <input placeholder="title" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("title", e.target.value)} />
            <input placeholder="excerpt" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("excerpt", e.target.value)} />
            <textarea placeholder="body" rows={4} className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("body", e.target.value)} />
            <select className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("status", e.target.value)}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </>
        ) : null}
        {tab === "notify" ? (
          <>
            <input placeholder="title" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("title", e.target.value)} />
            <input placeholder="body" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("body", e.target.value)} />
            <select className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("audience", e.target.value)}>
              <option value="all">all</option>
              <option value="plus">plus</option>
              <option value="institution">institution</option>
            </select>
          </>
        ) : null}
        {tab === "seo" ? (
          <>
            <input placeholder="/path" defaultValue="/" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("path", e.target.value)} />
            <input placeholder="meta title" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("title", e.target.value)} />
            <input placeholder="meta description" className="rounded-xl px-3 py-2 text-black" onChange={(e) => set("description", e.target.value)} />
          </>
        ) : null}
        <button type="button" className="press bg-[#1cb0f6] px-4 py-2 text-white" onClick={submit}>
          Save {tab}
        </button>
        {note ? <p className="text-sm font-bold">{note}</p> : null}
      </div>
    </section>
  );
}
