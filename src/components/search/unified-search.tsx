"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  SearchEntityType,
  SearchFacets,
  SearchHit,
  SearchMode,
  SearchSuggestion,
} from "@/types/search";

const ENTITY_META: Record<
  SearchEntityType,
  { label: string; glyph: string; chip: string; border: string }
> = {
  kanji: {
    label: "Kanji",
    glyph: "漢",
    chip: "bg-indigo-100 text-indigo-700",
    border: "hover:border-indigo-500",
  },
  dictionary: {
    label: "Dictionary",
    glyph: "辞",
    chip: "bg-rose-100 text-rose-700",
    border: "hover:border-rose-500",
  },
  grammar: {
    label: "Grammar",
    glyph: "文",
    chip: "bg-emerald-100 text-emerald-700",
    border: "hover:border-emerald-500",
  },
  sentence: {
    label: "Sentences",
    glyph: "例",
    chip: "bg-amber-100 text-amber-700",
    border: "hover:border-amber-500",
  },
  course: {
    label: "Courses",
    glyph: "道",
    chip: "bg-sky-100 text-sky-700",
    border: "hover:border-sky-500",
  },
  lesson: {
    label: "Lessons",
    glyph: "習",
    chip: "bg-violet-100 text-violet-700",
    border: "hover:border-violet-500",
  },
};

const MODES: Array<{ value: SearchMode; label: string; note: string }> = [
  { value: "auto", label: "Best match", note: "exact → prefix → full-text → fuzzy" },
  { value: "exact", label: "Exact", note: "literal, reading, pattern or alias equality" },
  { value: "full_text", label: "Full text", note: "PostgreSQL tsvector over English knowledge" },
  { value: "fuzzy", label: "Fuzzy", note: "pg_trgm typo tolerance" },
];

interface InitialSearch {
  query: string;
  mode: SearchMode;
  types: SearchEntityType[];
  hits: SearchHit[];
  facets: SearchFacets;
  total: number;
  limit: number;
}

/** API-first unified search client. */
export function UnifiedSearch({ initial }: { initial: InitialSearch }) {
  const [query, setQuery] = useState(initial.query);
  const [mode, setMode] = useState<SearchMode>(initial.mode);
  const [types, setTypes] = useState<Set<SearchEntityType>>(new Set(initial.types));
  const [hits, setHits] = useState<SearchHit[]>(initial.hits);
  const [facets, setFacets] = useState<SearchFacets>(initial.facets);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const limit = initial.limit || 24;

  const typeKey = [...types].sort().join(",");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const normalized = query.trim();
      if (!normalized || types.size === 0) {
        setHits([]);
        setTotal(0);
        setFacets({ kanji: 0, dictionary: 0, grammar: 0, sentence: 0, course: 0, lesson: 0 });
        setLoading(false);
        return;
      }
      setLoading(true);
      const params = new URLSearchParams({
        q: normalized,
        mode,
        types: typeKey,
        limit: String(limit),
        offset: String(page * limit),
      });
      try {
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          data?: { hits?: SearchHit[]; facets?: SearchFacets };
          meta?: { pagination?: { total?: number } };
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(body.error?.message ?? `search failed (${response.status})`);
        if (cancelled) return;
        const nextHits = body.data?.hits ?? [];
        setHits((previous) => (page === 0 ? nextHits : [...previous, ...nextHits]));
        setFacets(body.data?.facets ?? { kanji: 0, dictionary: 0, grammar: 0, sentence: 0, course: 0, lesson: 0 });
        setTotal(body.meta?.pagination?.total ?? nextHits.length);
        setError(null);
      } catch (cause) {
        if (cancelled || (cause as Error)?.name === "AbortError") return;
        setError((cause as Error)?.message ?? "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query === initial.query && page === 0 ? 0 : 220);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, mode, typeKey, page, limit, types, initial.query]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(async () => {
      const normalized = query.trim();
      if (!normalized || normalized.length > 160 || types.size === 0) {
        setSuggestions([]);
        return;
      }
      try {
        const params = new URLSearchParams({ q: normalized, types: typeKey, limit: "7" });
        const response = await fetch(`/api/search/suggest?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          data?: { suggestions?: SearchSuggestion[] };
        };
        if (!cancelled) setSuggestions(body.data?.suggestions ?? []);
      } catch {
        // Abort/offline: autocomplete is optional; full search remains usable.
      }
    }, 120);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, typeKey, types]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const toggleType = (type: SearchEntityType) => {
    setTypes((previous) => {
      const next = new Set(previous);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
    setPage(0);
  };

  const hasMore = hits.length < total;
  const counts = useMemo(
    () => facets,
    [facets],
  );

  return (
    <div className="space-y-6" data-testid="unified-search">
      <div ref={containerRef} className="relative rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-300 px-4 py-3 focus-within:border-slate-900">
              <span aria-hidden className="jp-glyph text-xl text-slate-400">
                検
              </span>
              <input
                value={query}
                autoFocus
                onFocus={() => setSuggestionsOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                  setSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSuggestionsOpen(false);
                }}
                placeholder="Search kanji, words, readings, meanings, grammar…"
                className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                aria-label="Search all Japanese knowledge"
              />
              {loading ? <span className="text-xs text-slate-400">searching…</span> : null}
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setPage(0);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  clear
                </button>
              ) : null}
            </div>

            {suggestionsOpen && suggestions.length > 0 ? (
              <ul className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
                {suggestions.map((suggestion) => {
                  const meta = ENTITY_META[suggestion.entityType];
                  return (
                    <li key={`${suggestion.entityType}:${suggestion.externalKey}`}>
                      <Link
                        href={suggestion.route}
                        onClick={() => setSuggestionsOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 transition hover:bg-slate-50"
                      >
                        <span className="jp-glyph grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-sm text-slate-700">
                          {meta.glyph}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="jp block truncate text-sm text-slate-900">
                            {suggestion.primaryText}
                          </span>
                          {suggestion.secondaryText ? (
                            <span className="block truncate text-xs text-slate-500">
                              {suggestion.secondaryText}
                            </span>
                          ) : null}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${meta.chip}`}>
                          {suggestion.entityType}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as SearchMode);
              setPage(0);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700"
            aria-label="Search strategy"
          >
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(ENTITY_META) as SearchEntityType[]).map((type) => {
            const meta = ENTITY_META[type];
            const active = types.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                <span className="jp-glyph">{meta.glyph}</span>
                {meta.label}
                <span className="opacity-60">{counts[type]}</span>
              </button>
            );
          })}
          <span className="ml-auto text-slate-400">
            Engine: PostgreSQL · {MODES.find((item) => item.value === mode)?.note}
          </span>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {query.trim() ? (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            <strong className="text-slate-800">{total}</strong> result{total === 1 ? "" : "s"} for “{query.trim()}”
          </p>
          <Link href="/api/search/stats" className="hover:text-slate-900">
            index health →
          </Link>
        </div>
      ) : (
        <SearchStarters onPick={(value) => setQuery(value)} />
      )}

      {query.trim() && hits.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No results in the selected knowledge types. Try “Best match” for typo-tolerant search.
        </p>
      ) : null}

      <ul className="grid gap-3 lg:grid-cols-2">
        {hits.map((hit) => {
          const meta = ENTITY_META[hit.entityType];
          return (
            <li key={`${hit.entityType}:${hit.id}`}>
              <Link
                href={hit.route}
                className={`flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-sm ${meta.border}`}
              >
                <span className="jp-glyph grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 text-2xl text-slate-900">
                  {hit.entityType === "kanji" ? hit.primaryText : meta.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="jp text-lg font-medium text-slate-900">{hit.primaryText}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.chip}`}>
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {hit.matchedOn.replace("_", " ")}
                    </span>
                    {hit.jlptLevel ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        N{hit.jlptLevel}
                      </span>
                    ) : null}
                  </span>
                  {hit.secondaryText ? (
                    <span className="jp mt-0.5 block truncate text-xs text-slate-500">
                      {hit.secondaryText}
                    </span>
                  ) : null}
                  {hit.description ? (
                    <span className="mt-2 block line-clamp-2 text-sm text-slate-600">
                      {hit.description}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 text-slate-300">→</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPage((value) => value + 1)}
            disabled={loading}
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 transition hover:border-slate-900 disabled:opacity-50"
          >
            {loading ? "Loading…" : `Load ${Math.min(limit, total - hits.length)} more`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SearchStarters({ onPick }: { onPick: (value: string) => void }) {
  const starters = [
    { query: "語", note: "exact kanji" },
    { query: "にほんご", note: "reading" },
    { query: "water", note: "English meaning" },
    { query: "conditional", note: "grammar concept" },
    { query: "conditonal", note: "fuzzy typo" },
    { query: "〜てしまう", note: "grammar pattern" },
  ];
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Try a search</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {starters.map((starter) => (
          <button
            key={starter.query}
            type="button"
            onClick={() => onPick(starter.query)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-slate-900"
          >
            <span className="jp block text-sm text-slate-800">{starter.query}</span>
            <span className="block text-[10px] text-slate-400">{starter.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
