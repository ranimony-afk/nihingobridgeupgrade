"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type CardItem } from "../flashcards/FlashcardClient";

export function MultipleChoiceClient({ cards }: { cards: CardItem[] }) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);

  if (cards.length === 0) return <p className="text-sm opacity-60">No cards to study.</p>;
  const current = cards[index];

  // Build 4 multiple choice options with 1 correct answer
  const correctMeaning = current.back;
  const otherMeanings = cards
    .filter((c) => c.id !== current.id)
    .map((c) => c.back)
    .slice(0, 3);
  const options = [correctMeaning, ...otherMeanings, "To sleep early", "To walk in the park"].slice(0, 4);

  const handleSelect = (idx: number) => {
    if (selectedOpt !== null) return;
    setSelectedOpt(idx);
    const isCorrect = options[idx] === correctMeaning;
    if (isCorrect) setScore((s) => s + 10);

    setTimeout(() => {
      setSelectedOpt(null);
      if (index < cards.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setIndex(0);
      }
    }, 1200);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 font-sans">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span>Question {index + 1} of {cards.length}</span>
        <span className="text-rose-700 bg-rose-50 px-3 py-1 rounded-lg">Score: {score} XP</span>
      </div>

      <div className="rounded-3xl bg-white p-8 sm:p-10 text-center shadow-md border border-black/5 space-y-5">
        <p className="text-xs uppercase font-bold text-slate-500 tracking-wider">Select the correct English definition</p>
        <p className="text-5xl font-extrabold text-slate-950">{current.front}</p>
        {current.furigana && <p className="text-sm font-semibold text-rose-600">{current.furigana}</p>}

        <div className="grid gap-2.5 pt-4 text-left">
          {options.map((opt, optIdx) => {
            const isChosen = selectedOpt === optIdx;
            const isCorrect = opt === correctMeaning;
            return (
              <button
                key={optIdx}
                onClick={() => handleSelect(optIdx)}
                className={`p-4 rounded-2xl text-xs font-bold transition border cursor-pointer ${
                  selectedOpt !== null
                    ? isCorrect
                      ? "bg-emerald-100 border-emerald-400 text-emerald-950"
                      : isChosen
                      ? "bg-rose-100 border-rose-400 text-rose-950"
                      : "bg-slate-50 border-slate-200 text-slate-500"
                    : "bg-white border-slate-200 text-slate-900 hover:border-rose-400 hover:bg-slate-50"
                }`}
              >
                <span className="inline-block w-5 opacity-70 font-mono">{String.fromCharCode(65 + optIdx)}.</span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
