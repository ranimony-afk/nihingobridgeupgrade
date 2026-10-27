"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { DictionaryAutocomplete } from "@/components/dictionary/DictionaryAutocomplete";
import {
  DictionaryEntryCard,
  type DictionaryEntryCardEntry,
} from "@/components/dictionary/DictionaryEntryCard";
import { DictionarySearchError } from "@/components/dictionary/DictionarySearchError";
import {
  DictionarySearchRequestManager,
  type DictionarySearchFailureReason,
} from "@/lib/dictionary/searchRequest";
import {
  buildDictionarySearchHref,
  DICTIONARY_JLPT_LEVELS,
  parseDictionarySearchState,
  planDictionarySearchUpdate,
  type DictionaryLevelFilter,
  type DictionarySearchState,
} from "@/lib/dictionary/searchState";

const LEVEL_FILTERS: readonly DictionaryLevelFilter[] = ["ALL", ...DICTIONARY_JLPT_LEVELS];

function DictionarySearchFallback() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-red-600" aria-hidden="true" />
      <p className="text-sm font-medium">Loading dictionary search...</p>
    </div>
  );
}

export default function DictionarySearchPage() {
  return (
    <Suspense fallback={<DictionarySearchFallback />}>
      <DictionarySearchContent />
    </Suspense>
  );
}

function DictionarySearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const committedSearch = useMemo(
    () => parseDictionarySearchState(searchParams),
    [searchParams]
  );
  const [queryDraft, setQueryDraft] = useState({
    committedQuery: committedSearch.query,
    value: committedSearch.query,
  });
  if (queryDraft.committedQuery !== committedSearch.query) {
    setQueryDraft({
      committedQuery: committedSearch.query,
      value: committedSearch.query,
    });
  }
  const query =
    queryDraft.committedQuery === committedSearch.query
      ? queryDraft.value
      : committedSearch.query;
  const committedSearchHref = buildDictionarySearchHref(committedSearch);
  const [entries, setEntries] = useState<DictionaryEntryCardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchFailure, setSearchFailure] = useState<DictionarySearchFailureReason | null>(null);
  const requestManagerRef = useRef<DictionarySearchRequestManager | null>(null);
  const updateQuery = useCallback(
    (value: string) => {
      setQueryDraft({ committedQuery: committedSearch.query, value });
    },
    [committedSearch.query]
  );

  // Search execution
  const fetchEntries = useCallback(
    async (q: string, level: DictionaryLevelFilter, common: boolean) => {
      const manager =
        requestManagerRef.current ??
        (requestManagerRef.current = new DictionarySearchRequestManager());

      setLoading(true);
      setSearchFailure(null);

      const completion = await manager.search({
        query: q,
        level,
        commonOnly: common,
      });

      // A newer request owns the UI now; this completion cannot change it.
      if (!completion.isCurrent) return;

      if (completion.outcome.ok) {
        setEntries(completion.outcome.entries);
        setTotal(completion.outcome.total);
        setSearchFailure(null);
      } else if (completion.outcome.reason !== "aborted") {
        setSearchFailure(completion.outcome.reason);
      }

      setLoading(false);
    },
    []
  );

  useEffect(() => {
    return () => requestManagerRef.current?.cancel();
  }, []);

  const applySearchState = useCallback(
    (nextState: DictionarySearchState, refreshIfUnchanged = false) => {
      const currentQueryString = searchParams.toString();
      const currentHref = currentQueryString
        ? `/dictionary?${currentQueryString}`
        : "/dictionary";
      const plan = planDictionarySearchUpdate(
        currentHref,
        committedSearch,
        nextState,
        refreshIfUnchanged
      );

      if (plan.shouldNavigate) {
        router.push(plan.href, { scroll: false });
      }
      if (plan.shouldRefresh) {
        void fetchEntries(plan.state.query, plan.state.level, plan.state.commonOnly);
      }
    },
    [committedSearch, fetchEntries, router, searchParams]
  );

  // The URL is the committed search state and drives every result request.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchEntries(
        committedSearch.query,
        committedSearch.level,
        committedSearch.commonOnly
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    committedSearch.commonOnly,
    committedSearch.level,
    committedSearch.query,
    fetchEntries,
  ]);

  const handleSearchSubmit = () => {
    applySearchState(
      {
        query,
        level: committedSearch.level,
        commonOnly: committedSearch.commonOnly,
      },
      true
    );
  };

  const handleRetry = () => {
    void fetchEntries(
      committedSearch.query,
      committedSearch.level,
      committedSearch.commonOnly
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Hero Search Section */}
      <div className="bg-gradient-to-b from-white via-white to-slate-50/50 border-b border-slate-200 pt-10 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold mb-4 border border-red-100">
            <BookOpen className="w-3.5 h-3.5" />
            NihongoBridge Core Dictionary
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Japanese Dictionary & Lexicon
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
            Search across Kanji, Kana, Romaji, and English glosses with authentic JLPT levels and contextual cross-references.
          </p>

          <DictionaryAutocomplete
            query={query}
            returnTo={committedSearchHref}
            onQueryChange={updateQuery}
            onSearch={handleSearchSubmit}
          />

          {/* Quick Filters */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
              {LEVEL_FILTERS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={committedSearch.level === level}
                  onClick={() =>
                    applySearchState({
                      query,
                      level,
                      commonOnly: committedSearch.commonOnly,
                    })
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    committedSearch.level === level
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <button
              type="button"
              aria-label="Common words only"
              aria-pressed={committedSearch.commonOnly}
              onClick={() =>
                applySearchState({
                  query,
                  level: committedSearch.level,
                  commonOnly: !committedSearch.commonOnly,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                committedSearch.commonOnly
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  committedSearch.commonOnly ? "text-emerald-600" : "text-slate-400"
                }`}
              />
              Common Words Only
            </button>
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {loading
              ? "Searching..."
              : searchFailure === "query_too_long"
                ? "Invalid search"
                : searchFailure
                  ? "Search unavailable"
                  : `${total} Entries Found`}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => {
                updateQuery("");
                applySearchState(
                  {
                    query: "",
                    level: committedSearch.level,
                    commonOnly: committedSearch.commonOnly,
                  },
                  true
                );
              }}
              className="text-xs text-red-600 hover:underline font-medium"
            >
              Clear Search
            </button>
          )}
        </div>

        {/* Loading Indicator */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
            <p className="text-sm font-medium">Looking up dictionary entries...</p>
          </div>
        ) : searchFailure === "query_too_long" ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center">
            <h3 className="text-lg font-bold text-slate-900">Search is too long</h3>
            <p className="mt-2 text-sm text-slate-600">
              Use 1,000 characters or fewer, then search again.
            </p>
          </div>
        ) : searchFailure ? (
          <DictionarySearchError onRetry={handleRetry} />
        ) : entries.length === 0 ? (
          <div role="status" className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" aria-hidden="true" />
            {committedSearch.query || committedSearch.level !== "ALL" || committedSearch.commonOnly ? (
              <>
                <h3 className="text-lg font-bold text-slate-800">No dictionary entries matched</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  Try another spelling or romaji, or clear your filters.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-800">No dictionary entries are available</h3>
                <p className="text-sm text-slate-500 mt-1">Try again later.</p>
                <button type="button" onClick={handleRetry} className="mt-4 text-sm font-semibold text-red-700 underline">
                  Retry
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <DictionaryEntryCard
                key={entry.id}
                entry={entry}
                returnTo={committedSearchHref}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
