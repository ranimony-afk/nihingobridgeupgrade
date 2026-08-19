"use client";

import { useState } from "react";

export function BookmarkButton({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [state, setState] = useState<string | null>(null);

  async function toggle() {
    const response = await fetch("/api/v1/dict/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId }),
    });
    const data = (await response.json()) as { ok?: boolean; data?: { bookmarked?: boolean }; error?: string };
    setState(data.ok ? (data.data?.bookmarked ? "Saved" : "Removed") : data.error ?? "Need a learner session");
  }

  return (
    <button type="button" className="press bg-[#f0e5ff] px-3 py-1 text-sm text-[#ce82ff]" onClick={toggle}>
      ☆ Bookmark {state ? `· ${state}` : ""}
    </button>
  );
}
