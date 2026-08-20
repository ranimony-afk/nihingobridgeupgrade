"use client";

import { speakJapanese } from "@/lib/speech";

export function SpeakLink({ text }: { text: string }) {
  return (
    <button type="button" className="press bg-[#ddf4ff] px-3 py-1 text-sm text-[#1cb0f6]" onClick={() => speakJapanese(text)}>
      🔊 {text}
    </button>
  );
}
