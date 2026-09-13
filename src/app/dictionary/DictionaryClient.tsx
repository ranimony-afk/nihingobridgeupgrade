"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type {
  DictionaryV2ApiError,
  DictionaryV2SearchResponse,
} from "@/types/dictionary-v2";

type ApiState = "idle" | "loading" | "ready" | "error";

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

function apiError(value: unknown, fallback: string): string {
  const parsed = value as Partial<DictionaryV2ApiError>;
  return parsed.error?.message ?? fallback;
}

const FIELD_LABEL: Record<string, string> = {
  japanese: "kanji",
  kana: "kana",
  romaji: "romaji",
  english: "English",
};

export default function DictionaryClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialJlpt = searchParams.get("jlpt") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [jlpt, setJlpt] = useState(initialJlpt);
  const [state, setState] = useState<ApiState>("idle");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<DictionaryV2SearchResponse | null>(null);

  async function runSearch(q: string, level: string) {
    if (q.trim() === "" && level === "") {
      setResults(null);
      setState("idle");
      return;
    }
    setState("loading");
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (level) params.set("jlpt", level);
      params.set("limit", "20");
      const response = await fetch(`/api/v2/dictionary/search?${params.toString()}`);
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

  // Deep-linkable: /dictionary?q=水 runs on load.
  useEffect(() => {
    void runSearch(initialQuery, initialJlpt);
  }, [initialQuery, initialJlpt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (jlpt) params.set("jlpt", jlpt);
    router.push(`/dictionary${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 p-7 text-white shadow-xl sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-300">Dictionary</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Look it up. Learn it deeply.</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
          Search Japanese words, kana readings, romaji, or English meanings — or browse by
          JLPT level.
        </p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row" data-testid="dictionary-search-form">
          <label htmlFor="dictionary-query" className="sr-only">
            Japanese word, reading, romaji or English
          </label>
          <input
            id="dictionary-query"
            data-testid="dictionary-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="水, 食べる, みず, mizu, water…"
            maxLength={100}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2"
          />
          <label htmlFor="dictionary-jlpt" className="sr-only">
            JLPT level
          </label>
          <select
            id="dictionary-jlpt"
            data-testid="dictionary-jlpt-select"
            value={jlpt}
            onChange={(event) => setJlpt(event.target.value)}
            className="rounded-xl border border-white/20 bg-white px-3 py-3 text-slate-900 outline-none ring-rose-300 focus:ring-2"
          >
            <option value="">Any JLPT</option>
            {JLPT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <button
            type="submit"
            data-testid="dictionary-search-submit"
            disabled={state === "loading"}
            className="rounded-xl bg-rose-500 px-5 py-3 font-bold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Search
          </button>
        </form>
      </section>

      <section className="mt-6" aria-live="polite" data-testid="dictionary-results">
        {state === "loading" && (
          <p className="py-8 text-center text-slate-500" data-testid="dictionary-loading">
            Searching…
          </p>
        )}
        {state === "error" && (
          <p
            className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700"
            data-testid="dictionary-error"
          >
            {message}
          </p>
        )}
        {results && state === "ready" && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500" data-testid="dictionary-result-count">
              {results.total} result{results.total === 1 ? "" : "s"}
              {results.query ? ` for “${results.query}”` : ""}
              {results.filters.jlpt ? ` · ${results.filters.jlpt}` : ""}
            </div>
            {results.results.length === 0 ? (
              <p className="p-6 text-center text-slate-500" data-testid="dictionary-empty">
                No matching entries in this corpus.
              </p>
            ) : (
              <ul>
                {results.results.map((result) => (
                  <li key={result.id} className="border-b border-slate-100 last:border-0">
                    <Link
                      href={`/dictionary/${result.id}`}
                      data-testid="dictionary-result"
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-rose-50"
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
                      <span className="flex flex-wrap items-center justify-end gap-1">
                        {result.jlptLevels.map((level) => (
                          <span
                            key={level}
                            className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700"
                          >
                            {level}
                          </span>
                        ))}
                        {result.isCommon && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            common
                          </span>
                        )}
                        {result.matchedFields.slice(0, 1).map((field) => (
                          <span
                            key={field}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            {FIELD_LABEL[field] ?? field}
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
          <p className="py-8 text-center text-sm text-slate-500" data-testid="dictionary-idle">
            Try a word from your deck: 水, 食べる, 学校, or 先生.
          </p>
        )}
      </section>
    </main>
  );
}
