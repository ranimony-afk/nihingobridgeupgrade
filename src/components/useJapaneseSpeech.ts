"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * Japanese pronunciation via the browser Speech Synthesis API.
 *
 * Deliberately NOT recorded corpus audio: Phase 04.4 established that Tatoeba
 * audio carries a wider/unclear licence range and, where a recording's licence
 * field is empty, it may not be reused outside Tatoeba at all. On-device TTS
 * provides pronunciation without redistributing unlicensed recordings.
 *
 * speechSynthesis is external browser state, so availability and the voice list
 * are read with useSyncExternalStore rather than effects.
 */

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

function getSupportedSnapshot(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function getJapaneseVoiceSnapshot(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis
    .getVoices()
    .some((voice) => voice.lang.toLowerCase().startsWith("ja"));
}

function getServerSnapshot(): boolean {
  return false;
}

export function useJapaneseSpeech() {
  const supported = useSyncExternalStore(subscribe, getSupportedSnapshot, getServerSnapshot);
  const hasJapaneseVoice = useSyncExternalStore(
    subscribe,
    getJapaneseVoiceSnapshot,
    getServerSnapshot,
  );
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    const voice = window.speechSynthesis
      .getVoices()
      .find((candidate) => candidate.lang.toLowerCase().startsWith("ja"));
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }, []);

  return { supported, hasJapaneseVoice, speaking, speak };
}
