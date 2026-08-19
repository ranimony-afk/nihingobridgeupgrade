import Link from "next/link";
import { grammarStats, listGrammarPoints } from "@/lib/grammar/engine";
import { listCollocations, listIdioms } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function GrammarPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; q?: string; d?: string }>;
}) {
  await seedReady();
  const { level, q, d } = await searchParams;
  const [points, stats, idioms, collocations] = await Promise.all([
    listGrammarPoints({ level, q, maxDifficulty: d ? Number(d) : undefined }),
    grammarStats(),
    listIdioms(),
    listCollocations(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#58cc02]">Grammar engine</p>
      <h1 className="text-3xl font-black">Patterns, graph, builder</h1>
      <p className="mt-2 text-[#777]">
        {stats.total} explanations · capacity {stats.capacity.toLocaleString()}.
      </p>
      <form className="mt-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search ば, passive…" className="flex-1 rounded-2xl border-2 px-3 py-2 font-bold" />
        <select name="level" defaultValue={level ?? ""} className="rounded-2xl border-2 px-3 py-2 font-bold">
          <option value="">All JLPT</option>
          {["N5", "N4", "N3", "N2", "N1"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select name="d" defaultValue={d ?? ""} className="rounded-2xl border-2 px-3 py-2 font-bold">
          <option value="">Any difficulty</option>
          {[2, 4, 6, 9].map((item) => (
            <option key={item} value={item}>
              ≤ {item}
            </option>
          ))}
        </select>
        <button className="press bg-[#58cc02] px-4 text-white" type="submit">
          Filter
        </button>
      </form>

      <div className="mt-6 grid gap-3">
        {points.slice(0, 60).map((item) => (
          <Link key={item.id} href={`/grammar/${item.slug}`} className="card p-4">
            <p className="text-xs font-extrabold uppercase text-[#777]">
              {item.level} · difficulty {item.meta?.difficulty ?? 1}/9
            </p>
            <h2 className="text-xl font-black">
              {item.title} <span className="text-base text-[#1cb0f6]">{item.structure}</span>
            </h2>
            <p className="text-[#777]">{item.explanation}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-2xl font-black">Idioms</h2>
      <ul className="mt-3 grid gap-2">
        {idioms.slice(0, 8).map((item) => (
          <li key={item.id} className="card p-3">
            <span className="ja font-black">{item.ja}</span> — {item.en}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-2xl font-black">Collocations</h2>
      <ul className="mt-3 grid gap-2">
        {collocations.slice(0, 8).map((item) => (
          <li key={item.id} className="card p-3">
            {item.leftJa} {item.rightJa} — {item.en}
          </li>
        ))}
      </ul>
    </main>
  );
}
