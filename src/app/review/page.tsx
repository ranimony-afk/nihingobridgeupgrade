"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SchedulerDescriptor,
  SrsDeck,
  SrsRating,
  SrsReviewSession,
  SrsStats,
  SRS_RATINGS,
  SessionQueueOrder,
  SESSION_ORDER_LABELS,
  SESSION_QUEUE_ORDERS,
} from "@/types/srs";
import {
  BookOpen,
  CalendarClock,
  Cpu,
  FlaskConical,
  GitBranch,
  Layers,
  Flame,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingUp,
  X,
  Zap,
  Clock,
  ArrowRight,
  History,
  Ban,
} from "lucide-react";

function describeInterval(days: number): string {
  if (days <= 0) return "now";
  if (days < 1) return `${Math.round(days * 24 * 60)}m`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export default function SrsReviewPage() {
  const router = useRouter();

  const [schedulers, setSchedulers] = useState<SchedulerDescriptor[]>([]);
  const [decks, setDecks] = useState<SrsDeck[]>([]);
  const [stats, setStats] = useState<SrsStats | null>(null);
  const [resumable, setResumable] = useState<SrsReviewSession | null>(null);
  const [history, setHistory] = useState<SrsReviewSession[]>([]);
  const [dailyNewUsed, setDailyNewUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Planner
  const [deckId, setDeckId] = useState<string>("all");
  const [newLimit, setNewLimit] = useState(10);
  const [reviewLimit, setReviewLimit] = useState(30);
  const [order, setOrder] = useState<SessionQueueOrder>("due");
  const [dailyNewBudget, setDailyNewBudget] = useState(20);

  // Scheduler lab
  const [labOpen, setLabOpen] = useState(false);
  const [labResult, setLabResult] = useState<Record<string, unknown> | null>(null);
  const [labRating, setLabRating] = useState<SrsRating>("good");
  const [labReps, setLabReps] = useState(4);
  const [labInterval, setLabInterval] = useState(12);

  // Deck config drawer
  const [configDeckId, setConfigDeckId] = useState<string | null>(null);
  const [deckDetail, setDeckDetail] = useState<{
    scheduler: SchedulerDescriptor & { defaultParams: Record<string, unknown> };
    paramsApplied: Record<string, unknown>;
    ladder: Array<{ step: number; intervalDays: number; label: string }>;
  } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [schedRes, deckRes, statsRes, sessRes] = await Promise.all([
        fetch("/api/srs/schedulers"),
        fetch("/api/srs/decks"),
        fetch("/api/srs/stats"),
        fetch("/api/srs/sessions?limit=8"),
      ]);
      const [schedJson, deckJson, statsJson, sessJson] = await Promise.all([
        schedRes.json(),
        deckRes.json(),
        statsRes.json(),
        sessRes.json(),
      ]);

      if (schedJson.success) setSchedulers(schedJson.schedulers);
      if (deckJson.success) setDecks(deckJson.decks);
      if (statsJson.success) setStats(statsJson.stats);
      if (sessJson.success) {
        setResumable(sessJson.resumable);
        setHistory(sessJson.sessions);
        setDailyNewUsed(sessJson.dailyNewUsed ?? 0);
      }
    } catch (e) {
      console.error("Failed to load SRS data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const startSession = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/srs/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId: deckId === "all" ? null : deckId,
          newLimit,
          reviewLimit,
          order,
          dailyNewBudget,
        }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/review/session/${json.sessionId}`);
      } else {
        setNotice(json.error || "Could not start session");
      }
    } finally {
      setBusy(false);
    }
  };

  const openDeckConfig = async (id: string) => {
    setConfigDeckId(id);
    setDeckDetail(null);
    const res = await fetch(`/api/srs/decks/${id}`);
    const json = await res.json();
    if (json.success) setDeckDetail(json);
  };

  const rebindDeck = async (id: string, schedulerKey: string) => {
    setBusy(true);
    try {
      await fetch(`/api/srs/decks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedulerKey }),
      });
      await loadAll();
      if (configDeckId === id) await openDeckConfig(id);
    } finally {
      setBusy(false);
    }
  };

  const runLab = async (schedulerKey: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/srs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedulerKey,
          rating: labRating,
          repetitions: labReps,
          intervalDays: labInterval,
          isLearning: false,
        }),
      });
      const json = await res.json();
      if (json.success) setLabResult(json.preview);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Loading spaced repetition engine…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Phase 11 · Prompt 11.2
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Review Session Engine
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              Spaced Repetition Engine
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {schedulers.length} pluggable algorithms · persisted, resumable sessions · daily new-card
              budgeting
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLabOpen(!labOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <FlaskConical className="h-4 w-4 text-violet-600" /> Scheduler Lab
            </button>
            <button
              onClick={loadAll}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Resumable session banner */}
        {resumable && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-lg shadow-amber-100/50">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-white">
                <Play className="h-5 w-5 fill-current" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  Unfinished session — {resumable.progress.answered}/{resumable.progress.total} answered
                </h3>
                <p className="text-[11px] text-amber-800">
                  {resumable.config.deckName} · started{" "}
                  {new Date(resumable.startedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · progress survives a refresh
                </p>
              </div>
            </div>
            <Link
              href={`/review/session/${resumable.id}`}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-600"
            >
              Resume Session <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: "Due Now", value: stats?.dueNow ?? 0, icon: Zap, tone: "text-red-600 bg-red-50" },
            { label: "Due Today", value: stats?.dueToday ?? 0, icon: CalendarClock, tone: "text-amber-600 bg-amber-50" },
            { label: "Learning", value: stats?.learning ?? 0, icon: Layers, tone: "text-sky-600 bg-sky-50" },
            { label: "Mature", value: stats?.mature ?? 0, icon: TrendingUp, tone: "text-emerald-600 bg-emerald-50" },
            { label: "Retention", value: `${stats?.retentionPercent ?? 0}%`, icon: ShieldCheck, tone: "text-indigo-600 bg-indigo-50" },
            { label: "New Today", value: `${dailyNewUsed}`, icon: Flame, tone: "text-orange-600 bg-orange-50" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${s.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-black text-slate-900">{s.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Session planner */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Play className="h-5 w-5 text-red-600" />
            <h3 className="text-base font-bold text-slate-900">Plan a Review Session</h3>
          </div>

          {notice && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              {notice}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Deck */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Deck scope
              </label>
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"
              >
                <option value="all">All decks</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.dueCount} due)
                  </option>
                ))}
              </select>
            </div>

            {/* New cards */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                New cards · budget {dailyNewBudget - dailyNewUsed} left today
              </label>
              <div className="mt-1.5 flex gap-1.5">
                {[0, 5, 10, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNewLimit(n)}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                      newLimit === n
                        ? "bg-red-600 text-white shadow-xs"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Review cards */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Review cards
              </label>
              <div className="mt-1.5 flex gap-1.5">
                {[10, 30, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => setReviewLimit(n)}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${
                      reviewLimit === n
                        ? "bg-slate-900 text-white shadow-xs"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Order */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Queue order
              </label>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value as SessionQueueOrder)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"
              >
                {SESSION_QUEUE_ORDERS.map((o) => (
                  <option key={o} value={o}>
                    {SESSION_ORDER_LABELS[o].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">
            <strong className="text-slate-800">{SESSION_ORDER_LABELS[order].label}:</strong>{" "}
            {SESSION_ORDER_LABELS[order].description}
          </div>

          <button
            onClick={startSession}
            disabled={busy || (stats?.dueNow ?? 0) === 0}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 py-4 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:from-red-500 hover:to-rose-500 active:scale-95 disabled:opacity-40"
          >
            <Zap className="h-5 w-5 fill-current" />
            Start Session
            <span className="text-xs font-semibold opacity-80">
              ({Math.min(newLimit, Math.max(0, dailyNewBudget - dailyNewUsed))} new +{" "}
              {Math.min(reviewLimit, stats?.dueNow ?? 0)} review)
            </span>
          </button>

          {/* Forecast */}
          {(stats?.forecast?.length ?? 0) > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                7-Day Review Forecast
              </span>
              <div className="mt-3 flex items-end gap-2">
                {stats!.forecast.map((f) => {
                  const max = Math.max(...stats!.forecast.map((x) => x.count), 1);
                  return (
                    <div key={f.day} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-slate-700">{f.count}</span>
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-red-500 to-rose-400"
                        style={{ height: `${Math.max(6, (f.count / max) * 64)}px` }}
                      />
                      <span className="text-[9px] text-slate-500">{f.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Scheduler Lab */}
        {labOpen && (
          <div className="rounded-3xl border-2 border-violet-200 bg-white p-6 shadow-xl shadow-violet-100/50">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-violet-600" />
                <h3 className="text-base font-bold text-slate-900">Scheduler Comparison Lab</h3>
              </div>
              <button onClick={() => setLabOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Simulates a grade against each registered algorithm. Nothing is persisted.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Rating</label>
                <select
                  value={labRating}
                  onChange={(e) => setLabRating(e.target.value as SrsRating)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold"
                >
                  {(["again", "hard", "good", "easy"] as SrsRating[]).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Repetitions</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={labReps}
                  onChange={(e) => setLabReps(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Interval (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={labInterval}
                  onChange={(e) => setLabInterval(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {schedulers.map((s) => (
                <button
                  key={s.key}
                  disabled={busy}
                  onClick={() => runLab(s.key)}
                  className="rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  Simulate {s.shortName}
                </button>
              ))}
            </div>
            {labResult && (
              <div className="mt-5 rounded-2xl bg-slate-900 p-4 text-xs text-slate-200">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] text-violet-300">
                    {(labResult.scheduler as Record<string, unknown>).key as string}@
                    {(labResult.scheduler as Record<string, unknown>).version as string}
                  </span>
                  <span className="text-emerald-300">
                    Next:{" "}
                    <strong className="text-white">
                      {describeInterval(
                        ((labResult.outcome as Record<string, unknown>).intervalDays as number) ?? 0
                      )}
                    </strong>
                  </span>
                </div>
                <p className="font-japanese leading-relaxed text-slate-300">
                  {(labResult.outcome as Record<string, unknown>).explanation as string}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Session history */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <History className="h-5 w-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">Session History</h3>
            <span className="text-[10px] text-slate-400">every session is persisted and resumable</span>
          </div>

          {history.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              <Play className="mx-auto mb-2 h-9 w-9 text-slate-300" />
              <p className="text-sm font-bold text-slate-800">No sessions yet</p>
              <p className="text-xs text-slate-400">Plan your first review session above.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                        s.status === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : s.status === "active"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {s.status}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-slate-900">
                        {s.progress.answered}/{s.progress.total} cards · {s.progress.accuracy}% accuracy
                      </span>
                      <p className="text-[10px] text-slate-500">
                        {s.config.deckName} · {s.progress.newIntroduced} new ·{" "}
                        {fmtClock(s.progress.elapsedSeconds)} ·{" "}
                        {new Date(s.startedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {SRS_RATINGS.map((rt) => (
                      <span
                        key={rt}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          rt === "again"
                            ? "bg-rose-100 text-rose-700"
                            : rt === "hard"
                            ? "bg-amber-100 text-amber-700"
                            : rt === "good"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {s.progress.byRating[rt]}
                      </span>
                    ))}
                    <Link
                      href={`/review/session/${s.id}`}
                      className="ml-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                      {s.status === "active" ? "Resume" : "Report"} <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Decks + algorithm binding */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
            <GitBranch className="h-5 w-5 text-indigo-600" /> Decks & Algorithm Binding
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {decks.map((deck) => {
              const desc = schedulers.find((s) => s.key === deck.schedulerKey);
              return (
                <div
                  key={deck.id}
                  className="flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        {deck.jlptLevel}
                      </span>
                      <span className="rounded-lg bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                        {deck.schedulerKey}
                      </span>
                    </div>
                    <h4 className="mt-2.5 text-sm font-bold leading-snug text-slate-900">{deck.name}</h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{deck.description}</p>

                    {desc && (
                      <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-[10px] text-slate-600">
                        <div className="flex items-center justify-between">
                          <strong className="text-slate-900">{desc.shortName}</strong>
                          <span className="font-mono">v{desc.version}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {desc.intervalLadder.slice(0, 5).map((l) => (
                            <span
                              key={l.step}
                              className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-indigo-700 ring-1 ring-slate-200"
                            >
                              {l.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-red-50 py-1.5">
                        <div className="text-sm font-black text-red-700">{deck.dueCount}</div>
                        <div className="text-[9px] font-semibold text-red-600">Due</div>
                      </div>
                      <div className="rounded-lg bg-sky-50 py-1.5">
                        <div className="text-sm font-black text-sky-700">{deck.newCount}</div>
                        <div className="text-[9px] font-semibold text-sky-600">New</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 py-1.5">
                        <div className="text-sm font-black text-emerald-700">{deck.cardCount}</div>
                        <div className="text-[9px] font-semibold text-emerald-600">Total</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => openDeckConfig(deck.id)}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Configure Algorithm
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Registry */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Cpu className="h-5 w-5 text-violet-600" />
            <h3 className="text-base font-bold text-slate-900">Registered Scheduler Registry</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {schedulers.length} plugins loaded
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {schedulers.map((s) => (
              <div key={s.key} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-violet-100 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700">
                      {s.key}
                    </span>
                    <strong className="text-sm text-slate-900">{s.name}</strong>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">v{s.version}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{s.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ladder</span>
                  {s.intervalLadder.map((l) => (
                    <span
                      key={l.step}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-700"
                    >
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Review audit log */}
        {(stats?.recentReviews?.length ?? 0) > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <h3 className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4 text-base font-bold text-slate-900">
              <BookOpen className="h-5 w-5 text-slate-600" /> Review Audit Log
              <span className="text-[10px] font-normal text-slate-400">
                each entry records the algorithm + version that produced the interval
              </span>
            </h3>
            <div className="mt-3 space-y-2">
              {stats!.recentReviews.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        r.rating === "again"
                          ? "bg-rose-100 text-rose-700"
                          : r.rating === "hard"
                          ? "bg-amber-100 text-amber-700"
                          : r.rating === "easy"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {r.rating}
                    </span>
                    <span className="font-japanese text-sm font-bold text-slate-900">{r.front}</span>
                    <span className="text-[11px] text-slate-500">→ {describeInterval(r.intervalDays)}</span>
                  </div>
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-white">
                    {r.schedulerKey}@v{r.schedulerVersion}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Deck config drawer */}
      {configDeckId && deckDetail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Algorithm Configuration</h3>
                <p className="text-[11px] text-slate-500">
                  Swap algorithms without touching card data
                </p>
              </div>
              <button
                onClick={() => {
                  setConfigDeckId(null);
                  setDeckDetail(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {schedulers.map((s) => {
                const active = deckDetail.scheduler.key === s.key;
                return (
                  <div
                    key={s.key}
                    className={`rounded-2xl border-2 p-4 transition-all ${
                      active ? "border-red-500 bg-red-50/40 ring-2 ring-red-200" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            {s.key}
                          </span>
                          <strong className="text-sm text-slate-900">{s.shortName}</strong>
                          <span className="font-mono text-[10px] text-slate-400">v{s.version}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">{s.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.intervalLadder.slice(0, 6).map((l) => (
                            <span
                              key={l.step}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-indigo-700"
                            >
                              {l.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {active ? (
                        <span className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white">
                          Active
                        </span>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => rebindDeck(configDeckId, s.key)}
                          className="flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          Apply <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-slate-900 p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Resolved parameters applied at grade time
              </div>
              <pre className="overflow-x-auto text-[10px] leading-relaxed text-emerald-300">
                {JSON.stringify(deckDetail.paramsApplied, null, 2)}
              </pre>
            </div>

            <div className="mt-4 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Declarative parameter schema ({deckDetail.scheduler.paramFields.length} fields)
              </span>
              {deckDetail.scheduler.paramFields.map((f) => (
                <div key={f.key} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-slate-900">{f.key}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                      {f.type}
                      {f.unit ? ` · ${f.unit}` : ""}
                      {f.min !== undefined ? ` · ${f.min}–${f.max}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-600">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
