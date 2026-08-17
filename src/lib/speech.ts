export function speakJapanese(text: string) {
  if (typeof window === "undefined" || !text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.86;
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.startsWith("ja"));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export function tone(ok: boolean) {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = ok ? 660 : 180;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    // Audio is a bonus, never block the lesson.
  }
}
