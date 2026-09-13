"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { KanjiSearchResult } from "@/types/knowledge";

async function request(url: string, signal?: AbortSignal): Promise<KanjiSearchResult[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: KanjiSearchResult[] };
  return data.results ?? [];
}

/**
 * Typeahead search over the kanji knowledge base.
 * Consumes `GET /api/kanji/search` — the same contract the Flutter client uses.
 */
export function KanjiSearchBox({
  initialQuery = "",
  autoFocus = false,
  placeholder = "Search kanji by character, meaning or reading…",
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<KanjiSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const value = query.trim();
    const controller = new AbortController();

    // All state updates happen inside the debounce/request callback so the
    // effect body itself never triggers a cascading render.
    const timer = setTimeout(() => {
      setLoading(true);
      if (value.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }
      request(`/api/kanji/search?q=${encodeURIComponent(value)}&limit=12`, controller.signal)
        .then((rows) => {
          setResults(rows);
          setHighlight(0);
          setOpen(true);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 160);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = useMemo(
    () => (literal: string) => {
      setOpen(false);
      router.push(`/kanji/${encodeURIComponent(literal)}`);
    },
    [router],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-slate-900">
        <span aria-hidden className="jp-glyph text-xl text-slate-400">
          検
        </span>
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              const target = results[highlight];
              if (target) go(target.literal);
              else if (query.trim()) router.push(`/kanji?q=${encodeURIComponent(query.trim())}`);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          aria-label="Search kanji"
        />
        {loading ? <span className="text-xs text-slate-400">…</span> : null}
      </div>

      {open && results.length > 0 ? (
        <ul className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
          {results.map((result, index) => (
            <li key={result.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => go(result.literal)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                  index === highlight ? "bg-slate-100" : "bg-white"
                }`}
              >
                <span className="jp-glyph text-2xl text-slate-900">{result.literal}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-700">
                    {result.meanings.slice(0, 3).join(", ")}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {result.onReadings.slice(0, 3).join(" / ")}
                    {result.kunReadings.length ? ` · ${result.kunReadings.slice(0, 2).join(" / ")}` : ""}
                  </span>
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {result.jlptLevel ? `N${result.jlptLevel}` : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
