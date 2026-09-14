"use client";

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, Pause, Play } from "lucide-react";

interface ExamTimerProps {
  initialSeconds: number;
  isPaused?: boolean;
  onTimeExpired: () => void;
  onTick?: (remainingSeconds: number) => void;
}

export function ExamTimer({
  initialSeconds,
  isPaused = false,
  onTimeExpired,
  onTick,
}: ExamTimerProps) {
  const [remaining, setRemaining] = useState<number>(initialSeconds);

  useEffect(() => {
    setRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeExpired();
          return 0;
        }
        const next = prev - 1;
        if (onTick && next % 5 === 0) {
          onTick(next);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, onTimeExpired, onTick]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isUrgent = remaining < 300; // Under 5 minutes
  const isCritical = remaining < 60; // Under 1 minute

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 font-mono text-sm font-bold transition-all ${
        isCritical
          ? "bg-rose-600 text-white animate-pulse ring-4 ring-rose-200"
          : isUrgent
          ? "bg-amber-500 text-white ring-2 ring-amber-200"
          : "border border-slate-200 bg-slate-900 text-white shadow-xs"
      }`}
    >
      <Clock className={`h-4 w-4 ${isUrgent ? "animate-spin" : ""}`} />
      <span>{formattedTime}</span>
      {isUrgent && (
        <span className="text-[10px] uppercase tracking-wider font-sans bg-white/20 px-1.5 py-0.5 rounded ml-1">
          {isCritical ? "Submit!" : "Low Time"}
        </span>
      )}
    </div>
  );
}
