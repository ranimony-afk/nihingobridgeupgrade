import Link from "next/link";
import { getDecksWithStats, getGlobalStats, isSeeded } from "@/lib/queries";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

function categoryBadge(category: string) {
  const map: Record<string, string> = {
    kana: "bg-violet-100 text-violet-700",
    vocab: "bg-emerald-100 text-emerald-700",
    grammar: "bg-amber-100 text-amber-700",
  };
  return map[category] ?? "bg-slate-100 text-slate-700";
}

export default async function HomePage() {
  // Auto-seed on first load so the app is usable immediately.
  if (!(await isSeeded())) {
    await seedDatabase();
  }

  const [decks, stats] = await Promise.all([getDecksWithStats(), getGlobalStats()]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <section className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-rose-500 to-orange-400 p-8 text-white shadow-xl sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
          ようこそ · Welcome
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
          Bridge your way to fluent Japanese, one card at a time.
        </h1>
        <p className="mt-3 max-w-xl text-white/90">
          Master hiragana, katakana and essential vocabulary with a smart
          spaced-repetition system that shows you exactly what to review.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <StatPill label="Cards" value={stats.totalCards} />
          <StatPill label="Learned" value={stats.learned} />
          <StatPill label="Due now" value={stats.due} highlight />
          <StatPill label="Accuracy" value={`${stats.accuracy}%`} />
        </div>
      </section>

      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold">Study decks</h2>
          <p className="text-sm text-slate-500">Pick a deck and start reviewing.</p>
        </div>
        <Link
          href="/stats"
          className="text-sm font-semibold text-rose-500 hover:text-rose-600"
        >
          View progress →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {decks.map((deck) => {
          const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
          return (
            <Link
              key={deck.id}
              href={`/study/${deck.slug}`}
              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-2xl">
                  {deck.emoji}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${categoryBadge(
                    deck.category,
                  )}`}
                >
                  {deck.category}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold group-hover:text-rose-600">
                {deck.title}
              </h3>
              <p className="mt-1 flex-1 text-sm text-slate-500">{deck.description}</p>

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
                  <span>
                    {deck.learned}/{deck.total} learned
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">
                  {deck.due > 0 ? (
                    <span className="text-rose-500">{deck.due} due</span>
                  ) : (
                    <span className="text-emerald-600">All caught up ✓</span>
                  )}
                </span>
                <span className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white transition group-hover:bg-rose-600">
                  Study
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function StatPill({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-2 backdrop-blur ${
        highlight ? "bg-white text-rose-600" : "bg-white/20 text-white"
      }`}
    >
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}
