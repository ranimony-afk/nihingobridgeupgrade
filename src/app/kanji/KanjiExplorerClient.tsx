"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { KanjiApiError, KanjiSearchResponse } from "@/types/kanji-v2";
import type { ComponentIndexResponse, ComponentOption } from "@/types/radical-v2";

const PAGE_SIZE = 20;

// KANJIDIC2 convention: 1–6 kyouiku, 8 jouyou, 9–10 jinmeiyou.
const GRADES = [1, 2, 3, 4, 5, 6, 8, 9, 10];
const JLPT_LEVELS = ["N1", "N2", "N3", "N4", "N5"] as const;

type Filters = {
  q: string;
  strokes: string;
  grade: string;
  radical: string;
  jlpt: string;
  component: string;
  /** Comma-separated multi-radical selection (AND semantics). */
  components: string;
};

const EMPTY_FILTERS: Filters = {
  q: "",
  strokes: "",
  grade: "",
  radical: "",
  jlpt: "",
  component: "",
  components: "",
};

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    q: params.get("q") ?? "",
    strokes: params.get("strokes") ?? "",
    grade: params.get("grade") ?? "",
    radical: params.get("radical") ?? "",
    jlpt: params.get("jlpt") ?? "",
    component: params.get("component") ?? "",
    components: params.get("components") ?? "",
  };
}

function selectedComponents(value: string): string[] {
  return value
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/** Build the canonical API query string from filters + pagination. */
function buildQuery(filters: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.strokes.trim()) params.set("strokes", filters.strokes.trim());
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.radical.trim()) params.set("radical", filters.radical.trim());
  if (filters.jlpt) params.set("jlpt", filters.jlpt);
  if (filters.component.trim()) params.set("component", filters.component.trim());
  if (filters.components.trim()) params.set("components", filters.components.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

function hasCriteria(filters: Filters): boolean {
  return Boolean(
    filters.q.trim() ||
      filters.strokes.trim() ||
      filters.grade ||
      filters.radical.trim() ||
      filters.jlpt ||
      filters.component.trim() ||
      filters.components.trim(),
  );
}

/** Canonical shareable URL for the current exploration state. */
function buildShareUrl(filters: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.strokes.trim()) params.set("strokes", filters.strokes.trim());
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.radical.trim()) params.set("radical", filters.radical.trim());
  if (filters.jlpt) params.set("jlpt", filters.jlpt);
  if (filters.component.trim()) params.set("component", filters.component.trim());
  if (filters.components.trim()) params.set("components", filters.components.trim());
  if (offset > 0) params.set("offset", String(offset));
  const search = params.toString();
  return search ? `/kanji?${search}` : "/kanji";
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-rose-300 placeholder:text-slate-400 focus:ring-2";

export default function KanjiExplorerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the single source of truth so explorations are shareable and
  // directly addressable (e.g. /kanji?radical=85).
  const active = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const activeOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  const [draft, setDraft] = useState<Filters>(active);

  // Keep the draft in step when navigating to a shared/bookmarked URL.
  useEffect(() => {
    setDraft(active);
  }, [active]);

  const [results, setResults] = useState<KanjiSearchResponse | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const [componentOptions, setComponentOptions] = useState<ComponentOption[]>([]);

  // Component picker options come from the corpus itself, so the picker only
  // ever offers components that can actually return a result.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/v2/radicals?view=components");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as ComponentIndexResponse;
        if (!cancelled) setComponentOptions(body.components);
      } catch {
        // A picker failure must not break manual search.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apiQuery = useMemo(() => buildQuery(active, activeOffset), [active, activeOffset]);

  useEffect(() => {
    if (!hasCriteria(active)) {
      setResults(null);
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");
    setMessage("");

    (async () => {
      try {
        const response = await fetch(`/api/v2/kanji/search?${apiQuery}`);
        const body = (await response.json()) as KanjiSearchResponse | KanjiApiError;
        if (cancelled) return;
        if (!response.ok) {
          const parsed = body as Partial<KanjiApiError>;
          throw new Error(parsed.error?.message ?? "Unable to search kanji.");
        }
        setResults(body as KanjiSearchResponse);
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setResults(null);
        setState("error");
        setMessage(error instanceof Error ? error.message : "Unable to search kanji.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiQuery, active]);

  const applyFilters = useCallback(
    (next: Filters, offset = 0) => {
      const share = buildShareUrl(next, offset);
      const target = share === "/kanji" ? pathname : share;
      // Replace the URL rather than pushing, so filter typing does not build
      // an unusable back-history stack.
      //
      // NOTE: this page must stay `force-dynamic`. Under `force-static` the
      // App Router resolves router.replace() successfully but never updates
      // the address bar, so pagination and Clear silently do nothing.
      router.replace(target, { scroll: false });
    },
    [router, pathname],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(draft, 0);
  }

  function update(key: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /** Toggle a component in the multi-radical selection and search immediately. */
  function toggleComponent(component: string) {
    const current = selectedComponents(draft.components);
    const next = current.includes(component)
      ? current.filter((item) => item !== component)
      : [...current, component];
    const updated = { ...draft, components: next.join(",") };
    setDraft(updated);
    applyFilters(updated, 0);
  }

  const chosenComponents = selectedComponents(draft.components);

  const totalPages = results ? Math.max(1, Math.ceil(results.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(activeOffset / PAGE_SIZE) + 1;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-7 text-white shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">
          Kanji Explorer
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Every character, broken down.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
          Search by kanji, meaning, or reading — then filter by stroke count,
          school grade, radical, JLPT level, or component.
        </p>
      </section>

      <form
        onSubmit={onSubmit}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <Field label="Search" htmlFor="kanji-q">
          <input
            id="kanji-q"
            value={draft.q}
            onChange={(event) => update("q", event.target.value)}
            placeholder="水, water, みず, mizu…"
            maxLength={100}
            className={inputClass}
          />
        </Field>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Strokes" htmlFor="kanji-strokes">
            <input
              id="kanji-strokes"
              value={draft.strokes}
              onChange={(event) => update("strokes", event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="1–64"
              className={inputClass}
            />
          </Field>

          <Field label="Grade" htmlFor="kanji-grade">
            <select
              id="kanji-grade"
              value={draft.grade}
              onChange={(event) => update("grade", event.target.value)}
              className={inputClass}
            >
              <option value="">Any</option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Radical" htmlFor="kanji-radical">
            <input
              id="kanji-radical"
              value={draft.radical}
              onChange={(event) => update("radical", event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="1–214"
              className={inputClass}
            />
          </Field>

          <Field label="JLPT" htmlFor="kanji-jlpt">
            <select
              id="kanji-jlpt"
              value={draft.jlpt}
              onChange={(event) => update("jlpt", event.target.value)}
              className={inputClass}
            >
              <option value="">Any</option>
              {JLPT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Component" htmlFor="kanji-component">
            <input
              id="kanji-component"
              value={draft.component}
              onChange={(event) => update("component", event.target.value)}
              placeholder="言"
              maxLength={4}
              className={inputClass}
            />
          </Field>
        </div>

        {componentOptions.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Multi-radical search
              </p>
              <p className="text-xs text-slate-400">
                Pick several — results contain <strong>all</strong> of them.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="component-picker">
              {componentOptions.map((option) => {
                const active = chosenComponents.includes(option.component);
                return (
                  <button
                    key={option.component}
                    type="button"
                    onClick={() => toggleComponent(option.component)}
                    aria-pressed={active}
                    title={
                      option.meaning
                        ? `${option.meaning} · ${option.kanjiCount} kanji`
                        : `${option.kanjiCount} kanji`
                    }
                    className={`grid h-10 w-10 place-items-center rounded-lg border text-lg font-bold transition ${
                      active
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:border-rose-300 hover:bg-rose-50"
                    }`}
                  >
                    {option.component}
                  </button>
                );
              })}
            </div>
            {chosenComponents.length > 0 && (
              <p className="mt-2 text-xs text-slate-500" data-testid="component-selection">
                Selected: <strong>{chosenComponents.join(" + ")}</strong>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600"
          >
            Explore
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              applyFilters(EMPTY_FILTERS, 0);
            }}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Clear
          </button>
          <span className="ml-auto text-xs text-slate-400">
            JLPT levels are source-curated guides, not an official exam syllabus.
          </span>
        </div>
      </form>

      <section className="mt-6" aria-live="polite">
        {state === "loading" && <p className="py-8 text-center text-slate-500">Searching…</p>}

        {state === "error" && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {message}
          </p>
        )}

        {state === "idle" && (
          <p className="py-10 text-center text-sm text-slate-500">
            Enter a search term or choose a filter to begin exploring.
          </p>
        )}

        {state === "ready" && results && (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-sm text-slate-500">
                <strong data-testid="result-total">{results.total}</strong> kanji
                {results.query ? <> matching “{results.query}”</> : null}
                {results.filters.component ? (
                  <> containing component “{results.filters.component}”</>
                ) : null}
                {results.filters.components.length > 0 ? (
                  <> containing all of “{results.filters.components.join(" + ")}”</>
                ) : null}
              </p>
              <p className="text-xs text-slate-400">
                Page {currentPage} of {totalPages}
              </p>
            </div>

            {results.results.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No kanji match those criteria.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="kanji-results">
                {results.results.map((item) => (
                  <li key={item.literal}>
                    <Link
                      href={`/kanji/${encodeURIComponent(item.literal)}`}
                      className="flex h-full items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                    >
                      <span className="text-4xl font-bold leading-none text-slate-900">
                        {item.literal}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-700">
                          {item.meanings.join(", ") || "—"}
                        </span>
                        {item.onReadings.length > 0 && (
                          <span className="mt-1 block truncate text-xs text-rose-500">
                            On: {item.onReadings.join("、")}
                          </span>
                        )}
                        {item.kunReadings.length > 0 && (
                          <span className="block truncate text-xs text-slate-400">
                            Kun: {item.kunReadings.join("、")}
                          </span>
                        )}
                        <span className="mt-2 flex flex-wrap gap-1">
                          {item.strokeCount !== null && (
                            <Badge>{item.strokeCount} strokes</Badge>
                          )}
                          {item.grade !== null && <Badge>grade {item.grade}</Badge>}
                          {item.jlptLevels.map((level) => (
                            <Badge key={level} tone="sky">
                              {level}
                            </Badge>
                          ))}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {results.total > PAGE_SIZE && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={activeOffset === 0}
                  onClick={() =>
                    applyFilters(active, Math.max(0, activeOffset - PAGE_SIZE))
                  }
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-sm text-slate-500">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={activeOffset + PAGE_SIZE >= results.total}
                  onClick={() => applyFilters(active, activeOffset + PAGE_SIZE)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "sky";
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        tone === "sky" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}
