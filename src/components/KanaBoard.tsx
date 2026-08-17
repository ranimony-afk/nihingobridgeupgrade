"use client";

import { useState } from "react";
import { HIRAGANA_CHART, HIRAGANA_ROMAJI, KATAKANA_CHART, KATAKANA_ROMAJI } from "@/lib/curriculum";
import { speakJapanese } from "@/lib/speech";

export function KanaBoard() {
  const [mode, setMode] = useState<"hira" | "kata">("hira");
  const chart = mode === "hira" ? HIRAGANA_CHART : KATAKANA_CHART;
  const romaji = mode === "hira" ? HIRAGANA_ROMAJI : KATAKANA_ROMAJI;

  return (
    <div className="mt-6">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`press px-4 py-2 ${mode === "hira" ? "bg-[#1cb0f6] text-white" : "bg-white"}`}
          onClick={() => setMode("hira")}
        >
          Hiragana
        </button>
        <button
          type="button"
          className={`press px-4 py-2 ${mode === "kata" ? "bg-[#ce82ff] text-white" : "bg-white"}`}
          onClick={() => setMode("kata")}
        >
          Katakana
        </button>
      </div>
      <div className="grid gap-2">
        {chart.map((row) => (
          <div key={row.join("-")} className="grid grid-cols-5 gap-2">
            {row.map((char, index) =>
              char ? (
                <button
                  key={char}
                  type="button"
                  onClick={() => speakJapanese(char)}
                  className="press bg-white py-3"
                >
                  <span className="ja block text-2xl font-black">{char}</span>
                  <span className="text-xs font-bold text-[#777]">{romaji[char]}</span>
                </button>
              ) : (
                <div key={`empty-${index}`} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
