"use client";

import { FormEvent, useState } from "react";

type Result = {
  kind: string;
  id: string;
  title: string;
  reading: string | null;
  summary: string | null;
  jlptLevel: string | null;
};

const routeFor: Record<string, (id: string, title: string) => string> = {
  lexeme: (id) => `/knowledge/lexemes/${id}`,
  kanji: (_id, title) => `/knowledge/kanji/${encodeURIComponent(title)}`,
  grammar: (id) => `/knowledge/grammar/${id}`,
  sentence: (id) => `/knowledge/sentences/${id}`,
};

export function KnowledgeExplorer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [message, setMessage] = useState("Search Japanese, readings, English glosses, grammar, and example sentences.");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/knowledge/search?q=${encodeURIComponent(query)}&limit=30`);
      const body = (await response.json()) as { results?: Result[]; error?: string };
      if (!response.ok) {
        setResults([]);
        setMessage(body.error ?? "Search is temporarily unavailable.");
        return;
      }
      setResults(body.results ?? []);
      setMessage((body.results?.length ?? 0) === 0 ? "No matching records are imported yet." : "");
    } catch {
      setResults([]);
      setMessage("Search is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10"><div className="mx-auto max-w-5xl"><a href="/" className="text-sm font-bold text-[#277a5c] underline">← Learning dashboard</a><div className="mt-5"><p className="text-xs font-extrabold tracking-[.16em] text-[#277a5c]">JAPANESE KNOWLEDGE GRAPH</p><h1 className="mt-1 font-serif text-5xl font-normal tracking-tight text-[#18231d]">Look deeper into every word.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#657166]">Dictionary senses, furigana, pitch accent, kanji components and strokes, grammar, corpus sentences, and semantic links are sourced with recorded provenance.</p></div><form onSubmit={search} className="mt-7 flex gap-3 rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-3 shadow-[0_10px_28px_rgba(40,59,43,0.05)]"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try 日本, 食べる, ～ている, or hello" className="min-w-0 flex-1 rounded-xl border border-[#cdd7ca] bg-white px-4 py-3 text-sm outline-none ring-[#277a5c] focus:ring-2" /><button disabled={loading} className="rounded-xl bg-[#277a5c] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60">{loading ? "Searching…" : "Search"}</button></form>{message && <p role="status" className="mt-4 text-sm text-[#657166]">{message}</p>}<section className="mt-6 grid gap-3">{results.map((result) => { const href = routeFor[result.kind]?.(result.id, result.title); const content = <><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#277a5c]">{result.kind}{result.jlptLevel ? ` · ${result.jlptLevel}` : ""}</p><h2 className="mt-1 font-serif text-2xl font-normal text-[#18231d]">{result.title}</h2>{result.reading && <p className="mt-1 text-sm text-[#526157]">{result.reading}</p>}</div><span className="text-xs font-bold text-[#748076]">View →</span></div>{result.summary && <p className="mt-3 text-sm leading-6 text-[#657166]">{result.summary.slice(0, 260)}</p>}</>; return href ? <a href={href} key={`${result.kind}-${result.id}`} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5 transition hover:-translate-y-0.5 hover:border-[#9fc4a4]">{content}</a> : <article key={`${result.kind}-${result.id}`} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5">{content}</article>; })}</section></div></main>
  );
}
