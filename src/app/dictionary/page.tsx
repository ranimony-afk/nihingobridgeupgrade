import Link from "next/link";

import { searchDictionary } from "@/services/knowledge/vocabulary";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }>;

export default async function DictionaryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const results = query ? await searchDictionary(query, 48) : [];

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Dictionary</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          JMdict headwords. Every entry is linked back to the kanji it contains, which is how the
          Mind Tree resolves its vocabulary branch.
        </p>
        <form action="/dictionary" className="max-w-2xl">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-slate-900">
            <span aria-hidden className="jp-glyph text-xl text-slate-400">
              辞
            </span>
            <input
              name="q"
              defaultValue={query}
              placeholder="日本語, にほんご, water…"
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
              aria-label="Search the dictionary"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Search
            </button>
          </div>
        </form>
      </header>

      {query ? (
        <p className="text-xs text-slate-500">
          {results.length} result(s) for “{query}”
        </p>
      ) : null}

      {query && results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing found for “{query}”.
        </p>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2">
        {results.map((entry) => (
          <li key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="jp text-2xl text-slate-900">{entry.kanjiText}</span>
              {entry.kanaText ? (
                <span className="jp text-sm text-slate-500">{entry.kanaText}</span>
              ) : null}
              {entry.priority ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  priority {entry.priority}
                </span>
              ) : null}
            </div>
            {entry.partsOfSpeech.length > 0 ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                {entry.partsOfSpeech.slice(0, 4).join(" · ")}
              </p>
            ) : null}
            <ol className="mt-2 space-y-0.5 text-sm text-slate-700">
              {entry.meanings.slice(0, 6).map((meaning, index) => (
                <li key={meaning}>
                  {index + 1}. {meaning}
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...new Set([...entry.kanjiText])].map((char, index) => (
                <Link
                  key={`${char}-${index}`}
                  href={`/kanji/${encodeURIComponent(char)}`}
                  className="jp-glyph rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 transition hover:border-indigo-500 hover:text-indigo-700"
                >
                  {char}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
