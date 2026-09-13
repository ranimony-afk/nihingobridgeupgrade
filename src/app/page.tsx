import Link from "next/link";

import { KanjiSearchBox } from "@/components/kanji/kanji-search-box";
import { getKnowledgeStats, listKanji } from "@/repositories/knowledge";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    href: "/kanji",
    title: "Kanji explorer",
    body: "Search 13k+ kanji by meaning, reading or JLPT level, then open the Mind Tree.",
  },
  {
    href: "/dictionary",
    title: "Dictionary",
    body: "JMdict headwords with kana readings, parts of speech and English glosses.",
  },
  {
    href: "/admin",
    title: "Admin & ETL",
    body: "Provenance, dataset versions, pipeline runs and knowledge graph counters.",
  },
];

export default async function HomePage() {
  const [stats, featured] = await Promise.all([getKnowledgeStats(), listKanji({ limit: 12 })]);

  return (
    <div className="space-y-12">
      <section className="grid gap-8 rounded-3xl border border-slate-200 bg-white/80 p-8 shadow-sm lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            NihongoBridge · knowledge graph
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Every kanji, radical, component and word — connected.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600">
            The Kanji Mind Tree is generated from the database itself: radical membership,
            KRADFILE decomposition and JMdict vocabulary links are queried at render time, so the
            graph can never drift from the knowledge base.
          </p>
          <div className="mt-6 max-w-xl">
            <KanjiSearchBox autoFocus placeholder="Try 語, “water”, みず, or 日本語…" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            {["語", "勉", "愛", "水", "働", "漢"].map((literal) => (
              <Link
                key={literal}
                href={`/kanji/${encodeURIComponent(literal)}`}
                className="jp-glyph rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-lg text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
              >
                {literal}
              </Link>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 self-start">
          {[
            { label: "Kanji", value: stats.kanji },
            { label: "Radicals", value: stats.radicals },
            { label: "Components", value: stats.components },
            { label: "Vocabulary", value: stats.vocabulary },
            { label: "Decomposition links", value: stats.componentLinks },
            { label: "Vocabulary links", value: stats.vocabularyLinks },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</dt>
              <dd className="text-xl font-semibold text-slate-900">
                {item.value.toLocaleString("en-US")}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
          Most frequent kanji
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {featured.map((kanji) => (
            <Link
              key={kanji.id}
              href={`/kanji/${encodeURIComponent(kanji.literal)}`}
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-slate-900 hover:shadow-sm"
            >
              <span className="jp-glyph block text-3xl text-slate-900 group-hover:text-indigo-600">
                {kanji.literal}
              </span>
              <span className="mt-1 block truncate text-xs text-slate-500">
                {kanji.meanings.slice(0, 2).join(", ")}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="rounded-3xl border border-slate-200 bg-white p-6 transition hover:border-slate-900 hover:shadow-sm"
          >
            <h3 className="text-base font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{feature.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
