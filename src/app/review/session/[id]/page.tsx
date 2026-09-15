"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  RATING_LABELS,
  SESSION_ORDER_LABELS,
  SRS_RATINGS,
  SrsRating,
  SessionAnswerResult,
  SessionCard,
  SessionStateResponse,
  SessionSummary,
} from "@/types/srs";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  Flame,
  Loader2,
  RotateCcw,
  Target,
  Trophy,
  Undo2,
  XCircle,
  Zap,
} from "lucide-react";

const RATING_STYLES: Record<SrsRating, { btn: string; key: string; chip: string }> = {
  again: { btn: "bg-rose-600 hover:bg-rose-500 text-white", key: "1", chip: "bg-rose-100 text-rose-700" },
  hard: { btn: "bg-amber-500 hover:bg-amber-400 text-white", key: "2", chip: "bg-amber-100 text-amber-700" },
  good: { btn: "bg-emerald-600 hover:bg-emerald-500 text-white", key: "3", chip: "bg-emerald-100 text-emerald-700" },
  easy: { btn: "bg-sky-600 hover:bg-sky-500 text-white", key: "4", chip: "bg-sky-100 text-sky-700" },
};

function fmtInterval(days: number): string {
  if (days <= 0) return "now";
  if (days < 1) return `${Math.round(days * 24 * 60)}m`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudySessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<SessionStateResponse | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [lastFeedback, setLastFeedback] = useState<
    { intervalLabel: string; explanation: string; schedulerKey: string; schedulerVersion: string; rating: SrsRating } | null
  >(null);
  const [undoInfo, setUndoInfo] = useState<string | null>(null);

  // Time-on-card tracking
  const cardShownAt = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  /* ---------------- Load / reload session ---------------- */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/srs/sessions/${sessionId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Session not found");

      setState(json);

      if (json.currentCard) {
        setRevealed(false);
        cardShownAt.current = Date.now();
        setElapsed(0);
      } else if (json.session.status === "active" && json.session.progress.total === 0) {
        setError("This session has an empty queue.");
      } else {
        await loadSummary();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const loadSummary = useCallback(async () => {
    const res = await fetch(`/api/srs/sessions/${sessionId}/summary`);
    const json = await res.json();
    if (json.success) setSummary(json.summary);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Session clock
  useEffect(() => {
    if (summary) return;
    const t = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [summary]);

  /* ---------------- Answer ---------------- */
  const answer = useCallback(
    async (rating: SrsRating) => {
      const card = state?.currentCard;
      if (!card || busy) return;

      setBusy(true);
      setUndoInfo(null);
      try {
        const res = await fetch(`/api/srs/sessions/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: card.card.id,
            rating,
            timeSpentMs: Date.now() - cardShownAt.current,
          }),
        });
        const json = await res.json();

        if (!json.success) throw new Error(json.error || "Answer failed");

        const result: SessionAnswerResult = json.result;

        setLastFeedback({
          intervalLabel: result.intervalLabel,
          explanation: result.explanation,
          schedulerKey: result.schedulerKey,
          schedulerVersion: result.schedulerVersion,
          rating,
        });

        if (result.sessionComplete || !result.nextCard) {
          await loadSummary();
          setState((prev) => (prev ? { ...prev, currentCard: null } : prev));
        } else {
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  session: { ...prev.session, progress: result.progress },
                  currentCard: result.nextCard,
                  recentAnswers: [
                    {
                      reviewId: result.reviewId,
                      cardId: result.cardId,
                      front: result.front,
                      rating,
                      intervalDays: result.intervalDays,
                      intervalLabel: result.intervalLabel,
                      schedulerKey: result.schedulerKey,
                      schedulerVersion: result.schedulerVersion,
                      explanation: result.explanation,
                      timeSpentMs: 0,
                    },
                    ...prev.recentAnswers,
                  ].slice(0, 5),
                }
              : prev
          );
          setRevealed(false);
          cardShownAt.current = Date.now();
          setElapsed(0);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Answer failed");
      } finally {
        setBusy(false);
      }
    },
    [state, busy, sessionId, loadSummary]
  );

  /* ---------------- Undo ---------------- */
  const undo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/srs/sessions/${sessionId}/undo`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Undo failed");

      if (json.undone) {
        setUndoInfo(`Reverted "${json.undone.front}" — card restored to its previous schedule.`);
        setLastFeedback(null);
      }

      if (summary) {
        setSummary(null);
        await load();
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setBusy(false);
    }
  }, [busy, sessionId, summary, load]);

  /* ---------------- Exit ---------------- */
  const exit = useCallback(async () => {
    await fetch(`/api/srs/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abandon", reason: "user-exit" }),
    });
    router.push("/review");
  }, [sessionId, router]);

  /* ---------------- Keyboard shortcuts ---------------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed && state?.currentCard) setRevealed(true);
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const rating = SRS_RATINGS[idx];
        if (rating) answer(rating);
        return;
      }
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, busy, state, answer, undo]);

  /* ============================ LOADING ============================ */
  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Restoring your review session…</p>
      </div>
    );
  }

  /* ============================ ERROR ============================ */
  if (error && !state) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-900">Session unavailable</h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          href="/review"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Back to SRS Dashboard
        </Link>
      </div>
    );
  }

  /* ============================ SUMMARY ============================ */
  if (summary) {
    const r = summary.results;
    const d = summary.duration;

    return (
      <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
        <div className="mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
          {/* Completion hero */}
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-100">
            <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-6 py-8 text-center text-white">
              <Trophy className="mx-auto h-12 w-12 opacity-90" />
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight">セッション完了</h1>
              <p className="mt-1 text-sm text-emerald-50">Session complete — {summary.session.config.deckName}</p>

              <div className="mt-6 inline-flex items-baseline gap-2 rounded-2xl bg-white/15 px-6 py-3 backdrop-blur">
                <span className="text-5xl font-black">{r.accuracy}%</span>
                <span className="text-sm font-semibold text-emerald-50">accuracy</span>
              </div>
            </div>

            {/* Metric grid */}
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
              {[
                { label: "Cards answered", value: r.total, icon: Target },
                { label: "Time", value: fmtClock(d.seconds), icon: Clock },
                { label: "Cards / min", value: d.cardsPerMinute, icon: Zap },
                { label: "New introduced", value: r.newIntroduced, icon: Flame },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.label} className="px-4 py-5 text-center">
                    <Icon className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
                    <div className="text-2xl font-black text-slate-900">{m.value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rating distribution */}
            <div className="px-6 py-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Answer distribution
              </span>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {SRS_RATINGS.map((rt) => {
                  const pct = r.total > 0 ? (r.byRating[rt] / r.total) * 100 : 0;
                  const bg =
                    rt === "again"
                      ? "bg-rose-500"
                      : rt === "hard"
                      ? "bg-amber-500"
                      : rt === "good"
                      ? "bg-emerald-500"
                      : "bg-sky-500";
                  return pct > 0 ? <div key={rt} className={bg} style={{ width: `${pct}%` }} /> : null;
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {SRS_RATINGS.map((rt) => (
                  <span
                    key={rt}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${RATING_STYLES[rt].chip}`}
                  >
                    {RATING_LABELS[rt].label}: {r.byRating[rt]}
                  </span>
                ))}
              </div>
            </div>

            {/* Per-scheduler breakdown — proof the abstraction is doing real work */}
            {summary.schedulerBreakdown.length > 0 && (
              <div className="border-t border-slate-100 px-6 py-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Scheduling algorithms applied
                </span>
                <div className="mt-3 space-y-2">
                  {summary.schedulerBreakdown.map((s) => (
                    <div
                      key={s.schedulerKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5"
                    >
                      <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                        {s.schedulerKey}@v{s.schedulerVersion}
                      </span>
                      <span className="text-xs text-slate-600">
                        {s.answers} answers · {s.accuracy}% correct · avg next interval{" "}
                        <strong className="text-slate-900">{fmtInterval(s.avgIntervalDays)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7-day forecast for studied cards */}
            {summary.nextDuePreview.length > 0 && (
              <div className="border-t border-slate-100 px-6 py-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  When these cards return
                </span>
                <div className="mt-3 flex items-end gap-2">
                  {(() => {
                    const max = Math.max(...summary.nextDuePreview.map((x) => x.count), 1);
                    return summary.nextDuePreview.map((f) => (
                      <div key={f.day} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-700">{f.count}</span>
                        <div
                          className="w-full rounded-t-lg bg-gradient-to-t from-indigo-500 to-sky-400"
                          style={{ height: `${Math.max(6, (f.count / max) * 56)}px` }}
                        />
                        <span className="text-[9px] text-slate-500">{f.day}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 border-t border-slate-100 px-6 py-5">
              <button
                onClick={async () => {
                  const res = await fetch("/api/srs/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      deckId: summary.session.deckId,
                      newLimit: summary.session.config.newLimit,
                      reviewLimit: summary.session.config.reviewLimit,
                      order: summary.session.config.order,
                      dailyNewBudget: summary.session.config.dailyNewBudget,
                    }),
                  });
                  const json = await res.json();
                  if (json.success) router.push(`/review/session/${json.sessionId}`);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700"
              >
                <RotateCcw className="h-4 w-4" /> Repeat This Session
              </button>
              <button
                onClick={undo}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> Undo Last Answer
              </button>
              <Link
                href="/review"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" /> Dashboard
              </Link>
            </div>
          </div>

          {/* Per-card outcomes */}
          {summary.cardOutcomes.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
              <h3 className="flex items-center gap-2 border-b border-slate-100 pb-4 text-base font-bold text-slate-900">
                <CheckCircle2 className="h-5 w-5 text-slate-600" /> Card-by-card outcomes
              </h3>
              <div className="mt-3 space-y-2">
                {summary.cardOutcomes.map((c, i) => (
                  <div
                    key={c.reviewId}
                    className={`rounded-xl border p-3.5 ${
                      c.wasCorrect ? "border-slate-100 bg-slate-50/60" : "border-rose-200 bg-rose-50/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-bold text-slate-400">#{i + 1}</span>
                        {c.wasCorrect ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600" />
                        )}
                        <span className="font-japanese text-sm font-bold text-slate-900">{c.front}</span>
                        {c.reading && (
                          <span className="font-japanese text-xs text-red-600">{c.reading}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${RATING_STYLES[c.rating].chip}`}>
                          {RATING_LABELS[c.rating].label}
                        </span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                          → {c.intervalLabel}
                        </span>
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-white">
                          {c.schedulerKey}
                        </span>
                      </div>
                    </div>
                    {c.explanation && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{c.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  /* ============================ STUDY VIEW ============================ */
  const card = state?.currentCard;
  const progress = state?.session.progress;

  if (!card || !progress) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <h2 className="text-xl font-bold text-slate-900">Nothing left in this session</h2>
        <Link
          href="/review"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const pct = progress.total > 0 ? (progress.answered / progress.total) * 100 : 0;
  const s = card.card.state;

  return (
    <div className="min-h-screen bg-slate-100/60">
      {/* Sticky session header */}
      <div className="sticky top-16 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                {card.card.jlptLevel || "N5"}
              </span>
              <div className="hidden sm:block">
                <span className="text-xs font-bold text-slate-900">
                  {progress.answered + 1} / {progress.total}
                </span>
                <p className="text-[10px] text-slate-500">
                  {state?.session.config.deckName} ·{" "}
                  {SESSION_ORDER_LABELS[state?.session.config.order ?? "due"].label}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                {fmtClock(elapsed)}
              </span>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                {progress.accuracy}%
              </span>
              <button
                onClick={undo}
                disabled={busy || progress.answered === 0}
                title="Undo last answer (U)"
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={exit}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Exit
              </button>
            </div>
          </div>

          {/* Progress bar segmented by rating */}
          <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            {SRS_RATINGS.map((rt) => {
              const w = progress.total > 0 ? (progress.byRating[rt] / progress.total) * 100 : 0;
              const bg =
                rt === "again"
                  ? "bg-rose-500"
                  : rt === "hard"
                  ? "bg-amber-500"
                  : rt === "good"
                  ? "bg-emerald-500"
                  : "bg-sky-500";
              return w > 0 ? <div key={rt} className={bg} style={{ width: `${w}%` }} /> : null;
            })}
            <div className="bg-slate-300/60" style={{ width: `${100 - pct}%` }} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        {/* Feedback strip from previous answer */}
        {lastFeedback && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900">
            <div className="flex flex-wrap items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Scheduled to return in{" "}
              <span className="rounded bg-white px-1.5 py-0.5 font-mono">{lastFeedback.intervalLabel}</span>
              <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {lastFeedback.schedulerKey}@v{lastFeedback.schedulerVersion}
              </span>
            </div>
            <p className="mt-1 text-emerald-800">{lastFeedback.explanation}</p>
          </div>
        )}

        {undoInfo && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
            {undoInfo}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        {/* Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-100">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              {card.card.cardType}
              {card.kind === "new" && (
                <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-red-700">NEW</span>
              )}
            </span>
            <span className="rounded-lg bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
              {card.card.schedulerKey}
            </span>
          </div>

          <div className="py-10 text-center">
            <div className="font-japanese text-4xl font-bold text-slate-950 sm:text-5xl">
              {card.card.front}
            </div>

            {revealed ? (
              <div className="mt-8 space-y-2.5 border-t border-slate-100 pt-7">
                {card.card.reading && (
                  <p className="font-japanese text-2xl font-semibold text-red-700">{card.card.reading}</p>
                )}
                <p className="text-base text-slate-800">{card.card.back}</p>
                {card.card.meaning && card.card.meaning !== card.card.back && (
                  <p className="text-xs text-slate-500">{card.card.meaning}</p>
                )}
                {card.card.hint && <p className="text-xs italic text-slate-400">Hint: {card.card.hint}</p>}
              </div>
            ) : (
              <button
                onClick={() => setRevealed(true)}
                className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-7 py-3.5 text-sm font-bold text-white shadow-md hover:bg-slate-800 active:scale-95"
              >
                <Eye className="h-4 w-4" /> Reveal Answer
                <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Space</kbd>
              </button>
            )}
          </div>

          {/* Card state (algorithm-agnostic superset) */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
            <span>reviews {s.totalReviews}</span>
            <span>lapses {s.lapses}</span>
            <span>box {s.box}</span>
            <span>S {s.stabilityDays.toFixed(2)}d</span>
            <span>D {s.difficulty.toFixed(1)}</span>
            <span>EF {s.easeFactor.toFixed(2)}</span>
            <span>phase {s.phase}</span>
          </div>
        </div>

        {/* Rating buttons with live interval previews */}
        {revealed && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {card.ratingPreviews.map((p) => (
              <button
                key={p.rating}
                disabled={busy}
                onClick={() => answer(p.rating)}
                className={`rounded-2xl px-3 py-3.5 text-center shadow-md transition-all active:scale-95 disabled:opacity-50 ${RATING_STYLES[p.rating].btn}`}
              >
                <span className="block text-sm font-bold">{RATING_LABELS[p.rating].japanese}</span>
                <span className="mt-0.5 block text-[10px] font-semibold opacity-85">
                  {RATING_LABELS[p.rating].label}
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                  {p.intervalLabel}
                  <kbd className="opacity-70">{RATING_STYLES[p.rating].key}</kbd>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Recent answers strip */}
        {(state?.recentAnswers.length ?? 0) > 0 && !revealed && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Just answered
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state!.recentAnswers.map((a) => (
                <span
                  key={a.reviewId}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2 py-1"
                >
                  <span className="font-japanese text-xs font-bold text-slate-800">{a.front}</span>
                  <span className={`rounded px-1 text-[9px] font-bold ${RATING_STYLES[a.rating].chip}`}>
                    {a.rating}
                  </span>
                  <span className="font-mono text-[9px] text-indigo-600">{a.intervalLabel}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-slate-400">
          Shortcuts: <kbd className="rounded bg-slate-200 px-1">Space</kbd> reveal ·{" "}
          <kbd className="rounded bg-slate-200 px-1">1–4</kbd> rate ·{" "}
          <kbd className="rounded bg-slate-200 px-1">U</kbd> undo
        </p>
      </main>
    </div>
  );
}
