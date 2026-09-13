import Link from "next/link";

import { KanjiSearchBox } from "@/components/kanji/kanji-search-box";
import { browseKanji, searchKanji } from "@/services/knowledge/kanji";
import type { KanjiSearchResult } from "@/types/knowledge";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; jlpt?: string }>;

export default async function KanjiSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const jlpt = params.jlpt ? Number(params.jlpt) : undefined;
  const jlptLevel = jlpt && jlpt >= 1 && jlpt <= 5 ? jlpt : undefined;

  const [searchResponse, browse] = await Promise.all([
    query ? searchKanji(query, 48) : Promise.resolve(null),
    query ? Promise.resolve([]) : browseKanji({ jlptLevel, limit: 96 }),
  ]);

  const results: KanjiSearchResult[] =
    searchResponse?.results ??
    browse.map((kanji) => ({ ...kanji, matchedOn: "meaning" as const, score: 0 }));

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Kanji</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Search by kanji, English meaning or reading (かな / カナ / romaji-free kana). Results come
          straight from the knowledge graph.
        </p>
        <div className="max-w-2xl">
          <KanjiSearchBox initialQuery={query} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {[5, 4, 3, 2, 1].map((level) => (
            <Link
              key={level}
              href={`/kanji?jlpt=${level}`}
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
            href="/kanji"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:border-slate-400"
          >
            All
          </Link>
        </div>
      </header>

      {query ? (
        <p className="text-xs text-slate-500">
          {searchResponse?.total ?? 0} result(s) for “{query}” in {searchResponse?.tookMs ?? 0}ms
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          Browsing {jlptLevel ? `JLPT N${jlptLevel}` : "the most frequent"} kanji
        </p>
      )}

      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No kanji matched. Try a different character, meaning or reading.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((kanji) => (
            <Link
              key={kanji.id}
              href={`/kanji/${encodeURIComponent(kanji.literal)}`}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-900 hover:shadow-sm"
            >
              <span className="jp-glyph text-4xl text-slate-900 group-hover:text-indigo-600">
                {kanji.literal}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {kanji.meanings.slice(0, 3).join(", ")}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {kanji.onReadings.slice(0, 3).join(" / ") || "—"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {kanji.kunReadings.slice(0, 3).join(" / ") || "—"}
                </span>
                <span className="mt-2 flex gap-2 text-[10px] text-slate-400">
                  <span>{kanji.strokeCount ? `${kanji.strokeCount} strokes` : "—"}</span>
                  <span>{kanji.jlptLevel ? `N${kanji.jlptLevel}` : ""}</span>
                  {"matchedOn" in kanji ? <span>match: {kanji.matchedOn}</span> : null}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
