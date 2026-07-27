"use client";

import React, { useState } from "react";
import Link from "next/link";
import { type CardItem } from "../flashcards/FlashcardClient";

export function WriteClient({ cards }: { cards: CardItem[] }) {
  const [index, setIndex] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [score, setScore] = useState(0);

  if (cards.length === 0) return <p className="text-sm opacity-60">No cards to write.</p>;
  const current = cards[index];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = inputVal.trim().toLowerCase();
    const cleanBack = current.back.trim().toLowerCase();
    const cleanFront = current.front.trim().toLowerCase();

    const isMatch = cleanInput === cleanBack || cleanInput === cleanFront;
    if (isMatch) {
      setFeedback("correct");
      setScore((s) => s + 10);
    } else {
      setFeedback("incorrect");
    }

    setTimeout(() => {
      setFeedback(null);
      setInputVal("");
      if (index < cards.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setIndex(0);
      }
    }, 1200);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span>Prompt {index + 1} of {cards.length}</span>
        <span className="text-amber-700 bg-amber-50 px-3 py-1 rounded-lg">Score: {score} XP</span>
      </div>

      <div className="rounded-3xl bg-white p-10 text-center shadow-md border border-black/5 space-y-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Write the meaning or romaji</p>
        <p className="text-5xl font-bold text-slate-950">{current.front}</p>
        {current.furigana && <p className="text-sm text-rose-600 font-medium">{current.furigana}</p>}

        <form onSubmit={handleSubmit} className="pt-4 space-y-3">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Type answer here..."
            className="w-full text-center rounded-xl border border-slate-300 px-4 py-3 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
            autoFocus
          />
          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white hover:bg-slate-800 transition"
          >
            Check Answer →
          </button>
        </form>

        {feedback === "correct" && (
          <div className="rounded-xl bg-emerald-100 p-3 text-xs font-bold text-emerald-900 animate-fade-in">
            ✅ Correct! (+10 XP)
          </div>
        )}
        {feedback === "incorrect" && (
          <div className="rounded-xl bg-rose-100 p-3 text-xs font-bold text-rose-900 animate-fade-in">
            ❌ Answer: {current.back}
          </div>
        )}
      </div>
    </div>
  );
}
