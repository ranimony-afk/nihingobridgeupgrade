"use client";

import React, { useState } from "react";

export interface DownloadItem {
  id: number;
  title: string;
  description?: string | null;
  fileType: string;
  category: string;
  fileUrl: string;
  fileSize?: string | null;
  format?: string | null;
  requiresRegistration: boolean;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  bookmarkCount: number;
  jlptLevel?: string | null;
}

export function DownloadCenterClient({ initialItems }: { initialItems: DownloadItem[] }) {
  const [items, setItems] = useState<DownloadItem[]>(initialItems);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeLevel, setActiveLevel] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"popularity" | "rating">("popularity");
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const [ratedIds, setRatedIds] = useState<Record<number, number>>({});

  // Download modal state
  const [selectedResource, setSelectedResource] = useState<DownloadItem | null>(null);
  const [emailInput, setEmailInput] = useState("learner@nihongobridge.com");
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadHistoryLog, setDownloadHistoryLog] = useState<Array<{ title: string; time: string }>>([]);

  const filtered = items
    .filter((it) => {
      const matchCat = activeCategory === "all" || it.category === activeCategory || it.fileType === activeCategory;
      const matchLvl = activeLevel === "all" || it.jlptLevel === activeLevel;
      return matchCat && matchLvl;
    })
    .sort((a, b) => (sortBy === "popularity" ? b.downloadCount - a.downloadCount : b.rating - a.rating));

  const toggleBookmark = (id: number) => {
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              bookmarkCount: bookmarkedIds.includes(id) ? it.bookmarkCount - 1 : it.bookmarkCount + 1,
            }
          : it,
      ),
    );
  };

  const handleRate = (id: number, stars: number) => {
    setRatedIds((prev) => ({ ...prev, [id]: stars }));
  };

  const handleDownloadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !emailInput.trim()) return;

    try {
      const res = await fetch("/api/v1/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: selectedResource.id, email: emailInput }),
      });
      const data = await res.json();

      if (data.ok) {
        setDownloadSuccess(selectedResource.title);
        // Increment count locally
        setItems((prev) =>
          prev.map((it) =>
            it.id === selectedResource.id ? { ...it, downloadCount: it.downloadCount + 1 } : it,
          ),
        );
        setDownloadHistoryLog((prev) => [
          { title: selectedResource.title, time: new Date().toLocaleTimeString() },
          ...prev,
        ]);
        setTimeout(() => {
          setSelectedResource(null);
          setDownloadSuccess(null);
        }, 1800);
      }
    } catch {
      // Direct fallback
      window.open(selectedResource.fileUrl, "_blank");
      setSelectedResource(null);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Category Pills & JLPT Level Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {[
            { key: "all", label: "All Formats" },
            { key: "grammar_guide", label: "Grammar & Workbooks" },
            { key: "vocab_list", label: "Vocabulary Lists" },
            { key: "kanji_sheet", label: "Kanji Sheets" },
            { key: "cheat_sheet", label: "Cheat Sheets" },
            { key: "mock_test", label: "Mock Tests" },
            { key: "audio_pack", label: "Audio & Listening" },
            { key: "planner", label: "Planners & Checklists" },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`rounded-xl px-3 py-1.5 transition cursor-pointer ${
                activeCategory === cat.key
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-black/5"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* JLPT & Sort Controls */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <select
            value={activeLevel}
            onChange={(e) => setActiveLevel(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="all">All JLPT Levels</option>
            <option value="N5">JLPT N5</option>
            <option value="N4">JLPT N4</option>
            <option value="N3">JLPT N3</option>
            <option value="N2">JLPT N2</option>
            <option value="N1">JLPT N1</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "popularity" | "rating")}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="popularity">🔥 Most Popular</option>
            <option value="rating">⭐ Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Resource Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((res) => {
          const isBookmarked = bookmarkedIds.includes(res.id);
          const userRating = ratedIds[res.id] ?? Math.round(res.rating / 10);
          return (
            <div
              key={res.id}
              className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-sm border border-black/5 transition hover:-translate-y-1 hover:shadow-md space-y-4"
            >
              <div className="space-y-3">
                {/* Header: Type, JLPT Level & Bookmark */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                      {res.format || res.fileType}
                    </span>
                    {res.jlptLevel && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700 uppercase text-[10px]">
                        {res.jlptLevel}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => toggleBookmark(res.id)}
                    className="text-xs font-bold transition hover:scale-110 cursor-pointer"
                    title="Bookmark this resource"
                  >
                    {isBookmarked ? "★ Saved" : "☆ Bookmark"}
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-950 leading-snug">{res.title}</h3>
                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{res.description}</p>
              </div>

              {/* Footer: Stats, Star Ratings & Gated Download Button */}
              <div className="space-y-3 border-t border-black/5 pt-3 text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>⬇ {res.downloadCount.toLocaleString()} downloads</span>
                  <span>{res.fileSize}</span>
                </div>

                {/* 5-Star Rating Bar */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-0.5 text-amber-500 font-bold">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRate(res.id, star)}
                        className={`cursor-pointer ${star <= userRating ? "text-amber-500" : "text-slate-300"}`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="ml-1 text-slate-700">{(res.rating / 10).toFixed(1)}/5</span>
                  </div>
                  <span className="text-slate-400">({res.ratingCount} reviews)</span>
                </div>

                <button
                  onClick={() => setSelectedResource(res)}
                  className="w-full rounded-xl bg-slate-900 py-2.5 text-center text-xs font-bold text-white hover:bg-slate-800 transition shadow-xs cursor-pointer"
                >
                  Download Resource 📥
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Download History Widget */}
      {downloadHistoryLog.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-black/5 space-y-3 text-xs">
          <h4 className="font-bold text-slate-900">Your Download History 📜</h4>
          <ul className="divide-y divide-black/5">
            {downloadHistoryLog.map((log, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-slate-700">
                <span>✓ {log.title}</span>
                <span className="text-slate-400 font-mono text-[10px]">{log.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Registration & Download Verification Modal */}
      {selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl space-y-5 border border-black/10">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-700">Learner Registration Gating</span>
                <h3 className="text-base font-bold text-slate-950">Confirm Free Download</h3>
              </div>
              <button
                onClick={() => setSelectedResource(null)}
                className="text-slate-400 hover:text-slate-900 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 space-y-1 text-xs">
              <p className="font-bold text-slate-900">{selectedResource.title}</p>
              <p className="text-slate-500">{selectedResource.fileSize} • {selectedResource.format || selectedResource.fileType}</p>
            </div>

            <form onSubmit={handleDownloadSubmit} className="space-y-4 text-xs">
              <label className="grid gap-1">
                <span className="font-bold text-slate-700">Registered Learner Email</span>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Enter your email to unlock downloads..."
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-rose-600 py-3 text-xs font-bold text-white hover:bg-rose-700 transition shadow-sm cursor-pointer"
              >
                Unlock &amp; Download Free PDF / Audio →
              </button>
            </form>

            {downloadSuccess && (
              <div className="rounded-xl bg-emerald-100 p-3 text-center text-xs font-bold text-emerald-950 animate-fade-in">
                🎉 Verified! Your download for "{downloadSuccess}" has started.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
