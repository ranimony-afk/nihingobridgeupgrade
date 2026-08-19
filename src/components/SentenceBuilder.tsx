"use client";

import { useState } from "react";
import { speakJapanese } from "@/lib/speech";

export function SentenceBuilder({
  slug,
  prompt,
  tiles,
}: {
  slug: string;
  prompt: string;
  tiles: string[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const bank = tiles.filter((tile, index) => !picked.includes(`${tile}#${index}`));

  async function check() {
    const attempt = picked.map((entry) => entry.split("#")[0] ?? "");
    const response = await fetch(`/api/v1/grammar/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt }),
    });
    const data = (await response.json()) as { data?: { correct: boolean; answer: string } };
    if (data.data?.correct) {
      setResult("Correct");
      speakJapanese(data.data.answer);
    } else {
      setResult(`Not yet · ${data.data?.answer ?? ""}`);
    }
  }

  return (
    <div>
      <p className="font-black">{prompt}</p>
      <div className="mt-2 flex min-h-12 flex-wrap gap-2 rounded-2xl border-2 border-dashed p-2">
        {picked.map((entry) => (
          <button
            key={entry}
            type="button"
            className="press bg-[#ddf4ff] px-3 py-1 text-[#1cb0f6]"
            onClick={() => setPicked((list) => list.filter((item) => item !== entry))}
          >
            {entry.split("#")[0]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {bank.map((tile, index) => (
          <button
            key={`${tile}-${index}`}
            type="button"
            className="press bg-white px-3 py-1"
            onClick={() => setPicked((list) => [...list, `${tile}#${tiles.indexOf(tile)}`])}
          >
            {tile}
          </button>
        ))}
      </div>
      <button type="button" className="press mt-3 bg-[#58cc02] px-4 py-2 text-white" onClick={check}>
        Check sentence
      </button>
      {result ? <p className="mt-2 font-bold">{result}</p> : null}
    </div>
  );
}
