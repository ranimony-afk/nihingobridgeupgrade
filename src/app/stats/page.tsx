import Link from "next/link";
import { getDecksWithStats, getGlobalStats } from "@/lib/queries";
import ResetButton from "./ResetButton";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [stats, decks] = await Promise.all([
    getGlobalStats(),
    getDecksWithStats(),
  ]);

  const overallPct =
    stats.totalCards > 0 ? Math.round((stats.learned / stats.totalCards) * 100) : 0;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Your Progress</h1>
          <p className="mt-1 text-slate-500">Track how your Japanese is growing.</p>
        </div>
        <ResetButton />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total cards" value={stats.totalCards} accent="slate" />
        <StatCard label="Cards learned" value={stats.learned} accent="emerald" />
        <StatCard label="Due for review" value={stats.due} accent="rose" />
        <StatCard label="Review accuracy" value={`${stats.accuracy}%`} accent="sky" />
      </div>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Overall mastery</h2>
          <span className="text-sm font-semibold text-slate-500">
            {stats.learned} / {stats.totalCards}
          </span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-slate-100">
          <div
            className="flex h-full items-center justify-end rounded-full bg-gradient-to-r from-rose-500 to-orange-400 pr-2 text-[10px] font-bold text-white transition-all"
            style={{ width: `${Math.max(overallPct, 6)}%` }}
          >
            {overallPct}%
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          You&apos;ve completed <strong>{stats.sessions}</strong> study session
          {stats.sessions === 1 ? "" : "s"} and reviewed{" "}
          <strong>{stats.totalReviewed}</strong> card
          {stats.totalReviewed === 1 ? "" : "s"} in total.
        </p>
      </div>

      <h2 className="mb-3 text-lg font-bold">By deck</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {decks.map((deck, i) => {
          const pct =
            deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
          return (
            <Link
              key={deck.id}
              href={`/study/${deck.slug}`}
              className={`flex items-center gap-4 p-4 transition hover:bg-slate-50 ${
                i > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl">
                {deck.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate font-semibold">{deck.title}</span>
                  <span className="ml-2 shrink-0 text-sm font-medium text-slate-500">
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium">
                {deck.due > 0 ? (
                  <span className="text-rose-500">{deck.due} due</span>
                ) : (
                  <span className="text-emerald-600">✓</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

const accentMap: Record<string, string> = {
  slate: "from-slate-500 to-slate-700",
  emerald: "from-emerald-500 to-emerald-700",
  rose: "from-rose-500 to-orange-400",
  sky: "from-sky-500 to-blue-600",
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`inline-block bg-gradient-to-r bg-clip-text text-3xl font-extrabold text-transparent ${
          accentMap[accent] ?? accentMap.slate
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
    </div>
  );
}
