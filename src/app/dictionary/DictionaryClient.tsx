"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type {
  DictionaryV2ApiError,
  DictionaryV2SearchResponse,
} from "@/types/dictionary-v2";

type ApiState = "idle" | "loading" | "ready" | "error";

function apiError(value: unknown, fallback: string): string {
  const parsed = value as Partial<DictionaryV2ApiError>;
  return parsed.error?.message ?? fallback;
}

const FIELD_LABELS: Record<string, string> = {
  japanese: "kanji",
  kana: "kana",
  romaji: "romaji",
  english: "english",
};

export default function DictionaryClient() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ApiState>("idle");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<DictionaryV2SearchResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("");

    try {
      const response = await fetch(
        `/api/v2/dictionary/search?q=${encodeURIComponent(query)}&limit=12`,
      );
      const body = (await response.json()) as DictionaryV2SearchResponse | DictionaryV2ApiError;
      if (!response.ok) throw new Error(apiError(body, "Unable to search the dictionary."));
      setResults(body as DictionaryV2SearchResponse);
      setState("ready");
    } catch (error) {
      setResults(null);
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search the dictionary.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 p-7 text-white shadow-xl sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-300">Dictionary</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Look it up. Learn it deeply.</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
          Search Japanese words, kana readings, romaji, or English meanings. Results are served
          through the Nihongo Bridge dictionary API.
        </p>
        <form onSubmit={submit} className="mt-6 flex gap-2">
          <label htmlFor="dictionary-query" className="sr-only">
            Japanese word or reading
          </label>
          <input
            id="dictionary-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="水, 食べる, みず, mizu, water…"
            maxLength={100}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="rounded-xl bg-rose-500 px-5 py-3 font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Search
          </button>
        </form>
      </section>

      <section className="mt-6" aria-live="polite">
        {state === "loading" && <p className="py-8 text-center text-slate-500">Searching…</p>}
        {state === "error" && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {message}
          </p>
        )}
        {results && state === "ready" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
              {results.total} result{results.total === 1 ? "" : "s"} for “{results.query}”
            </div>
            {results.results.length === 0 ? (
              <p className="p-6 text-center text-slate-500">No matching entries in this corpus.</p>
            ) : (
              <ul>
                {results.results.map((result) => (
                  <li key={result.id} className="border-b border-slate-100 last:border-0">
                    <Link
                      href={`/dictionary/${result.id}`}
                      className="flex w-full items-center gap-4 px-5 py-4 transition hover:bg-rose-50"
                    >
                      <span className="min-w-16 text-2xl font-bold text-slate-900">
                        {result.headword}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-rose-500">
                          {result.primaryReading}
                        </span>
                        <span className="block text-sm text-slate-600">{result.firstGloss}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        {result.isCommon && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            common
                          </span>
                        )}
                        {result.jlptLevels.map((level) => (
                          <span
                            key={level}
                            className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700"
                          >
                            {level}
                          </span>
                        ))}
                      </span>
                      <span className="text-slate-400">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {state === "idle" && (
          <p className="py-8 text-center text-sm text-slate-500">
            Try a word from your deck: 水, 食べる, 学校, or 先生.
          </p>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-slate-400">
        Matched on:{" "}
        {Object.values(FIELD_LABELS).join(" · ")}
      </p>
    </main>
  );
}
