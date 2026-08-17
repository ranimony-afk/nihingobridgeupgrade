"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type CardItem } from "../flashcards/FlashcardClient";

export function ListeningClient({ cards }: { cards: CardItem[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);

  if (cards.length === 0) return <p className="text-sm opacity-60">No listening cards to study.</p>;
  const current = cards[index];

  const handleNext = () => {
    setRevealed(false);
    setScore((s) => s + 10);
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setIndex(0);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span>Audio Track {index + 1} of {cards.length}</span>
        <span className="text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg">Score: {score} XP</span>
      </div>

      <div className="rounded-3xl bg-white p-10 text-center shadow-md border border-black/5 space-y-6">
        <div className="rounded-2xl bg-indigo-50 p-6 flex flex-col items-center justify-center space-y-2 border border-indigo-100">
          <span className="text-5xl animate-bounce">🎧</span>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-900">Listen &amp; Recognize Audio</p>
          <button
            onClick={() => setRevealed(true)}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 text-xs transition cursor-pointer"
          >
            🔊 Play Native Pronunciation
          </button>
        </div>

        {revealed ? (
          <div className="space-y-3 pt-2 animate-fade-in">
            <p className="text-4xl font-extrabold text-slate-950">{current.front}</p>
            {current.furigana && <p className="text-sm font-semibold text-rose-600">{current.furigana}</p>}
            <p className="text-base font-bold text-slate-800">{current.back}</p>
            <button
              onClick={handleNext}
              className="w-full rounded-xl bg-slate-900 text-white py-3 text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
            >
              Next Audio Card →
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">Press play to listen, then verify your comprehension.</p>
        )}
      </div>
    </div>
  );
}
