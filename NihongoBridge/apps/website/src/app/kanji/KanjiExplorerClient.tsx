"use client";

import React, { useState } from "react";

export interface KanjiItem {
  id: number;
  kanji: string;
  meaning: string;
  onyomi?: string | null;
  kunyomi?: string | null;
  radicals?: string | null;
  strokeCount: number;
  frequencyRank?: number | null;
  gradeLevel?: number | null;
  jlptLevel?: string | null;
  themeCategory?: string | null;
  strokeOrderSvg?: string | null;
  componentBreakdown?: Array<{ component: string; meaning: string }> | null;
  kanjiFamilies?: Array<{ family: string; members: string[] }> | null;
  similarKanji?: Array<{ kanji: string; meaning: string; distinction: string }> | null;
  isFavorite?: boolean | null;
  masteryScore?: number | null;
  examples?: Array<{ word: string; reading: string; meaning: string }> | null;
}

export function KanjiExplorerClient({ initialKanji }: { initialKanji: KanjiItem[] }) {
  const [items, setItems] = useState<KanjiItem[]>(initialKanji);
  const [selectedKanji, setSelectedKanji] = useState<KanjiItem>(initialKanji[0] || null);
  const [viewMode, setViewMode] = useState<"mindmap" | "grid">("mindmap");
  const [activeTheme, setActiveTheme] = useState("all");
  const [activeLevel, setActiveLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [writingDone, setWritingDone] = useState(false);

  const toggleFavorite = async (id: number) => {
    setItems((prev) =>
      prev.map((k) => (k.id === id ? { ...k, isFavorite: !k.isFavorite } : k)),
    );
    if (selectedKanji?.id === id) {
      setSelectedKanji((prev) => ({ ...prev, isFavorite: !prev.isFavorite }));
    }
    try {
      await fetch("/api/v1/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_favorite", kanjiId: id }),
      });
    } catch {}
  };

  const handlePracticeStroke = async () => {
    setWritingDone(true);
    const newScore = Math.min(100, (selectedKanji.masteryScore || 0) + 15);
    setItems((prev) =>
      prev.map((k) => (k.id === selectedKanji.id ? { ...k, masteryScore: newScore } : k)),
    );
    setSelectedKanji((prev) => ({ ...prev, masteryScore: newScore }));

    try {
      await fetch("/api/v1/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_writing_score", kanjiId: selectedKanji.id, score: newScore }),
      });
    } catch {}
  };

  const filtered = items.filter((k) => {
    const matchTheme = activeTheme === "all" || k.themeCategory === activeTheme;
    const matchLvl = activeLevel === "all" || k.jlptLevel === activeLevel;
    const q = search.toLowerCase().trim();
    const matchQ =
      !q ||
      k.kanji.includes(q) ||
      k.meaning.toLowerCase().includes(q) ||
      (k.onyomi && k.onyomi.toLowerCase().includes(q)) ||
      (k.kunyomi && k.kunyomi.toLowerCase().includes(q));

    return matchTheme && matchLvl && matchQ;
  });

  // Mindmap Tree Branches & Colors
  const BRANCHES = [
    { key: "nature", label: "🌿 Nature & Elements", color: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 text-emerald-950 dark:text-emerald-300" },
    { key: "people", label: "👤 Humans & Body", color: "border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 text-indigo-950 dark:text-indigo-300" },
    { key: "numbers", label: "🔢 Numbers & math", color: "border-sky-200 dark:border-sky-800/60 bg-sky-50/40 text-sky-950 dark:text-sky-300" },
    { key: "actions", label: "🏃‍♂️ Actions & Verbs", color: "border-rose-200 dark:border-rose-800/60 bg-rose-50/40 text-rose-950 dark:text-rose-300" },
    { key: "directions", label: "🧭 Directions", color: "border-amber-200 dark:border-amber-800/60 bg-amber-50/40 text-amber-950 dark:text-amber-300" },
    { key: "time", label: "⏱ Time & Date", color: "border-purple-200 dark:border-purple-800/60 bg-purple-50/40 text-purple-950 dark:text-purple-300" },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* View Mode & Filter Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-sm border border-black/5 text-xs font-semibold">
        {/* Toggle Switch between Mindmap Tree & Grid */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-black/5">
          <button
            onClick={() => setViewMode("mindmap")}
            className={`rounded-xl px-4 py-2 transition cursor-pointer font-bold flex items-center gap-1.5 ${
              viewMode === "mindmap" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🔀 KANJI60 Mindmap Tree</span>
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`rounded-xl px-4 py-2 transition cursor-pointer font-bold flex items-center gap-1.5 ${
              viewMode === "grid" ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🔲 Standard Search Grid</span>
          </button>
        </div>

        {/* Filters and search queries */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "grid" && (
            <select
              value={activeTheme}
              onChange={(e) => setActiveTheme(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
            >
              <option value="all">All Theme Categories</option>
              <option value="nature">Nature</option>
              <option value="people">People</option>
              <option value="numbers">Numbers</option>
              <option value="actions">Actions</option>
              <option value="directions">Directions</option>
              <option value="time">Time</option>
            </select>
          )}

          <select
            value={activeLevel}
            onChange={(e) => setActiveLevel(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
          >
            <option value="all">All JLPT Levels</option>
            <option value="N5">JLPT N5</option>
            <option value="N4">JLPT N4</option>
            <option value="N3">JLPT N3</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search kanji, readings, meaning..."
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-rose-500 w-44"
          />
        </div>
      </div>

      {/* Main Study Panel */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Left Side: Deep-Dive Inspector and Stroke order verify */}
        {selectedKanji && (
          <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-6 lg:col-span-1">
            <div className="flex items-center justify-between text-xs">
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                {selectedKanji.jlptLevel || "N5"} • Grade {selectedKanji.gradeLevel || 1}
              </span>
              <button
                onClick={() => toggleFavorite(selectedKanji.id)}
                className="text-xs font-bold text-amber-600 cursor-pointer hover:underline"
              >
                {selectedKanji.isFavorite ? "⭐ Saved Favorited" : "☆ Add Favorite"}
              </button>
            </div>

            {/* Giants Stroke ordering display */}
            <div className="rounded-2xl bg-gradient-to-b from-rose-50 to-white p-6 text-center border border-rose-100 space-y-2">
              <p className="text-7xl font-black text-slate-950 tracking-wider">
                {selectedKanji.kanji}
              </p>
              <p className="text-sm font-bold text-rose-800 leading-tight">{selectedKanji.meaning}</p>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                {selectedKanji.strokeCount} Strokes • Radical: {selectedKanji.radicals || "日"}
              </p>
            </div>

            {/* Readings List */}
            <div className="rounded-2xl bg-slate-50 p-4 text-xs space-y-2 border border-black/5">
              <div className="flex justify-between border-b border-black/5 pb-1">
                <span className="font-bold text-slate-700">音読み (Onyomi):</span>
                <span className="font-mono text-slate-900 font-bold">{selectedKanji.onyomi || "—"}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="font-bold text-slate-700">訓読み (Kunyomi):</span>
                <span className="font-mono text-slate-900 font-bold">{selectedKanji.kunyomi || "—"}</span>
              </div>
            </div>

            {/* Interactive Grid Trace Practice */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-900">✍️ Stroke Tracing Practice</span>
                <span className="text-emerald-700 font-bold">{selectedKanji.masteryScore || 0}% Accuracy</span>
              </div>

              <div className="relative h-28 w-full rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/40 flex items-center justify-center">
                <span className="text-5xl font-thin text-rose-200 select-none">{selectedKanji.kanji}</span>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-full w-px border-r border-dashed border-rose-200" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-px border-b border-dashed border-rose-200" />
                </div>
              </div>

              <button
                onClick={handlePracticeStroke}
                className="w-full rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white py-2.5 transition cursor-pointer shadow-xs"
              >
                Trace Stroke &amp; Verify Order (+15%)
              </button>
            </div>

            {/* Sentence Examples (Takoboto Inspiration) */}
            {selectedKanji.examples && (selectedKanji.examples as any[]).length > 0 && (
              <div className="text-xs pt-3 border-t border-black/5 space-y-2">
                <p className="font-bold text-slate-950">📚 Sentence Examples</p>
                {(selectedKanji.examples as any[]).map((ex, i) => (
                  <div key={i} className="bg-slate-50 p-2.5 rounded-xl border border-black/5 space-y-0.5">
                    <p className="font-bold text-slate-900">{ex.word}</p>
                    <p className="text-[10px] text-slate-500 font-bold">Reading: {ex.reading}</p>
                    <p className="text-[11px] text-slate-600">Meaning: {ex.meaning}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right Side: Mindmap Tree OR Standard Search Grid */}
        <div className="lg:col-span-2 space-y-4">
          {/* A. MINDMAP TREE VIEW (KANJI60 MINDMAP) */}
          {viewMode === "mindmap" && (
            <div className="space-y-6">
              {/* Central Header */}
              <div className="rounded-3xl bg-slate-900 p-6 text-white text-center relative overflow-hidden shadow-md">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-950/20 to-slate-950/40 pointer-events-none" />
                <div className="relative z-1 space-y-1">
                  <span className="rounded-full bg-rose-600/30 border border-rose-400 px-3 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-300">
                    Takoboto &amp; Kanji Study Inspired
                  </span>
                  <h3 className="text-xl font-black">KANJI60 Semantic Mindmap Tree</h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto">
                    Explore 60 core Japanese N5-N4 characters grouped dynamically into visual semantic root branches.
                  </p>
                </div>
              </div>

              {/* Dynamic Mindmap Tree Branch Nodes */}
              <div className="space-y-6 pt-2">
                {BRANCHES.map((b) => {
                  // Filter N5-N4 characters belonging to this category
                  const branchMembers = items.filter(
                    (k) =>
                      k.themeCategory === b.key &&
                      (activeLevel === "all" || k.jlptLevel === activeLevel)
                  );

                  if (branchMembers.length === 0) return null;

                  return (
                    <div key={b.key} className={`rounded-3xl p-5 border-2 ${b.color} shadow-sm space-y-3 transition-all`}>
                      {/* Branch Core Title */}
                      <div className="flex items-center gap-2 border-b border-black/5 pb-2">
                        <span className="text-base font-extrabold">{b.label}</span>
                        <span className="rounded-md bg-white/50 border border-black/15 px-2 py-0.2 text-[9px] font-bold text-slate-600">
                          {branchMembers.length} Kanji Nodes
                        </span>
                      </div>

                      {/* Clickable Leaf Nodes in Mindmap Grid */}
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {branchMembers.map((k) => {
                          const isSel = selectedKanji?.id === k.id;
                          return (
                            <button
                              key={k.id}
                              onClick={() => {
                                setSelectedKanji(k);
                                setWritingDone(false);
                              }}
                              className={`h-12 w-12 rounded-xl text-lg font-black transition cursor-pointer flex flex-col items-center justify-center shadow-3xs border relative ${
                                isSel
                                  ? "bg-slate-900 border-slate-950 text-white ring-2 ring-slate-950 scale-95"
                                  : "bg-white border-black/10 text-slate-900 hover:border-slate-800"
                              }`}
                              title={k.meaning}
                            >
                              <span>{k.kanji}</span>
                              <span className="text-[8px] tracking-tight opacity-75 font-sans font-medium line-clamp-1 truncate max-w-full">
                                {k.meaning.split(" ")[0].slice(0, 4)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* B. STANDARD LIST GRID VIEW */}
          {viewMode === "grid" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Search Grid Results ({filtered.length} Kanji)</span>
                <span>Click cards to trace and view readings</span>
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {filtered.map((k) => {
                  const isSelected = selectedKanji?.id === k.id;
                  return (
                    <div
                      key={k.id}
                      onClick={() => {
                        setSelectedKanji(k);
                        setWritingDone(false);
                      }}
                      className={`rounded-2xl p-5 text-center transition cursor-pointer border shadow-2xs ${
                        isSelected
                          ? "bg-rose-50 border-rose-500 ring-2 ring-rose-500 scale-95"
                          : "bg-white border-black/5 hover:border-rose-300 hover:shadow-sm"
                      }`}
                    >
                      <p className="text-4xl font-black text-slate-950">{k.kanji}</p>
                      <p className="text-xs font-bold text-rose-800 mt-1">{k.meaning}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {k.strokeCount} strokes • {k.jlptLevel || "N5"}
                      </p>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-center text-xs text-slate-400 col-span-full py-8">No kanji characters matched your filters.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
