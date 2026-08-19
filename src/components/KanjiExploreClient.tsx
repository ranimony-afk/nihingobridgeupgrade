"use client";

import { useRouter } from "next/navigation";
import { KanjiRadial } from "@/components/KanjiRadial";
import type { MindNode } from "@/lib/kanji/tree";

export function KanjiExploreClient({ tree }: { tree: MindNode }) {
  const router = useRouter();
  return (
    <KanjiRadial
      data={tree}
      onSelect={(character) => router.push(`/kanji/${encodeURIComponent(character)}`)}
    />
  );
}
