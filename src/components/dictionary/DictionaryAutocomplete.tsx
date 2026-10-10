"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import {
  DictionaryAutocompleteRequestManager,
  getDictionaryAutocompleteOptionId,
  planDictionaryAutocompleteKey,
  type DictionaryAutocompleteSuggestion,
} from "@/lib/dictionary/autocomplete";
import {
  buildDictionaryEntryHref,
  isDictionaryJlptLevel,
} from "@/lib/dictionary/searchState";

const AUTOCOMPLETE_DEBOUNCE_MS = 150;

type AutocompleteStatus = "idle" | "loading" | "success" | "error";

interface AutocompleteResultState {
  query: string;
  status: AutocompleteStatus;
  suggestions: DictionaryAutocompleteSuggestion[];
}

export interface DictionaryAutocompleteProps {
  query: string;
  returnTo?: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
}

export interface DictionaryAutocompleteViewProps extends DictionaryAutocompleteProps {
  listboxId: string;
  popupOpen: boolean;
  status: AutocompleteStatus;
  suggestions: DictionaryAutocompleteSuggestion[];
  activeIndex: number;
  onInputFocus: () => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionActive: (index: number) => void;
  onSuggestionSelect: (suggestion: DictionaryAutocompleteSuggestion) => void;
}

interface DictionaryAutocompleteOptionProps {
  suggestion: DictionaryAutocompleteSuggestion;
  index: number;
  listboxId: string;
  returnTo?: string;
  active: boolean;
  onActive: (index: number) => void;
  onSelect: (suggestion: DictionaryAutocompleteSuggestion) => void;
}

export function DictionaryAutocompleteOption({
  suggestion,
  index,
  listboxId,
  returnTo,
  active,
  onActive,
  onSelect,
}: DictionaryAutocompleteOptionProps) {
  return (
    <Link
      id={getDictionaryAutocompleteOptionId(listboxId, index)}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      href={buildDictionaryEntryHref(suggestion.id, returnTo)}
      onPointerDown={() => onActive(index)}
      onPointerMove={() => onActive(index)}
      onClick={() => onSelect(suggestion)}
      className={`group flex items-center justify-between p-3.5 transition-colors hover:bg-slate-50 ${
        active ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="font-japanese text-lg font-bold text-slate-900 transition-colors group-hover:text-red-600">
          {suggestion.headword}
        </span>
        <span className="font-mono text-xs text-slate-500">{suggestion.reading}</span>
        {suggestion.gloss && (
          <span className="max-w-[200px] truncate text-xs text-slate-600 sm:max-w-[280px]">
            — {suggestion.gloss}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isDictionaryJlptLevel(suggestion.jlptLevel) && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            {suggestion.jlptLevel}
          </span>
        )}
        <ArrowRight
          className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-red-600"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

interface DictionaryAutocompletePopupProps {
  listboxId: string;
  returnTo?: string;
  status: AutocompleteStatus;
  suggestions: DictionaryAutocompleteSuggestion[];
  activeIndex: number;
  onSuggestionActive: (index: number) => void;
  onSuggestionSelect: (suggestion: DictionaryAutocompleteSuggestion) => void;
}

export function DictionaryAutocompletePopup({
  listboxId,
  returnTo,
  status,
  suggestions,
  activeIndex,
  onSuggestionActive,
  onSuggestionSelect,
}: DictionaryAutocompletePopupProps) {
  const loading = status === "loading";
  const noSuggestions = status === "success" && suggestions.length === 0;
  const failed = status === "error";

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xl animate-in fade-in duration-100">
      <div
        id={listboxId}
        role="listbox"
        aria-label="Dictionary suggestions"
        aria-busy={loading}
        className="divide-y divide-slate-100"
      >
        {suggestions.map((suggestion, index) => (
          <DictionaryAutocompleteOption
            key={`${suggestion.id}-${index}`}
            suggestion={suggestion}
            index={index}
            listboxId={listboxId}
            returnTo={returnTo}
            active={activeIndex === index}
            onActive={onSuggestionActive}
            onSelect={onSuggestionSelect}
          />
        ))}
      </div>

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 p-3.5 text-xs font-medium text-slate-500"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading suggestions…
        </p>
      )}
      {noSuggestions && (
        <p role="status" aria-live="polite" className="p-3.5 text-xs text-slate-500">
          No dictionary suggestions found.
        </p>
      )}
      {failed && (
        <p role="status" aria-live="polite" className="p-3.5 text-xs text-slate-600">
          Suggestions are temporarily unavailable. Edit your search to try again.
        </p>
      )}
    </div>
  );
}

export function DictionaryAutocompleteView({
  query,
  returnTo,
  onQueryChange,
  onSearch,
  listboxId,
  popupOpen,
  status,
  suggestions,
  activeIndex,
  onInputFocus,
  onInputKeyDown,
  onSuggestionActive,
  onSuggestionSelect,
}: DictionaryAutocompleteViewProps) {
  const activeOptionId =
    popupOpen && activeIndex >= 0 && activeIndex < suggestions.length
      ? getDictionaryAutocompleteOptionId(listboxId, activeIndex)
      : undefined;

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch();
  };

  return (
    <div className="relative mx-auto mt-8 max-w-2xl">
      <form onSubmit={submitSearch} className="relative">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            role="combobox"
            aria-label="Search dictionary"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={popupOpen}
            aria-controls={popupOpen ? listboxId : undefined}
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={onInputFocus}
            onKeyDown={onInputKeyDown}
            placeholder="Search Japanese, かな, romaji, or English (e.g. 水, mizu, water)..."
            className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-28 text-base text-slate-900 shadow-sm transition-all placeholder-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            autoComplete="off"
          />
          <button
            type="submit"
            className="absolute right-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            Search
          </button>
        </div>
      </form>

      {popupOpen && (
        <DictionaryAutocompletePopup
          listboxId={listboxId}
          returnTo={returnTo}
          status={status}
          suggestions={suggestions}
          activeIndex={activeIndex}
          onSuggestionActive={onSuggestionActive}
          onSuggestionSelect={onSuggestionSelect}
        />
      )}
    </div>
  );
}

export function DictionaryAutocomplete({
  query,
  returnTo,
  onQueryChange,
  onSearch,
}: DictionaryAutocompleteProps) {
  const router = useRouter();
  const generatedId = useId();
  const listboxId = `dictionary-autocomplete-${generatedId}`;
  const requestManagerRef = useRef<DictionaryAutocompleteRequestManager | null>(null);
  const [openQuery, setOpenQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [result, setResult] = useState<AutocompleteResultState>({
    query,
    status: "idle",
    suggestions: [],
  });

  const popupOpen = Boolean(query.trim()) && openQuery === query;
  const visibleResult: AutocompleteResultState =
    result.query === query
      ? result
      : { query, status: popupOpen ? "loading" : "idle", suggestions: [] };

  const getRequestManager = useCallback(() => {
    return (
      requestManagerRef.current ??
      (requestManagerRef.current = new DictionaryAutocompleteRequestManager())
    );
  }, []);

  const dismissSuggestions = useCallback(() => {
    requestManagerRef.current?.cancel();
    setOpenQuery(null);
    setActiveIndex(-1);
    setResult({ query, status: "idle", suggestions: [] });
  }, [query]);

  useEffect(() => {
    if (!popupOpen) return;

    const requestedQuery = query;
    const timer = window.setTimeout(async () => {
      setResult({ query: requestedQuery, status: "loading", suggestions: [] });
      const completion = await getRequestManager().search(requestedQuery);

      if (!completion.isCurrent) return;

      setActiveIndex(-1);
      if (completion.outcome.ok) {
        setResult({
          query: requestedQuery,
          status: "success",
          suggestions: completion.outcome.suggestions,
        });
      } else if (completion.outcome.reason !== "aborted") {
        setResult({ query: requestedQuery, status: "error", suggestions: [] });
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      requestManagerRef.current?.cancel();
    };
  }, [getRequestManager, popupOpen, query]);

  useEffect(() => {
    return () => requestManagerRef.current?.cancel();
  }, []);

  const handleQueryChange = (nextQuery: string) => {
    requestManagerRef.current?.cancel();
    setActiveIndex(-1);
    setResult({
      query: nextQuery,
      status: nextQuery.trim() ? "loading" : "idle",
      suggestions: [],
    });
    setOpenQuery(nextQuery.trim() ? nextQuery : null);
    onQueryChange(nextQuery);
  };

  const handleInputFocus = () => {
    if (!query.trim() || popupOpen) return;

    requestManagerRef.current?.cancel();
    setActiveIndex(-1);
    setResult({ query, status: "loading", suggestions: [] });
    setOpenQuery(query);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const plan = planDictionaryAutocompleteKey(event.key, {
      isOpen: popupOpen,
      activeIndex,
      suggestionCount: visibleResult.suggestions.length,
    });

    if (!plan.handled) return;
    event.preventDefault();

    if (plan.shouldDismiss) {
      dismissSuggestions();
      return;
    }

    if (plan.selectedIndex !== undefined) {
      const suggestion = visibleResult.suggestions[plan.selectedIndex];
      if (suggestion) {
        dismissSuggestions();
        router.push(buildDictionaryEntryHref(suggestion.id, returnTo));
      }
      return;
    }

    if (plan.nextActiveIndex !== undefined) {
      setActiveIndex(plan.nextActiveIndex);
    }
  };

  const handleSearch = () => {
    dismissSuggestions();
    onSearch();
  };

  return (
    <DictionaryAutocompleteView
      query={query}
      returnTo={returnTo}
      onQueryChange={handleQueryChange}
      onSearch={handleSearch}
      listboxId={listboxId}
      popupOpen={popupOpen}
      status={visibleResult.status}
      suggestions={visibleResult.suggestions}
      activeIndex={activeIndex}
      onInputFocus={handleInputFocus}
      onInputKeyDown={handleInputKeyDown}
      onSuggestionActive={setActiveIndex}
      onSuggestionSelect={dismissSuggestions}
    />
  );
}
