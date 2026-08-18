import Link from "next/link";
import { listKanji } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function KanjiIndexPage() {
  await seedReady();
  const kanji = await listKanji();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ff9600]">KANJIDIC2</p>
      <h1 className="text-3xl font-black">Kanji explorer</h1>
      <p className="mt-2 text-[#777]">{kanji.length} characters in the core map. Schema holds 13,000+.</p>
      <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-10">
        {kanji.map((item) => (
          <Link key={item.id} href={`/kanji/${encodeURIComponent(item.character)}`} className="card grid place-items-center py-3 text-2xl font-black">
            {item.character}
          </Link>
        ))}
      </div>
    </main>
  );
}
