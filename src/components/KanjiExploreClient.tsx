"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { MindNode } from "@/lib/kanji/tree";

/**
 * D3 is ~90KB and only needed once this view is on screen. Loading it lazily
 * keeps it out of the shared bundle for every other page.
 */
const KanjiRadial = dynamic(
  () => import("@/components/KanjiRadial").then((mod) => mod.KanjiRadial),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[min(82vh,740px)] w-full place-items-center rounded-[32px] bg-[#0f172a] text-white/50">
        Loading mind map…
      </div>
    ),
  },
);

export function KanjiExploreClient({ tree }: { tree: MindNode }) {
  const router = useRouter();
  return (
    <KanjiRadial
      data={tree}
      onSelect={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
    />
  );
}
