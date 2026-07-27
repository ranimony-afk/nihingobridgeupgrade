"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { type CardItem } from "../flashcards/FlashcardClient";

interface Tile {
  id: string;
  text: string;
  pairId: number;
  type: "front" | "back";
}

export function MatchClient({ cards }: { cards: CardItem[] }) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [cleared, setCleared] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const list: Tile[] = [];
    const sample = cards.slice(0, 6);
    for (const c of sample) {
      list.push({ id: `f-${c.id}`, text: c.front, pairId: c.id, type: "front" });
      list.push({ id: `b-${c.id}`, text: c.back, pairId: c.id, type: "back" });
    }
    // Shuffle
    setTiles(list.sort(() => Math.random() - 0.5));
  }, [cards]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTileClick = (t: Tile) => {
    if (cleared.includes(t.pairId)) return;
    if (!selected) {
      setSelected(t);
      return;
    }

    if (selected.id === t.id) {
      setSelected(null);
      return;
    }

    if (selected.pairId === t.pairId) {
      // Pair match!
      setCleared((c) => [...c, t.pairId]);
      setSelected(null);
    } else {
      // Mismatch
      setTimeout(() => setSelected(null), 400);
    }
  };

  const isComplete = tiles.length > 0 && cleared.length === tiles.length / 2;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center text-xs font-semibold">
        <span>⏱ Time: {seconds}s</span>
        <span className="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg">
          Cleared: {cleared.length} / {tiles.length / 2} pairs
        </span>
      </div>

      {!isComplete ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((t) => {
            const isCleared = cleared.includes(t.pairId);
            const isSelected = selected?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTileClick(t)}
                disabled={isCleared}
                className={`min-h-[100px] p-4 rounded-2xl text-center font-bold text-sm transition shadow-sm border ${
                  isCleared
                    ? "opacity-0 pointer-events-none"
                    : isSelected
                    ? "bg-rose-600 text-white border-rose-700 scale-95"
                    : "bg-white text-slate-900 border-black/5 hover:border-rose-400"
                }`}
              >
                {t.text}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-12 text-center shadow-md border border-black/5 space-y-4">
          <p className="text-4xl">🎉</p>
          <h2 className="text-2xl font-bold text-slate-900">Deck Cleared!</h2>
          <p className="text-xs text-slate-600">You matched all cards in {seconds} seconds.</p>
          <Link
            href="/decks"
            className="inline-block rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white hover:bg-slate-800"
          >
            Study Next Deck →
          </Link>
        </div>
      )}
    </div>
  );
}
