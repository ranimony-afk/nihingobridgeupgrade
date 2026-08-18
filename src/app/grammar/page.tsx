import { listCollocations, listGrammar, listIdioms } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function GrammarPage() {
  await seedReady();
  const [grammar, idioms, collocations] = await Promise.all([listGrammar(), listIdioms(), listCollocations()]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#58cc02]">Grammar graph</p>
      <h1 className="text-3xl font-black">Patterns, idioms, collocations</h1>
      <div className="mt-6 grid gap-3">
        {grammar.map((item) => (
          <article key={item.id} className="card p-4">
            <p className="text-xs font-extrabold uppercase text-[#777]">{item.level}</p>
            <h2 className="text-xl font-black">
              {item.title} <span className="text-base text-[#1cb0f6]">{item.structure}</span>
            </h2>
            <p className="text-[#777]">{item.explanation}</p>
          </article>
        ))}
      </div>
      <h2 className="mt-8 text-2xl font-black">Idioms</h2>
      <ul className="mt-3 grid gap-2">
        {idioms.map((item) => (
          <li key={item.id} className="card p-3">
            <span className="ja font-black">{item.ja}</span> · {item.reading} — {item.en}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 text-2xl font-black">Collocations</h2>
      <ul className="mt-3 grid gap-2">
        {collocations.map((item) => (
          <li key={item.id} className="card p-3">
            {item.leftJa} {item.rightJa} — {item.en}
          </li>
        ))}
      </ul>
    </main>
  );
}
