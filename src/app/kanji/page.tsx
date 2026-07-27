import Link from "next/link";
import { db } from "@/db";
import { kanjiDictionary } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { KanjiExplorerClient } from "./KanjiExplorerClient";

export const dynamic = "force-dynamic";

export default async function KanjiMapsPage() {
  await ensureSeed();
  const cfg = getBrand("nihongo")!;
  const allKanji = await db.select().from(kanjiDictionary).orderBy(asc(kanjiDictionary.strokeCount));

  return (
    <main
      className="min-h-screen px-6 py-10"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              Interactive Kanji Explorer &amp; Visual Radical Maps 🈸
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Explore animated stroke counts, onyomi &amp; kunyomi readings, radical component breakdowns, writing practice canvas, and visual learning maps.
            </p>
          </div>
        </div>

        <KanjiExplorerClient initialKanji={allKanji as never} />
      </div>
    </main>
  );
}
