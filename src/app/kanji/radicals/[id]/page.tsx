import Link from "next/link";
import { notFound } from "next/navigation";

import { getRadicalById } from "@/repositories/knowledge";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { id } = await params;
  return { title: `Radical ${id} | NihongoBridge` };
}

export default async function RadicalDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const parsed = Number(id);
  if (!Number.isInteger(parsed)) notFound();

  const radical = await getRadicalById(parsed);
  if (!radical) notFound();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/kanji" className="hover:text-slate-900">
          Kanji
        </Link>
        <span className="px-1">/</span>
        <span className="text-slate-700">radical {radical.literal}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="jp-glyph grid h-32 w-32 place-items-center rounded-2xl bg-amber-50 text-6xl text-slate-900">
          {radical.literal}
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {radical.meanings.slice(0, 3).join(", ") || `Radical ${radical.literal}`}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {radical.isKangxi && radical.radicalNumber
              ? `Kangxi radical #${radical.radicalNumber}`
              : "Decomposition group"}
            {radical.strokeCount ? ` · ${radical.strokeCount} strokes` : ""} ·{" "}
            {radical.kanjiCount.toLocaleString("en-US")} kanji
            {radical.source ? ` · source: ${radical.source}` : ""}
          </p>
          {radical.meanings.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {radical.meanings.map((meaning) => (
                <li key={meaning} className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                  {meaning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Kanji containing this radical</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {radical.kanji.map((kanji) => (
            <Link
              key={kanji.id}
              href={`/kanji/${encodeURIComponent(kanji.literal)}`}
              title={kanji.meanings.slice(0, 3).join(", ")}
              className="jp-glyph rounded-2xl border border-slate-200 px-3 py-2 text-2xl text-slate-800 transition hover:border-amber-500 hover:text-amber-700"
            >
              {kanji.literal}
            </Link>
          ))}
        </div>
        {radical.kanjiCount > radical.kanji.length ? (
          <p className="mt-4 text-xs text-slate-500">
            Showing the {radical.kanji.length} most frequent of{" "}
            {radical.kanjiCount.toLocaleString("en-US")} kanji.
          </p>
        ) : null}
      </section>
    </div>
  );
}
