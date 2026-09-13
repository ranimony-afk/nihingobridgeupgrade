import Link from "next/link";
import { seedDecks } from "@/lib/seed-data";

export const dynamic = "force-static";

function KanaGrid({ title, slug, cards }: { title: string; slug: string; cards: { front: string; reading: string }[] }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link
          href={`/study/${slug}`}
          className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          Practice →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-8">
        {cards.map((c) => (
          <div
            key={c.front}
            className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-3 shadow-sm transition hover:border-rose-200 hover:shadow"
          >
            <span className="text-2xl font-bold">{c.front}</span>
            <span className="mt-0.5 text-xs font-medium text-slate-500">{c.reading}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function KanaPage() {
  const kanaDecks = seedDecks.filter((d) => d.category === "kana");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold">Kana Reference Chart</h1>
        <p className="mt-1 text-slate-500">
          The two basic Japanese syllabaries. Learn to read these first — everything
          else builds on them.
        </p>
      </div>

      {kanaDecks.map((deck) => (
        <KanaGrid
          key={deck.slug}
          title={deck.title}
          slug={deck.slug}
          cards={deck.cards}
        />
      ))}
    </main>
  );
}
