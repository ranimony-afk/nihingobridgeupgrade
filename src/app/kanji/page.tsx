import Link from "next/link";
import { listKanji } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

// Public reference content: identical for every visitor, so cache and
// revalidate instead of rendering per request.
export const revalidate = 3600;

export default async function KanjiIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await seedReady();
  const { q = "" } = await searchParams;
  const all = await listKanji();
  const kanji = q
    ? all.filter((item) => item.character.includes(q) || item.searchDocument.toLowerCase().includes(q.toLowerCase()))
    : all;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#ff9600]">KANJIDIC2</p>
      <h1 className="text-3xl font-black">Kanji explorer</h1>
      <p className="mt-2 text-[#777]">{kanji.length} characters in the core map. Schema holds 13,000+.</p>
      <form className="mt-4 flex gap-2" action="/kanji" method="get">
        <input name="q" placeholder="Search 山 or mountain" className="flex-1 rounded-2xl border-2 px-3 py-2 font-bold" />
        <button className="press bg-[#ff9600] px-4 text-white" type="submit">
          Search
        </button>
      </form>
      <Link href="/kanji/explore" className="mt-3 inline-block font-black text-[#1cb0f6]">
        Open D3 radial mind map →
      </Link>
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
