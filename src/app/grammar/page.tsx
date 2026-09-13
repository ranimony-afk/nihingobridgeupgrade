import Link from "next/link";

import { getGrammarCatalog, getGrammarOverview, getGrammarTagCloud } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; jlpt?: string; tag?: string }>;

export const metadata = {
  title: "Grammar | NihongoBridge",
  description: "Curated Japanese grammar points with corpus-harvested example sentences.",
};

export default async function GrammarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const jlptParam = Number(params.jlpt);
  const jlptLevel = Number.isFinite(jlptParam) && jlptParam >= 1 && jlptParam <= 5 ? jlptParam : null;
  const tag = params.tag ?? null;
  const query = (params.q ?? "").trim();

  const [catalog, stats, tags] = await Promise.all([
    getGrammarCatalog({ query, jlptLevel, tag, limit: 120 }),
    getGrammarOverview(),
    getGrammarTagCloud(18),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Grammar</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {stats.points} curated points · {stats.patterns} surface patterns ·{" "}
              {stats.examples} example sentences harvested from the licensed Tanaka corpus. Every
              example records the pattern and character offsets that matched it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link
                href="/grammar/explorer"
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 font-medium text-slate-700 transition hover:border-slate-900"
              >
                Open explorer →
              </Link>
              <Link
                href="/grammar/map"
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 font-medium text-slate-700 transition hover:border-slate-900"
              >
                Open relation map →
              </Link>
            </div>
          </div>
          <dl className="flex gap-3 text-xs">
            {stats.byLevel.map((level) => (
              <div
                key={level.jlptLevel ?? "none"}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center"
              >
                <dt className="text-slate-400">{level.jlptLevel ? `N${level.jlptLevel}` : "—"}</dt>
                <dd className="text-lg font-semibold text-slate-900">{level.total}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form action="/grammar" className="max-w-2xl">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-slate-900">
            <span aria-hidden className="jp-glyph text-xl text-slate-400">
              文
            </span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Search grammar: てしまう, conditional, purpose…"
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
              aria-label="Search grammar"
            />
            {jlptLevel ? <input type="hidden" name="jlpt" value={jlptLevel} /> : null}
            {tag ? <input type="hidden" name="tag" value={tag} /> : null}
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Search
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 text-xs">
          {[5, 4, 3, 2, 1].map((level) => (
            <Link
              key={level}
              href={`/grammar?jlpt=${level}`}
              className={`rounded-full border px-3 py-1 transition ${
                jlptLevel === level
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              JLPT N{level}
            </Link>
          ))}
          <Link
            href="/grammar"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:border-slate-400"
          >
            All
          </Link>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {tags.map((tagItem) => (
              <Link
                key={tagItem.slug}
                href={`/grammar?tag=${encodeURIComponent(tagItem.slug)}`}
                className={`rounded-full px-2.5 py-1 transition ${
                  tag === tagItem.slug
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tagItem.slug}
                <span className="ml-1 text-[10px] opacity-70">{tagItem.total}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <p className="text-xs text-slate-500">
        {catalog.total} point(s) · {catalog.tookMs}ms
        {query ? ` · query “${query}”` : ""}
        {jlptLevel ? ` · JLPT N${jlptLevel}` : ""}
        {tag ? ` · tag ${tag}` : ""}
      </p>

      {catalog.results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No grammar points matched. Try another keyword, level or tag.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.results.map((point) => (
            <Link
              key={point.id}
              href={`/grammar/${encodeURIComponent(point.slug)}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-500 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="jp text-xl text-slate-900 group-hover:text-indigo-700">
                  {point.title}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {point.jlptLevel ? `N${point.jlptLevel}` : "—"}
                </span>
              </div>
              {point.titleEn ? (
                <p className="mt-1 text-sm font-medium text-slate-700">{point.titleEn}</p>
              ) : null}
              {point.summary ? (
                <p className="mt-2 line-clamp-3 text-xs text-slate-600">{point.summary}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1">
                {point.patterns.slice(0, 3).map((pattern) => (
                  <span key={pattern} className="jp rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                    {pattern}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                {point.exampleCount} example{point.exampleCount === 1 ? "" : "s"} · {point.register}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
