"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  slug: string;
  name: string;
  description: string;
  cost: number;
  kind: string;
  icon: string;
};

export function ShopGrid({
  items,
  gems,
  avatar,
}: {
  items: Item[];
  gems: number;
  avatar: string;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState(gems);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function buy(slug: string) {
    setBusy(slug);
    setNote(null);
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buy", itemSlug: slug }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      learner?: { gems: number };
      item?: { name: string };
    };
    setBusy(null);
    if (!data.ok) {
      setNote(data.error ?? "Could not buy");
      return;
    }
    if (data.learner) setWallet(data.learner.gems);
    setNote(`Purchased ${data.item?.name ?? "item"}`);
    router.refresh();
  }

  return (
    <div className="mt-5">
      <p className="mb-3 font-extrabold text-[#1cb0f6]">{wallet} gems in the pouch</p>
      {note ? <p className="mb-3 font-bold text-[#58a700]">{note}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="card p-5">
            <div className="text-3xl">{item.icon}</div>
            <h2 className="mt-2 text-xl font-black">{item.name}</h2>
            <p className="mt-1 text-sm text-[#777]">{item.description}</p>
            <button
              type="button"
              disabled={busy === item.slug || wallet < item.cost}
              onClick={() => buy(item.slug)}
              className="press mt-4 bg-[#1cb0f6] px-4 py-2 text-white"
            >
              {item.kind === "outfit" && avatar === item.slug.replace("outfit-", "")
                ? "Wearing"
                : `${item.cost} gems`}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
