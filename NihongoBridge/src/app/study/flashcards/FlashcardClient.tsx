"use client";

import React, { useState } from "react";
import Link from "next/link";

export interface CardItem {
  id: number;
  front: string;
  back: string;
  furigana?: string | null;
  romaji?: string | null;
  notes?: string | null;
}

export function FlashcardClient({ cards }: { cards: CardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-sm opacity-70">No cards in this deck yet.</p>
        <Link href="/decks" className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
          Browse Decks
        </Link>
      </div>
    );
  }

  const current = cards[index];
  const progressPercent = Math.round(((index + 1) / cards.length) * 100);

  const handleNext = (quality: number) => {
    // Quality 0 (Again), 3 (Hard), 4 (Good), 5 (Easy)
    setCompletedCount((c) => c + 1);
    setFlipped(false);
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setIndex(0); // loop
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-semibold opacity-70">
          <span>Card {index + 1} of {cards.length}</span>
          <span>{progressPercent}% completed</span>
        </div>
        <div className="h-2 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-rose-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Interactive 3D Flip Card */}
      <div
        onClick={() => setFlipped(!flipped)}
        className="cursor-pointer select-none rounded-3xl bg-white p-12 min-h-[300px] flex flex-col items-center justify-center text-center shadow-md border border-black/5 transition hover:shadow-lg"
      >
        {!flipped ? (
          <div className="space-y-4">
            <span className="text-xs uppercase tracking-widest text-rose-600 font-bold">Front • Tap to flip 🔄</span>
            <p className="text-5xl font-bold text-slate-950">{current.front}</p>
            {current.furigana && <p className="text-sm font-medium text-rose-600">{current.furigana}</p>}
            {current.romaji && <p className="text-xs opacity-60 italic">{current.romaji}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <span className="text-xs uppercase tracking-widest text-emerald-600 font-bold">Back • Meaning 💡</span>
            <p className="text-3xl font-bold text-slate-900">{current.back}</p>
            {current.notes && <p className="text-xs opacity-70 italic max-w-xs">{current.notes}</p>}
          </div>
        )}
      </div>

      {/* SM-2 Spaced Repetition Rating Buttons */}
      <div className="grid grid-cols-4 gap-2 pt-2">
        <button
          onClick={() => handleNext(0)}
          className="rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 py-3 text-xs font-bold transition"
        >
          Again (0)
        </button>
        <button
          onClick={() => handleNext(3)}
          className="rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 py-3 text-xs font-bold transition"
        >
          Hard (3)
        </button>
        <button
          onClick={() => handleNext(4)}
          className="rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 py-3 text-xs font-bold transition"
        >
          Good (4)
        </button>
        <button
          onClick={() => handleNext(5)}
          className="rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 py-3 text-xs font-bold transition"
        >
          Easy (5)
        </button>
      </div>
    </div>
  );
}
