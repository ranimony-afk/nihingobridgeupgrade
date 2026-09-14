"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DailyQueueResponse, DailySeverity, DailySettings } from "@/types/srs";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  History,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

const SEVERITY_STYLES: Record<DailySeverity, { ring: string; bg: string; text: string; badge: string }> = {
  clear: { ring: "border-emerald-300", bg: "bg-emerald-50/70", text: "text-emerald-900", badge: "bg-emerald-600" },
  "on-track": { ring: "border-sky-300", bg: "bg-sky-50/70", text: "text-sky-900", badge: "bg-sky-600" },
  heavy: { ring: "border-amber-300", bg: "bg-amber-50/70", text: "text-amber-900", badge: "bg-amber-600" },
  backlog: { ring: "border-rose-300", bg: "bg-rose-50/70", text: "text-rose-900", badge: "bg-rose-600" },
};

function fmtClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function DailyQueuePage() {
  const router = useRouter();

  const [data, setData] = useState<DailyQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<DailySettings | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/srs/daily?historyDays=21");
      const json = await res.json();
      if (json.success) {
        setData(json);
        setDraft(json.settings);
      }
    } catch (e) {
      console.error("Failed to load daily queue:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    if (!draft) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/srs/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (json.success) {
        setSaveMsg("Settings saved — queue recalculated.");
        await load();
      } else {
        setSaveMsg(json.error || "Save failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const startSession = async (overrides?: {
    newLimit?: number;
    reviewLimit?: number;
    order?: string;
    deckId?: string | null;
    label?: string;
  }) => {
    setStarting(true);
    try {
      const payload = {
        deckId: overrides?.deckId ?? null,
        newLimit: overrides?.newLimit ?? data?.suggestedSession.newLimit ?? 0,
        reviewLimit: overrides?.reviewLimit ?? data?.suggestedReview ?? 20,
        order: overrides?.order ?? "due",
        dueHorizon: "day",
        dailyNewBudget: data?.settings.dailyNewTarget ?? 20,
      };
      const res = await fetch("/api/srs/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) router.push(`/review/session/${json.sessionId}`);
    } finally {
      setStarting(false);
    }
  };

  if (loading || !data || !draft) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Resolving your daily due queue…</p>
      </div>
    );
  }

  const sev = SEVERITY_STYLES[data.recommendation.severity];
  const maxForecast = Math.max(...data.forecast.map((f) => f.balancedCount), ...data.forecast.map((f) => f.count), 1);
  const maxHistory = Math.max(...data.history.map((h) => h.reviews), 1);

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Phase 11 · Prompt 11.3
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Daily Due Queue
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              今日の復習 — Today&apos;s Queue
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {data.day.localDate} · day starts {String(data.day.cutoffHour).padStart(2, "0")}:00{" "}
              {data.day.timezone} · UTC{data.day.offsetMinutes >= 0 ? "+" : ""}
              {data.day.offsetMinutes / 60}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/review"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Layers className="h-4 w-4" /> Dashboard
            </Link>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4 text-slate-500" /> Targets
            </button>
            <button
              onClick={load}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Recommendation banner */}
        <div className={`rounded-3xl border-2 ${sev.ring} ${sev.bg} p-5 shadow-lg shadow-slate-100`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${sev.badge} text-white`}
              >
                {data.recommendation.severity === "backlog" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : data.recommendation.severity === "heavy" ? (
                  <Gauge className="h-5 w-5" />
                ) : data.recommendation.severity === "on-track" ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div>
                <h2 className={`text-base font-bold ${sev.text}`}>{data.recommendation.headline}</h2>
                <p className={`mt-0.5 max-w-2xl text-xs leading-relaxed ${sev.text} opacity-90`}>
                  {data.recommendation.detail}
                </p>
                {data.recommendation.redistribution && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.recommendation.redistribution.map((r) => (
                      <span
                        key={r.date}
                        className="rounded-lg bg-white/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200"
                      >
                        {r.date.slice(5)}: {r.from}→{r.to}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => startSession()}
              disabled={starting || data.suggestedReview === 0}
              className="flex shrink-0 items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:bg-red-700 active:scale-95 disabled:opacity-40"
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              {data.suggestedSession.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Target className="h-5 w-5 text-indigo-600" /> Daily Targets & Day Definition
              </h3>
              <button onClick={() => setSettingsOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  New cards / day
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={draft.dailyNewTarget}
                  onChange={(e) => setDraft({ ...draft, dailyNewTarget: parseInt(e.target.value, 10) || 0 })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Reviews / day
                </label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={draft.dailyReviewTarget}
                  onChange={(e) => setDraft({ ...draft, dailyReviewTarget: parseInt(e.target.value, 10) || 0 })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Day rolls over at
                </label>
                <select
                  value={draft.dayCutoffHour}
                  onChange={(e) => setDraft({ ...draft, dayCutoffHour: parseInt(e.target.value, 10) })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Timezone</label>
                <input
                  type="text"
                  value={draft.timezone}
                  onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  placeholder="Asia/Tokyo"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Max reviews / day (0 = none)
                </label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={draft.maxDailyReviews}
                  onChange={(e) => setDraft({ ...draft, maxDailyReviews: parseInt(e.target.value, 10) || 0 })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Forecast horizon (days)
                </label>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={draft.forecastDays}
                  onChange={(e) => setDraft({ ...draft, forecastDays: parseInt(e.target.value, 10) || 14 })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Load balancing
                </label>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, loadBalanceBacklog: !draft.loadBalanceBacklog })}
                  className={`mt-1.5 flex w-full items-center justify-between rounded-xl border-2 p-2.5 text-xs font-bold transition-all ${
                    draft.loadBalanceBacklog
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span>{draft.loadBalanceBacklog ? "Enabled — flatten spikes" : "Disabled"}</span>
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                      draft.loadBalanceBacklog ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        draft.loadBalanceBacklog ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={saveSettings}
                disabled={busy}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save & Recalculate"}
              </button>
              {saveMsg && <span className="text-xs font-semibold text-slate-600">{saveMsg}</span>}
            </div>
          </div>
        )}

        {/* Due buckets */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            onClick={() =>
              startSession({
                newLimit: 0,
                reviewLimit: data.buckets.overdue.count,
                order: "due",
                label: "Clear overdue",
              })
            }
            disabled={data.buckets.overdue.count === 0 || starting}
            className={`rounded-3xl border-2 bg-white p-5 text-left shadow-sm transition-all ${
              data.buckets.overdue.count > 0
                ? "border-rose-300 hover:border-rose-400 hover:shadow-md"
                : "border-slate-200 opacity-60"
            } disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              {data.buckets.overdue.count > 0 && (
                <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  Study now
                </span>
              )}
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{data.buckets.overdue.count}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Overdue</div>
            {data.buckets.overdue.oldestDays > 0 && (
              <div className="mt-1 text-[10px] text-rose-600">
                oldest {data.buckets.overdue.oldestDays}d ago
              </div>
            )}
          </button>

          <button
            onClick={() =>
              startSession({
                newLimit: 0,
                reviewLimit: data.buckets.dueToday.count,
                order: "due",
                label: "Today's reviews",
              })
            }
            disabled={data.buckets.dueToday.count === 0 || starting}
            className={`rounded-3xl border-2 bg-white p-5 text-left shadow-sm transition-all ${
              data.buckets.dueToday.count > 0
                ? "border-amber-300 hover:border-amber-400 hover:shadow-md"
                : "border-slate-200 opacity-60"
            } disabled:cursor-not-allowed`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{data.buckets.dueToday.count}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Due today</div>
          </button>

          <div className="rounded-3xl border-2 border-sky-200 bg-white p-5 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Clock className="h-4 w-4" />
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{data.buckets.laterToday.count}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Later today</div>
            <div className="mt-1 text-[10px] text-sky-600">learning steps</div>
          </div>

          <button
            onClick={() =>
              startSession({
                newLimit: data.suggestedSession.newLimit,
                reviewLimit: 0,
                order: "new-first",
                label: "Learn new cards",
              })
            }
            disabled={data.suggestedSession.newLimit === 0 || starting}
            className={`rounded-3xl border-2 bg-white p-5 text-left shadow-sm transition-all ${
              data.buckets.newAvailable.count > 0
                ? "border-emerald-300 hover:border-emerald-400 hover:shadow-md"
                : "border-slate-200 opacity-60"
            } disabled:cursor-not-allowed`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{data.buckets.newAvailable.count}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">New available</div>
            <div className="mt-1 text-[10px] text-emerald-600">
              budget {data.suggestedSession.newLimit} of {data.settings.dailyNewTarget} today
            </div>
          </button>
        </div>

        {/* Progress today + streak */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Progress */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Target className="h-5 w-5 text-indigo-600" /> Today&apos;s Progress
              </h3>
              <span className="text-xs font-bold text-slate-600">
                {data.progress.reviewsDone} / {data.progress.reviewsTarget} reviews
              </span>
            </div>

            {/* Big bar */}
            <div className="mt-4">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{
                    width: `${Math.min(100, data.progress.percentComplete)}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-emerald-700">{data.progress.percentComplete}% of target</span>
                <span className="text-slate-500">
                  {data.progress.remainingToday > 0
                    ? `${data.progress.remainingToday} review(s) remaining`
                    : "Target reached"}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "New introduced", value: `${data.progress.newDone}/${data.progress.newTarget}`, icon: Sparkles },
                { label: "Accuracy", value: `${data.progress.accuracy}%`, icon: CheckCircle2 },
                { label: "Time spent", value: fmtClock(Math.round(data.progress.timeSpentMs / 1000)), icon: Clock },
                { label: "Lapses", value: data.progress.againCount, icon: Ban },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.label} className="rounded-2xl bg-slate-50 p-3.5">
                    <Icon className="mb-1 h-4 w-4 text-slate-400" />
                    <div className="text-xl font-black text-slate-900">{m.value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Portfolio maturity */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Collection maturity
              </span>
              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                {(() => {
                  const total = Math.max(
                    1,
                    data.totals.learning + data.totals.review + data.totals.mature
                  );
                  return (
                    <>
                      <div className="bg-sky-400" style={{ width: `${(data.totals.learning / total) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(data.totals.review / total) * 100}%` }} />
                      <div className="bg-emerald-500" style={{ width: `${(data.totals.mature / total) * 100}%` }} />
                    </>
                  );
                })()}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-sky-400" /> Learning {data.totals.learning}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-amber-400" /> Young {data.totals.review}
                </span>
                <span className="flex items-center gap-1 text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Mature {data.totals.mature}
                </span>
                {data.buckets.suspended > 0 && (
                  <span className="flex items-center gap-1 text-slate-400">
                    <Ban className="h-3 w-3" /> Suspended {data.buckets.suspended}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Streak */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Flame className="h-5 w-5 text-orange-500" />
              <h3 className="text-base font-bold text-slate-900">Streak</h3>
            </div>

            <div className="mt-4 text-center">
              <div className="text-5xl font-black text-slate-900">{data.streak.current}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                day{data.streak.current === 1 ? "" : "s"} in a row
              </div>
              {data.streak.isActiveToday ? (
                <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                  <CheckCircle2 className="h-3 w-3" /> Active today
                </span>
              ) : (
                <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  <Clock className="h-3 w-3" /> Not studied yet today
                </span>
              )}
            </div>

            {/* 21-day activity grid */}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Last 21 days
              </span>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {data.history.slice(-21).map((h) => {
                  const intensity =
                    h.reviews === 0
                      ? "bg-slate-100"
                      : h.targetMet
                      ? "bg-orange-500"
                      : h.reviews / maxHistory > 0.5
                      ? "bg-orange-400"
                      : "bg-orange-300";
                  return (
                    <div
                      key={h.date}
                      title={`${h.date}: ${h.reviews} reviews (${h.accuracy}%)`}
                      className={`aspect-square rounded ${intensity} ${h.reviews > 0 ? "ring-1 ring-orange-200" : ""}`}
                    />
                  );
                })}
              </div>
              <div className="mt-3 space-y-1 text-[10px] text-slate-500">
                <div className="flex justify-between">
                  <span>Longest streak</span>
                  <strong className="text-slate-800">{data.streak.longest} days</strong>
                </div>
                <div className="flex justify-between">
                  <span>Total active days</span>
                  <strong className="text-slate-800">{data.streak.daysActive}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Forecast with load balancing */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <CalendarClock className="h-5 w-5 text-indigo-600" /> {data.settings.forecastDays}-Day Workload Forecast
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500" /> Scheduled
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> After balancing
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-end gap-1 overflow-x-auto pb-2">
            {data.forecast.map((f) => {
              const scheduledH = Math.max(4, (f.count / maxForecast) * 110);
              const balancedH = Math.max(4, (f.balancedCount / maxForecast) * 110);
              return (
                <div key={f.date} className="flex min-w-[42px] flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-700">{f.count}</span>
                  <div className="relative flex w-full items-end justify-center" style={{ height: "112px" }}>
                    {f.balancedCount !== f.count && (
                      <div
                        className="absolute bottom-0 w-6 rounded-t-lg bg-emerald-300/70"
                        style={{ height: `${balancedH}px` }}
                      />
                    )}
                    <div
                      className={`relative w-6 rounded-t-lg ${
                        f.isToday ? "bg-red-500" : "bg-indigo-500"
                      }`}
                      style={{ height: `${scheduledH}px` }}
                    />
                  </div>
                  <span
                    className={`text-[9px] font-bold ${
                      f.isToday ? "text-red-600" : "text-slate-500"
                    }`}
                  >
                    {f.isToday ? "TODAY" : f.weekday}
                  </span>
                  <span className="text-[9px] text-slate-400">{f.label.slice(4)}</span>
                </div>
              );
            })}
          </div>

          {data.recommendation.redistribution && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-900">
              <strong className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> Load balancing suggestion
              </strong>
              <p className="mt-1 text-emerald-800">
                Green bars show a flatter workload. Peak days are reduced by deferring surplus cards
                into nearby lighter days. Session sizing already respects this — due dates are never
                modified automatically.
              </p>
            </div>
          )}
        </div>

        {/* History */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <History className="h-5 w-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-900">Daily History</h3>
            <span className="text-[10px] text-slate-400">
              derived from the review log in your local timezone
            </span>
          </div>

          {data.history.every((h) => h.reviews === 0) ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              <History className="mx-auto mb-2 h-9 w-9 text-slate-300" />
              <p className="text-sm font-bold text-slate-800">No review history yet</p>
              <p className="text-xs text-slate-400">Complete a session to start building your trend.</p>
            </div>
          ) : (
            <div className="mt-4 flex items-end gap-1 overflow-x-auto pb-2">
              {data.history.map((h) => {
                const h2 = Math.max(4, (h.reviews / maxHistory) * 80);
                return (
                  <div key={h.date} className="flex min-w-[30px] flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-600">{h.reviews || ""}</span>
                    <div
                      className={`w-5 rounded-t-lg ${h.targetMet ? "bg-emerald-500" : h.reviews > 0 ? "bg-emerald-300" : "bg-slate-200"}`}
                      style={{ height: `${h2}px` }}
                      title={`${h.date}: ${h.reviews} reviews, ${h.accuracy}% accuracy`}
                    />
                    <span className="text-[8px] text-slate-400">{h.weekday.slice(0, 1)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Target met
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-300" /> Partial
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-200" /> No activity
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
