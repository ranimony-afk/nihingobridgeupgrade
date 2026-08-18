import Link from "next/link";
import { searchGraph, graphStats } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";
import { SpeakLink } from "@/components/SpeakLink";

export const dynamic = "force-dynamic";

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await seedReady();
  const { q = "" } = await searchParams;
  const [results, stats] = await Promise.all([searchGraph(q, 24), graphStats()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1cb0f6]">Knowledge graph</p>
      <h1 className="text-3xl font-black">Dictionary</h1>
      <p className="mt-2 text-[#777]">
        {stats.lexemes.toLocaleString()} lexemes loaded · schema capacity {stats.capacity.lexemes.toLocaleString()}.
      </p>
      <form className="mt-5 flex gap-2">
        <input name="q" defaultValue={q} placeholder="水, たべる, eat" className="flex-1 rounded-2xl border-2 px-3 py-2 font-bold" />
        <button className="press bg-[#1cb0f6] px-4 py-2 text-white" type="submit">
          Search
        </button>
      </form>
      <div className="mt-6 grid gap-3">
        {results.lexemes.map((item) => (
          <Link key={item.id} href={`/dictionary/${item.id}`} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="ja text-2xl font-black">{item.lemma}</p>
                <p className="text-sm text-[#1cb0f6]">{item.reading} · {item.pos} · {item.jlpt}</p>
              </div>
              <SpeakLink text={item.lemma} />
            </div>
          </Link>
        ))}
        {!q ? <p className="text-[#777]">Try 食べる, にほん, or water.</p> : null}
      </div>
    </main>
  );
}
