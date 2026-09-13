"use client";

import { useRef, useState } from "react";
import type { DictionaryAudio } from "@/types/dictionary";

/**
 * Audio affordance with an honest availability state.
 *
 * Tatoeba audio was excluded on licence grounds (Phase 04.4), so most entries
 * legitimately have no licensed pronunciation asset. We render a disabled
 * control with the reason rather than a broken or misleading play button.
 * Once a licensed asset is attached, the same component plays it.
 */
export function AudioButton({ audio }: { audio: DictionaryAudio }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  if (audio.status === "unavailable") {
    return (
      <span
        data-testid="audio-unavailable"
        title={audio.reason}
        aria-label={`Audio unavailable: ${audio.reason}`}
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400"
      >
        <span aria-hidden>🔇</span> No audio
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="audio-play"
        onClick={() => {
          const element = ref.current;
          if (!element) return;
          if (playing) {
            element.pause();
            element.currentTime = 0;
          } else {
            void element.play();
          }
        }}
        title={`${audio.attribution} (${audio.license})`}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-600"
      >
        <span aria-hidden>{playing ? "⏹" : "🔊"}</span> {playing ? "Stop" : "Play"}
      </button>
      <audio
        ref={ref}
        src={audio.url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </>
  );
}
