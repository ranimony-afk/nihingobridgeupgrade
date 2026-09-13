"use client";

import { FormEvent, useState } from "react";
import type {
  ApiError,
  DictionaryEntry,
  DictionarySearchResponse,
} from "@/types/dictionary";

type ApiState = "idle" | "loading" | "ready" | "error";

function apiError(value: unknown, fallback: string): string {
  const parsed = value as Partial<ApiError>;
  return parsed.error?.message ?? fallback;
}

function Furigana({ entry }: { entry: DictionaryEntry }) {
  const enrichment = entry.enrichments.find((item) => item.kind === "furigana");
  const rawSegments = enrichment?.value.segments;
  if (!Array.isArray(rawSegments)) return <span>{entry.headword}</span>;

  return (
    <span>
      {rawSegments.map((item, index) => {
        const segment = item as { text?: unknown; reading?: unknown; ruby?: unknown };
        const text = typeof segment.text === "string" ? segment.text : "";
        const reading = typeof segment.reading === "string" ? segment.reading : "";
        return segment.ruby === true ? (
          <ruby key={`${text}-${index}`}>
            {text}
            <rt>{reading}</rt>
          </ruby>
        ) : (
          <span key={`${text}-${index}`}>{text}</span>
        );
      })}
    </span>
  );
}

function ConjugationPanel({ entry }: { entry: DictionaryEntry }) {
  const enrichment = entry.enrichments.find((item) => item.kind === "conjugation");
  const rawForms = enrichment?.value.forms;
  if (!Array.isArray(rawForms)) return null;

  const forms = rawForms
    .map((item) => item as { form?: unknown; text?: unknown; reading?: unknown })
    .filter(
      (item): item is { form: string; text: string; reading: string } =>
        typeof item.form === "string" &&
        typeof item.text === "string" &&
        typeof item.reading === "string",
    );
  if (forms.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        Conjugations
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {forms.map((form) => (
          <div key={form.form} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold capitalize text-slate-500">{form.form}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{form.text}</p>
            <p className="text-xs text-rose-500">{form.reading}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function DictionaryDetail({ entry, onBack }: { entry: DictionaryEntry; onBack: () => void }) {
  const isFixture = entry.provenance?.isFixture === true;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <button
        onClick={onBack}
        className="text-sm font-semibold text-rose-500 transition hover:text-rose-600"
      >
        ← Back to results
      </button>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
            <Furigana entry={entry} />
          </h2>
          <p className="mt-2 text-lg font-medium text-rose-500">{entry.primaryReading}</p>
        </div>
        {entry.isCommon && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            Common word
          </span>
        )}
      </div>

      {entry.kanji.length > 1 && (
        <p className="mt-4 text-sm text-slate-500">
          Other forms: {entry.kanji.slice(1).map((form) => form.text).join(" · ")}
        </p>
      )}

      <section className="mt-7">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Meanings</h3>
        <ol className="mt-2 space-y-3">
          {entry.senses.map((sense, index) => (
            <li key={`${sense.glosses.join("-")}-${index}`} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-50 text-xs font-bold text-rose-600">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold text-slate-800">{sense.glosses.join("; ")}</p>
                {sense.partsOfSpeech.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {sense.partsOfSpeech.join(" · ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ConjugationPanel entry={entry} />

      {entry.provenance && (
        <aside className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          {isFixture && (
            <p className="mb-2 font-bold text-amber-700">
              Development fixture data — not a production corpus record.
            </p>
          )}
          <p>
            Source: <strong>{entry.provenance.source}</strong> · {entry.provenance.attribution}
          </p>
          <p className="mt-1">
            License: {entry.provenance.license} · Source record: {entry.provenance.sourceId}
          </p>
        </aside>
      )}
    </article>
  );
}

export default function DictionaryClient() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ApiState>("idle");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<DictionarySearchResponse | null>(null);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEntry(null);
    setState("loading");
    setMessage("");

    try {
      const response = await fetch(`/api/dictionary?q=${encodeURIComponent(query)}&limit=12`);
      const body = (await response.json()) as DictionarySearchResponse | ApiError;
      if (!response.ok) throw new Error(apiError(body, "Unable to search the dictionary."));
      setResults(body as DictionarySearchResponse);
      setState("ready");
    } catch (error) {
      setResults(null);
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search the dictionary.");
    }
  }

  async function selectEntry(id: number) {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/dictionary/${id}`);
      const body = (await response.json()) as DictionaryEntry | ApiError;
      if (!response.ok) throw new Error(apiError(body, "Unable to load this entry."));
      setEntry(body as DictionaryEntry);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load this entry.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950 p-7 text-white shadow-xl sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-300">Dictionary</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Look it up. Learn it deeply.</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
          Search Japanese words by kanji or reading. Results are served through the
          Nihongo Bridge dictionary API.
        </p>
        <form onSubmit={submit} className="mt-6 flex gap-2">
          <label htmlFor="dictionary-query" className="sr-only">
            Japanese word or reading
          </label>
          <input
            id="dictionary-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="水, 食べる, みず…"
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
        {entry && state === "ready" && (
          <DictionaryDetail entry={entry} onBack={() => setEntry(null)} />
        )}
        {!entry && results && state === "ready" && (
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
                    <button
                      onClick={() => void selectEntry(result.id)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-rose-50"
                    >
                      <span className="min-w-16 text-2xl font-bold text-slate-900">{result.headword}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-rose-500">
                          {result.primaryReading}
                        </span>
                        <span className="block text-sm text-slate-600">{result.firstGloss}</span>
                      </span>
                      {result.isCommon && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          common
                        </span>
                      )}
                      <span className="text-slate-400">→</span>
                    </button>
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
    </main>
  );
}
