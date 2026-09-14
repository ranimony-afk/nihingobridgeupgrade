"use client";

import { useState, useEffect, useRef } from "react";
import { Volume2, Play, Pause, RotateCcw, FastForward, FileText, CheckCircle2 } from "lucide-react";

interface ListeningAudioPlayerProps {
  audioScript?: string | null;
  audioUrl?: string | null;
  prompt: string;
  autoPlay?: boolean;
}

export function ListeningAudioPlayer({
  audioScript,
  audioUrl,
  prompt,
  autoPlay = false,
}: ListeningAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [showScript, setShowScript] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [speechVoice, setSpeechVoice] = useState<SpeechSynthesisVoice | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Speech Synthesis Voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const jaVoice =
        voices.find((v) => v.lang === "ja-JP" || v.lang.startsWith("ja")) || null;
      setSpeechVoice(jaVoice);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const cleanTextForSpeech = (text: string) => {
    return text
      .replace(/<ruby>|<rt>.*?<\/rt>|<\/ruby>/g, "")
      .replace(/【.*?】/g, "")
      .replace(/（.*?）/g, "")
      .replace(/女の.*?：|男の.*?：/g, " ")
      .trim();
  };

  const handlePlay = () => {
    if (audioUrl && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.play();
        setIsPlaying(true);
        setPlayCount((prev) => prev + 1);
      }
      return;
    }

    // Use Web Speech Synthesis
    if (!("speechSynthesis" in window)) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      window.speechSynthesis.cancel();

      const textToSpeak = cleanTextForSpeech(audioScript || prompt);
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "ja-JP";
      utterance.rate = playbackSpeed;
      if (speechVoice) utterance.voice = speechVoice;

      utterance.onend = () => {
        setIsPlaying(false);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setPlayCount((prev) => prev + 1);
    }
  };

  const handleStop = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  const toggleSpeed = () => {
    const speeds = [0.8, 1.0, 1.2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-blue-50/50 to-slate-50 p-4 shadow-sm mb-6">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          onError={() => setIsPlaying(false)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePlay}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md transition-all ${
              isPlaying
                ? "bg-amber-500 text-white ring-4 ring-amber-100 scale-105"
                : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
            }`}
            title={isPlaying ? "Pause Audio" : "Play Listening Audio"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 fill-current ml-0.5" />
            )}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                <Volume2 className="h-3.5 w-3.5" /> 聴解音声 (Listening Audio)
              </span>
              {playCount > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  Played {playCount}x
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {isPlaying
                ? "Playing authentic Japanese dialogue audio..."
                : "Click play to listen to the dialogue passage."}
            </p>
          </div>
        </div>

        {/* Action Buttons: Speed & Script toggle */}
        <div className="flex items-center gap-2">
          {isPlaying && (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Stop
            </button>
          )}

          <button
            type="button"
            onClick={toggleSpeed}
            className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 shadow-sm transition-all"
            title="Adjust speech playback tempo"
          >
            <FastForward className="h-3.5 w-3.5" /> {playbackSpeed}x
          </button>

          {audioScript && (
            <button
              type="button"
              onClick={() => setShowScript(!showScript)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                showScript
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              {showScript ? "Hide Script" : "Show Script"}
            </button>
          )}
        </div>
      </div>

      {/* Animated Waveform Visualizer */}
      {isPlaying && (
        <div className="mt-3 flex items-center justify-center gap-1.5 h-6">
          {[40, 75, 100, 60, 90, 45, 80, 95, 55, 70, 85, 40].map((h, i) => (
            <span
              key={i}
              className="w-1 bg-indigo-500 rounded-full animate-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${(i % 4) * 150}ms`,
                animationDuration: "800ms",
              }}
            />
          ))}
        </div>
      )}

      {/* Script Accordion */}
      {showScript && audioScript && (
        <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 text-xs text-slate-800 leading-relaxed font-japanese whitespace-pre-line">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-200 text-amber-900 font-bold text-[11px]">
            <span>スクリプト (Audio Transcript)</span>
            <span className="text-amber-700 font-normal">Japanese Text & Dialogue</span>
          </div>
          {audioScript}
        </div>
      )}
    </div>
  );
}
