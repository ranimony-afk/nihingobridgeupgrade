"use client";

import { useJapaneseSpeech } from "./useJapaneseSpeech";

/**
 * Shared on-device Japanese pronunciation control.
 * Used by both dictionary entries and kanji characters.
 */
export default function PronunciationButton({
  text,
  ariaLabel,
  size = "md",
}: {
  text: string;
  ariaLabel: string;
  size?: "md" | "lg";
}) {
  const { supported, hasJapaneseVoice, speaking, speak } = useJapaneseSpeech();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => speak(text)}
        disabled={!supported}
        aria-label={ariaLabel}
        data-testid="audio-button"
        className={`inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
          size === "lg" ? "px-5 py-2.5 text-base" : "px-4 py-2 text-sm"
        }`}
      >
        <span aria-hidden="true">{speaking ? "◼" : "▶"}</span>
        {speaking ? "Playing…" : "Listen"}
      </button>
      {!supported && (
        <p className="text-[11px] text-slate-400">Audio not supported in this browser.</p>
      )}
      {supported && !hasJapaneseVoice && (
        <p className="text-[11px] text-slate-400">
          No Japanese voice installed — audio may use the default voice.
        </p>
      )}
    </div>
  );
}
