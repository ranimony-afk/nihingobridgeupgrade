import Link from "next/link";
import { KanjiExploreClient } from "@/components/KanjiExploreClient";
import { explorerTree } from "@/lib/kanji/enrich";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function KanjiExplorePage() {
  await seedReady();
  const tree = await explorerTree();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#86efac]">D3 radial tree</p>
      <h1 className="text-3xl font-black">Kanji mind map</h1>
      <p className="mt-2 text-[#777]">Scroll to zoom. Drag to pan. Click a leaf to open the explorer card.</p>
      <Link href="/kanji" className="mt-2 inline-block text-sm font-bold text-[#1cb0f6]">
        Grid view
      </Link>
      <div className="mt-4">
        <KanjiExploreClient tree={tree} />
      </div>
    </main>
  );
}
