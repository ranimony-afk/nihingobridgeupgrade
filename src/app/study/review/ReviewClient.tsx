"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type CardItem } from "../flashcards/FlashcardClient";

export function ReviewClient({ cards }: { cards: CardItem[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  if (cards.length === 0) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm space-y-3">
        <p className="text-4xl">🎉</p>
        <h3 className="text-xl font-bold text-slate-900">All Reviews Completed for Today!</h3>
        <p className="text-xs text-slate-600">Your spaced repetition schedule is completely up-to-date.</p>
        <Link href="/decks" className="inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white">
          Return to Decks
        </Link>
      </div>
    );
  }

  const current = cards[index];

  const handleScore = (q: number) => {
    setReviewedCount((c) => c + 1);
    setRevealed(false);
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setIndex(0);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span>Due for Review: {index + 1} / {cards.length}</span>
        <span className="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg">Reviewed: {reviewedCount} cards</span>
      </div>

      <div className="rounded-3xl bg-white p-8 sm:p-10 text-center shadow-md border border-black/5 space-y-4">
        <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider">Spaced Repetition Review (SM-2)</span>
        <p className="text-5xl font-black text-slate-950">{current.front}</p>
        {current.furigana && <p className="text-sm font-semibold text-rose-600">{current.furigana}</p>}

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-xl bg-slate-900 text-white py-3 text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
          >
            Show Answer &amp; Meaning 💡
          </button>
        ) : (
          <div className="space-y-4 pt-2 animate-fade-in">
            <p className="text-2xl font-bold text-slate-900">{current.back}</p>
            {current.notes && <p className="text-xs text-slate-500 italic">{current.notes}</p>}

            <div className="grid grid-cols-4 gap-2 pt-2">
              <button
                onClick={() => handleScore(0)}
                className="rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 py-3 text-xs font-bold transition cursor-pointer"
              >
                Again (0)
              </button>
              <button
                onClick={() => handleScore(3)}
                className="rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 py-3 text-xs font-bold transition cursor-pointer"
              >
                Hard (3)
              </button>
              <button
                onClick={() => handleScore(4)}
                className="rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 py-3 text-xs font-bold transition cursor-pointer"
              >
                Good (4)
              </button>
              <button
                onClick={() => handleScore(5)}
                className="rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 py-3 text-xs font-bold transition cursor-pointer"
              >
                Easy (5)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
