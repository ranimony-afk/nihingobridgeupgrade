"use client";

import React, { useState } from "react";
import Link from "next/link";

export interface VocabItem {
  id: number;
  japanese: string;
  furigana?: string | null;
  romaji?: string | null;
  meaning: string;
  jlptLevel?: string | null;
  partOfSpeech?: string | null;
  pitchAccent?: string | null;
  synonyms?: string[] | null;
  antonyms?: string[] | null;
  frequency?: number | null;
  isFavorite?: boolean | null;
  isBookmarked?: boolean | null;
  reviewStatus?: string | null;
  exampleSentenceJa?: string | null;
  exampleSentenceEn?: string | null;
}

export function VocabularyClient({ initialItems }: { initialItems: VocabItem[] }) {
  const [items, setItems] = useState<VocabItem[]>(initialItems);
  const [activeLevel, setActiveLevel] = useState("all");
  const [activePos, setActivePos] = useState("all");
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [quizNotice, setQuizNotice] = useState<string | null>(null);

  const toggleFav = async (id: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isFavorite: !it.isFavorite } : it)),
    );
    try {
      await fetch("/api/v1/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_favorite", itemId: id }),
      });
    } catch {}
  };

  const toggleBook = async (id: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isBookmarked: !it.isBookmarked } : it)),
    );
    try {
      await fetch("/api/v1/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_bookmark", itemId: id }),
      });
    } catch {}
  };

  const handleGenerateQuiz = async () => {
    try {
      const res = await fetch("/api/v1/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_quiz" }),
      });
      const data = await res.json();
      if (data.ok) {
        setQuizNotice(`🎉 Generated custom quiz with ${data.data.count} questions from your active vocabulary list!`);
        setTimeout(() => setQuizNotice(null), 4000);
      }
    } catch {}
  };

  const filtered = items.filter((it) => {
    const matchLvl = activeLevel === "all" || it.jlptLevel === activeLevel;
    const matchPos = activePos === "all" || it.partOfSpeech === activePos;
    const matchFav = !favoritesOnly || it.isFavorite;
    const q = search.toLowerCase().trim();
    const matchQ =
      !q ||
      it.japanese.toLowerCase().includes(q) ||
      it.meaning.toLowerCase().includes(q) ||
      (it.romaji && it.romaji.toLowerCase().includes(q)) ||
      (it.furigana && it.furigana.toLowerCase().includes(q));

    return matchLvl && matchPos && matchFav && matchQ;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Filter and Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-6 shadow-sm border border-black/5 text-xs font-semibold">
        <div className="flex flex-wrap items-center gap-2">
          {/* Level Filter */}
          <select
            value={activeLevel}
            onChange={(e) => setActiveLevel(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="all">All JLPT Levels</option>
            <option value="N5">JLPT N5</option>
            <option value="N4">JLPT N4</option>
            <option value="N3">JLPT N3</option>
            <option value="N2">JLPT N2</option>
            <option value="N1">JLPT N1</option>
          </select>

          {/* Part of Speech Filter */}
          <select
            value={activePos}
            onChange={(e) => setActivePos(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="all">All Parts of Speech</option>
            <option value="Noun">Noun (名詞)</option>
            <option value="Verb">Verb (動詞)</option>
            <option value="Adjective">Adjective (形容詞)</option>
            <option value="Expression">Expression (表現)</option>
          </select>

          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`rounded-xl px-3 py-2 transition cursor-pointer ${
              favoritesOnly ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {favoritesOnly ? "★ Favorites Only" : "☆ Show Favorites"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search word, kana, meaning..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-rose-500 w-56"
          />

          <button
            onClick={handleGenerateQuiz}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
          >
            ⚡ Generate Quiz
          </button>
        </div>
      </div>

      {quizNotice && (
        <div className="rounded-2xl bg-emerald-100 p-4 text-xs font-bold text-emerald-950 border border-emerald-300 animate-fade-in flex items-center justify-between">
          <span>{quizNotice}</span>
          <Link href="/jlpt/mock-exam" className="underline hover:text-emerald-800">
            Launch Practice Quiz →
          </Link>
        </div>
      )}

      {/* Vocabulary Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-3xl bg-white p-6 shadow-sm border border-black/5 space-y-3 transition hover:-translate-y-1 hover:shadow-md flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-800 uppercase text-[10px]">
                  {item.jlptLevel || "N5"} • {item.partOfSpeech || "Noun"}
                </span>

                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => toggleFav(item.id)}
                    className="cursor-pointer hover:scale-125 transition"
                    title="Favorite"
                  >
                    {item.isFavorite ? "⭐" : "☆"}
                  </button>
                  <button
                    onClick={() => toggleBook(item.id)}
                    className="cursor-pointer hover:scale-125 transition"
                    title="Bookmark"
                  >
                    {item.isBookmarked ? "🔖" : "🏷️"}
                  </button>
                </div>
              </div>

              <div className="py-1">
                <h3 className="text-3xl font-black text-slate-950">{item.japanese}</h3>
                {item.furigana && <p className="text-xs text-rose-600 font-semibold mt-0.5">{item.furigana}</p>}
                {item.romaji && <p className="text-[11px] text-slate-400 italic">{item.romaji}</p>}
              </div>

              <p className="text-sm font-bold text-slate-900">{item.meaning}</p>
              {item.pitchAccent && (
                <p className="text-[11px] text-indigo-700 font-mono bg-indigo-50 px-2 py-0.5 rounded-md w-fit">
                  🔊 Pitch: {item.pitchAccent}
                </p>
              )}

              {item.exampleSentenceJa && (
                <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-0.5 border border-black/5">
                  <p className="font-semibold text-slate-900">{item.exampleSentenceJa}</p>
                  <p className="text-slate-500 text-[11px]">{item.exampleSentenceEn}</p>
                </div>
              )}
            </div>

            <div className="border-t border-black/5 pt-3 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-mono">Freq #{item.frequency || 100}</span>
              <span className="text-rose-700 font-bold uppercase tracking-wider text-[10px]">
                Status: {item.reviewStatus || "learning"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
