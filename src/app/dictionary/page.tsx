"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useTransition } from "react";
import {
  Search,
  BookOpen,
  Filter,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  Tag,
  Bookmark,
} from "lucide-react";

interface DictionaryEntrySummary {
  id: string;
  headword: string;
  reading: string;
  romaji: string | null;
  jlptLevel: string;
  isCommon: boolean;
  partsOfSpeech: string[];
  senses: { glosses: string[]; note?: string }[];
  tags: string[];
  kanjiCharacters: string[];
}

export default function DictionarySearchPage() {
  const [query, setQuery] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [commonOnly, setCommonOnly] = useState(false);
  const [entries, setEntries] = useState<DictionaryEntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      headword: string;
      reading: string;
      romaji: string | null;
      jlptLevel: string | null;
      gloss: string;
    }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();

  // Search execution
  const fetchEntries = async (
    q: string,
    lvl: string,
    common: boolean
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (lvl !== "ALL") params.set("level", lvl);
      if (common) params.set("common", "true");
      params.set("limit", "40");

      const res = await fetch(`/api/dictionary?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setEntries(json.data.entries || []);
        setTotal(json.data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch dictionary entries:", err);
    } finally {
      setLoading(false);
    }
  };

  // Autocomplete fetcher
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dictionary?q=${encodeURIComponent(query)}&autocomplete=true&limit=6`
        );
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSuggestions(json.data);
        }
      } catch (err) {
        console.error("Autocomplete error:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Initial & Filter change search
  useEffect(() => {
    startTransition(() => {
      fetchEntries(query, selectedLevel, commonOnly);
    });
  }, [selectedLevel, commonOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    fetchEntries(query, selectedLevel, commonOnly);
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

          {/* Search Box Form */}
          <div className="mt-8 relative max-w-2xl mx-auto">
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="relative flex items-center">
                <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search Japanese, かな, romaji, or English (e.g. 水, mizu, water)..."
                  className="w-full pl-12 pr-28 py-3.5 bg-white rounded-2xl border border-slate-300 shadow-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-base"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="absolute right-2 px-5 py-2 bg-slate-900 text-white font-semibold rounded-xl text-sm hover:bg-slate-800 transition-colors shadow-sm"
                >
                  Search
                </button>
              </div>
            </form>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden text-left divide-y divide-slate-100 animate-in fade-in duration-100">
                {suggestions.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dictionary/${encodeURIComponent(item.id)}`}
                    onClick={() => setShowSuggestions(false)}
                    className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-japanese text-lg font-bold text-slate-900 group-hover:text-red-600 transition-colors">
                        {item.headword}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {item.reading}
                      </span>
                      {item.gloss && (
                        <span className="text-xs text-slate-600 truncate max-w-[200px] sm:max-w-[280px]">
                          — {item.gloss}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.jlptLevel && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.jlptLevel}
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick Filters */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
              {["ALL", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedLevel === lvl
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCommonOnly(!commonOnly)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                commonOnly
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${commonOnly ? "text-emerald-600" : "text-slate-400"}`} />
              Common Words Only
            </button>
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {loading ? "Searching..." : `${total} Entries Found`}
          </p>
          {query && (
            <button
              onClick={() => {
                setQuery("");
                fetchEntries("", selectedLevel, commonOnly);
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
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No dictionary entries matched</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Try searching with another spelling, romaji (e.g. &quot;mizu&quot;), or clear your JLPT level filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {entries.map((item) => {
              const primarySenses = item.senses || [];
              const glosses = primarySenses.flatMap((s) => s.glosses);

              return (
                <Link
                  key={item.id}
                  href={`/dictionary/${encodeURIComponent(item.id)}`}
                  className="group bg-white rounded-2xl border border-slate-200/90 p-5 hover:border-red-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-japanese text-2xl font-black text-slate-900 group-hover:text-red-600 transition-colors">
                            {item.headword}
                          </span>
                          <span className="font-japanese text-sm font-medium text-slate-500">
                            {item.reading}
                          </span>
                          {item.romaji && (
                            <span className="text-xs text-slate-400 font-mono">
                              ({item.romaji})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.isCommon && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Common
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {item.jlptLevel}
                        </span>
                      </div>
                    </div>

                    {/* Parts of Speech */}
                    {item.partsOfSpeech?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.partsOfSpeech.map((pos) => (
                          <span
                            key={pos}
                            className="text-[11px] font-semibold text-slate-400 italic"
                          >
                            [{pos}]
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Senses / Meanings */}
                    <div className="mt-3 text-sm text-slate-700 leading-relaxed font-medium">
                      <ol className="list-decimal list-inside space-y-1">
                        {primarySenses.slice(0, 2).map((s, idx) => (
                          <li key={idx} className="truncate">
                            <span>{s.glosses.join("; ")}</span>
                            {s.note && (
                              <span className="text-xs text-slate-400 italic ml-1">
                                — {s.note}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>

                  {/* Footer Row: Tags & Kanji */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      {item.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200/60 text-[10px] font-medium text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <span className="flex items-center gap-1 font-semibold text-red-600 group-hover:translate-x-0.5 transition-transform">
                      Details
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
