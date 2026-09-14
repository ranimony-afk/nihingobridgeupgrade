"use client";

import { useMemo, useState } from "react";

import type { GrammarMistake } from "@/types/grammar";

const SEVERITY_STYLE: Record<GrammarMistake["severity"], string> = {
  common: "bg-amber-100 text-amber-800",
  subtle: "bg-slate-100 text-slate-600",
  critical: "bg-rose-100 text-rose-700",
};

/**
 * Common mistakes for a grammar point.
 *
 * Corrections start hidden so learners can self-test; the reveal is client-side
 * only, the data always comes from `grammar_mistakes`.
 */
export function GrammarMistakes({ mistakes }: { mistakes: GrammarMistake[] }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [severity, setSeverity] = useState<GrammarMistake["severity"] | "all">("all");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const mistake of mistakes) {
      map.set(mistake.severity, (map.get(mistake.severity) ?? 0) + 1);
    }
    return map;
  }, [mistakes]);

  const visible = severity === "all" ? mistakes : mistakes.filter((item) => item.severity === severity);

  const toggle = (id: number) => {
    setRevealed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (mistakes.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No common mistakes recorded for this point yet — they are curated per point and added
        continuously.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="grammar-mistakes">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["all", "critical", "common", "subtle"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSeverity(value)}
            className={`rounded-full border px-3 py-1 transition ${
              severity === value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            }`}
          >
            {value}
            {value !== "all" && counts.get(value) ? (
              <span className="ml-1 opacity-60">{counts.get(value)}</span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            setRevealed(
              revealed.size === visible.length ? new Set() : new Set(visible.map((item) => item.id)),
            )
          }
          className="ml-auto rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:border-slate-400"
        >
          {revealed.size === visible.length ? "Hide all corrections" : "Reveal all corrections"}
        </button>
      </div>

      <ul className="space-y-3">
        {visible.map((mistake) => {
          const isRevealed = revealed.has(mistake.id);
          return (
            <li
              key={mistake.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 text-lg text-rose-500">
                  ✗
                </span>
                <div className="min-w-0 flex-1">
                  <p className="jp text-base text-slate-800">{mistake.incorrect}</p>
                  <div className="mt-2">
                    {isRevealed ? (
                      <p className="jp flex items-start gap-2 text-base text-emerald-700">
                        <span aria-hidden>✓</span>
                        <span>{mistake.correction}</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggle(mistake.id)}
                        className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-900"
                      >
                        Show correction
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{mistake.explanation}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${SEVERITY_STYLE[mistake.severity]}`}
                >
                  {mistake.severity}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
