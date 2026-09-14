"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GrammarPointSummary } from "@/types/grammar";

interface ExplorerInitial {
  points: GrammarPointSummary[];
  total: number;
  limit: number;
  offset: number;
}

const REGISTERS = [
  { value: "", label: "Any register" },
  { value: "polite", label: "Polite" },
  { value: "casual", label: "Casual" },
  { value: "spoken", label: "Spoken" },
  { value: "written", label: "Written" },
  { value: "neutral", label: "Neutral" },
];

const SORTS = [
  { value: "order", label: "Teaching order" },
  { value: "level", label: "JLPT level" },
  { value: "title", label: "Title" },
  { value: "examples", label: "Most examples" },
  { value: "relevance", label: "Relevance" },
];

/**
 * Interactive grammar explorer.
 *
 * Server-renders the first page (SEO + no-JS) and then queries the canonical
 * `GET /api/grammar` contract for every interaction — the same endpoint the
 * Flutter client uses.
 */
export function GrammarExplorer({
  initial,
  tags,
  levels,
}: {
  initial: ExplorerInitial;
  tags: Array<{ slug: string; total: number }>;
  levels: Array<{ jlptLevel: number | null; total: number; examples: number }>;
}) {
  const [query, setQuery] = useState("");
  const [jlpt, setJlpt] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [register, setRegister] = useState("");
  const [sort, setSort] = useState("order");
  const [limit] = useState(initial.limit || 24);

  const [points, setPoints] = useState<GrammarPointSummary[]>(initial.points);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtersKey = `${query}|${jlpt}|${tag}|${register}|${sort}`;

  useEffect(() => {
    const controller = new AbortController();
    // Debounce text input; filter changes run on the next tick so state
    // updates never happen synchronously inside the effect body.
    const delay = query ? 180 : 0;
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit), sort });
      if (query.trim()) params.set("q", query.trim());
      if (jlpt) params.set("jlpt", String(jlpt));
      if (tag) params.set("tag", tag);
      if (register) params.set("register", register);

      try {
        const response = await fetch(`/api/grammar?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `request failed (${response.status})`);
        }
        const body = (await response.json()) as {
          data: { points: GrammarPointSummary[] };
          meta: { pagination?: { total?: number } };
        };
        if (cancelled) return;
        setPoints((previous) => (page === 0 ? body.data.points : [...previous, ...body.data.points]));
        setTotal(body.meta.pagination?.total ?? body.data.points.length);
        setError(null);
      } catch (cause) {
        if (cancelled || (cause as Error)?.name === "AbortError") return;
        setError((cause as Error)?.message ?? "request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      setLoading(true);
      void run();
    }, delay);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [filtersKey, page, limit, query, jlpt, tag, register, sort]);

  const resetPaging = () => setPage(0);

  const activeFilters = useMemo(
    () =>
      [
        jlpt ? { key: "jlpt", label: `JLPT N${jlpt}` } : null,
        tag ? { key: "tag", label: `#${tag}` } : null,
        register ? { key: "register", label: register } : null,
        sort !== "order" ? { key: "sort", label: `sort: ${sort}` } : null,
      ].filter((item): item is { key: string; label: string } => item !== null),
    [jlpt, tag, register, sort],
  );

  const clearAll = () => {
    setJlpt(null);
    setTag(null);
    setRegister("");
    setSort("order");
    setQuery("");
    resetPaging();
  };

  const shown = points.length;

  return (
    <div className="space-y-6" data-testid="grammar-explorer">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[240px] flex-1 items-center gap-3 rounded-2xl border border-slate-300 px-4 py-2.5 focus-within:border-slate-900">
            <span aria-hidden className="jp-glyph text-lg text-slate-400">
              検
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPaging();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Search grammar: てしまう, conditional, purpose…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              aria-label="Search grammar points"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  resetPaging();
                }}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                clear
              </button>
            ) : null}
          </div>

          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              resetPaging();
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            aria-label="Sort grammar points"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={register}
            onChange={(event) => {
              setRegister(event.target.value);
              resetPaging();
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            aria-label="Filter by register"
          >
            {REGISTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {[5, 4, 3, 2, 1].map((level) => {
            const meta = levels.find((item) => item.jlptLevel === level);
            const active = jlpt === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => {
                  setJlpt(active ? null : level);
                  resetPaging();
                }}
                className={`rounded-full border px-3 py-1 transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                N{level}
                {meta ? <span className="ml-1 opacity-60">{meta.total}</span> : null}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          {tags.slice(0, 12).map((tagItem) => {
            const active = tag === tagItem.slug;
            return (
              <button
                key={tagItem.slug}
                type="button"
                onClick={() => {
                  setTag(active ? null : tagItem.slug);
                  resetPaging();
                }}
                className={`rounded-full px-2.5 py-1 transition ${
                  active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                #{tagItem.slug}
                <span className="ml-1 opacity-60">{tagItem.total}</span>
              </button>
            );
          })}
        </div>

        {activeFilters.length > 0 || query ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"
              >
                {filter.label}
              </span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-500 hover:border-slate-400"
            >
              Reset filters
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p>
          Showing <strong className="text-slate-800">{shown}</strong> of{" "}
          <strong className="text-slate-800">{total}</strong> grammar points
          {loading ? " · loading…" : ""}
        </p>
        <p className="text-slate-400">
          Data: <code>GET /api/grammar</code>
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {points.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No grammar points match these filters.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {points.map((point) => (
            <Link
              key={`${point.slug}-${point.id}`}
              href={`/grammar/${encodeURIComponent(point.slug)}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-500 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="jp text-xl text-slate-900 group-hover:text-indigo-700">
                  {point.title}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
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
                  <span
                    key={pattern}
                    className="jp rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                  >
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

      {shown < total ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setPage((value) => value + 1)}
            disabled={loading}
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 transition hover:border-slate-900 disabled:opacity-50"
          >
            {loading ? "Loading…" : `Load ${Math.min(limit, total - shown)} more`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
