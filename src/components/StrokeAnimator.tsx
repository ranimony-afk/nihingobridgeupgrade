"use client";

import { useEffect, useState } from "react";

export function StrokeAnimator({
  character,
  strokes,
}: {
  character: string;
  strokes: { strokeNo: number; path: string }[];
}) {
  const [frame, setFrame] = useState(strokes.length);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"svg" | "gif">("svg");

  useEffect(() => {
    if (!playing) return;
    if (frame >= strokes.length) {
      setFrame(0);
    }
    const timer = window.setTimeout(() => {
      setFrame((value) => {
        if (value + 1 >= strokes.length) {
          setPlaying(false);
          return strokes.length;
        }
        return value + 1;
      });
    }, mode === "gif" ? 220 : 380);
    return () => window.clearTimeout(timer);
  }, [playing, frame, strokes.length, mode]);

  const visible = strokes.filter((stroke) => stroke.strokeNo <= frame);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="press bg-[#ff9600] px-3 py-1 text-white" onClick={() => { setFrame(0); setPlaying(true); }}>
          Play {mode === "svg" ? "SVG" : "GIF"}
        </button>
        <button type="button" className="press bg-white px-3 py-1" onClick={() => setMode(mode === "svg" ? "gif" : "svg")}>
          Mode: {mode}
        </button>
      </div>
      <svg viewBox="0 0 64 64" className="mt-3 h-40 w-40 rounded-2xl bg-[#fff8f0]">
        <text x="32" y="42" textAnchor="middle" fontSize="28" opacity={playing ? 0.12 : 0.2}>
          {character}
        </text>
        {visible.map((stroke) => (
          <path
            key={stroke.strokeNo}
            d={stroke.path.startsWith("M") ? stroke.path : `M${8 + stroke.strokeNo * 2} 16 v28`}
            fill="none"
            stroke={mode === "gif" ? "#ce82ff" : "#1cb0f6"}
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <p className="text-xs font-bold text-[#777]">
        Frame {Math.min(frame, strokes.length)} / {strokes.length}
      </p>
    </div>
  );
}
