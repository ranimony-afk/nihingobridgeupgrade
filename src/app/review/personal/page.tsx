"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CardLifecycleTrace,
  LifecycleRunResult,
  PersonalCardStat,
  PersonalizationPrefs,
  PersonalizedResponse,
} from "@/types/srs";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

const STAGE_ORDER = ["created", "new", "due", "reviewed", "rated", "rescheduled", "next-due"] as const;

const RATING_COLORS: Record<string, string> = {
  again: "bg-rose-100 text-rose-700",
  hard: "bg-amber-100 text-amber-800",
  good: "bg-emerald-100 text-emerald-700",
  easy: "bg-sky-100 text-sky-700",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function PersonalizedPage() {
  const router = useRouter();

  const [data, setData] = useState<PersonalizedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<PersonalizationPrefs | null>(null);

  // Lifecycle tracer
  const [trace, setTrace] = useState<CardLifecycleTrace | null>(null);
  const [traceCardId, setTraceCardId] = useState<string>("");
  const [gateRun, setGateRun] = useState<LifecycleRunResult | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/srs/personal?trailingDays=21");
      const json = await res.json();
      if (json.success) {
        setData(json);
        setDraft(json.prefs);
      }
    } catch (e) {
      console.error("Failed to load personalization:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePrefs = async () => {
    if (!draft) return;
    setBusy("prefs");
    setNotice(null);
    try {
      const res = await fetch("/api/srs/personal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (json.success) {
        setNotice("Preferences saved — plan recalculated.");
        await load();
      } else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  const startPersonalized = async () => {
    setBusy("start");
    try {
      const res = await fetch("/api/srs/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) router.push(`/review/session/${json.sessionId}`);
      else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  const runTrace = async (cardId: string) => {
    if (!cardId) return;
    setBusy("trace");
    try {
      const res = await fetch(`/api/srs/personal/lifecycle?cardId=${cardId}`);
      const json = await res.json();
      if (json.success) setTrace(json.trace);
      else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  const runGate = async (rating?: string) => {
    setBusy("gate");
    setNotice(null);
    try {
      const res = await fetch("/api/srs/personal/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating ?? "good" }),
      });
      const json = await res.json();
      if (json.success) {
        setGateRun(json.run);
        setTraceCardId(json.run.cardId);
        await load();
      } else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  if (loading || !data || !draft) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Building your learner profile…</p>
      </div>
    );
  }

  const p = data.profile;
  const plan = data.plan;
  const adj = plan.targetAdjustment;

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Phase 11 · Prompt 11.5
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Personalized Review
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              個人最適化 — Personalized Review
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Personalization shapes <strong>selection and budgets</strong>. Due dates stay owned by
              the registered scheduler.
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
              onClick={load}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5 text-xs font-semibold text-sky-900">
            {notice}
          </div>
        )}

        {/* Plan hero */}
        <div className="rounded-3xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-white p-6 shadow-lg shadow-indigo-100/50">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{plan.headline}</h2>
                <ul className="mt-2 max-w-2xl space-y-1">
                  {plan.rationale.map((r, i) => (
                    <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-3xl font-black text-slate-900">{plan.suggested.sessionSize}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                cards suggested
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {plan.suggested.reviewLimit} review + {plan.suggested.newLimit} new · ~
                {plan.suggested.estimatedMinutes} min
              </div>
              <button
                onClick={startPersonalized}
                disabled={busy !== null || plan.suggested.sessionSize === 0}
                className="mt-3 flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 disabled:opacity-40"
              >
                {busy === "start" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
                Start Personalized Session
              </button>
            </div>
          </div>

          {/* Target adjustment */}
          {adj && (
            <div
              className={`mt-5 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 ${
                adj.direction === "up"
                  ? "border-emerald-200 bg-emerald-50/60"
                  : adj.direction === "down"
                  ? "border-amber-200 bg-amber-50/60"
                  : "border-slate-200 bg-slate-50/60"
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm">
                {adj.direction === "up" ? (
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                ) : adj.direction === "down" ? (
                  <TrendingDown className="h-4 w-4 text-amber-600" />
                ) : (
                  <Gauge className="h-4 w-4 text-slate-500" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  New-card target: {adj.currentNewTarget} → {adj.suggestedNewTarget}/day
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      adj.direction === "up"
                        ? "bg-emerald-600 text-white"
                        : adj.direction === "down"
                        ? "bg-amber-500 text-white"
                        : "bg-slate-300 text-slate-700"
                    }`}
                  >
                    {adj.direction}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600">{adj.reason}</p>
              </div>
            </div>
          )}
        </div>

        {/* Profile metrics */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: "Cards tracked", value: p.cardsTracked, icon: Layers, tone: "text-slate-600 bg-slate-100" },
            { label: "Accuracy", value: `${p.totals.accuracy}%`, icon: Target, tone: "text-indigo-600 bg-indigo-50" },
            { label: "Retention", value: `${p.retention.percent}%`, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
            { label: "Reviews/day", value: p.velocity.reviewsPerDay, icon: Activity, tone: "text-sky-600 bg-sky-50" },
            { label: "Lapses", value: p.totals.lapses, icon: AlertTriangle, tone: "text-amber-600 bg-amber-50" },
            { label: "Strain", value: p.strainIndex, icon: Flame, tone: "text-rose-600 bg-rose-50" },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${m.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-2xl font-black text-slate-900">{m.value}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Weak areas */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900">Weak Areas</h3>
            </div>
            {plan.focusAreas.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                Not enough review history yet. Answer more cards to reveal weak areas.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {plan.focusAreas.map((a) => (
                  <div key={a.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-slate-900">{a.label}</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                        {pct(a.accuracy)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-amber-400"
                        style={{ width: `${a.weakness * 100}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                      <span>weakness {pct(a.weakness)}</span>
                      <span>{a.attempts} attempts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weak cards */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900">Priority Cards</h3>
                <span className="text-[10px] text-slate-400">click to trace its lifecycle</span>
              </div>
            </div>

            {p.weakCards.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                No reviewed cards yet.
              </p>
            ) : (
              <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {p.weakCards.map((c: PersonalCardStat) => (
                  <button
                    key={c.cardId}
                    onClick={() => {
                      setTraceCardId(c.cardId);
                      runTrace(c.cardId);
                    }}
                    disabled={busy !== null}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                      traceCardId === c.cardId
                        ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200"
                        : "border-slate-100 bg-slate-50/50 hover:bg-white"
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-7 w-9 items-center justify-center rounded-lg text-[10px] font-black ${
                          c.weakness > 0.6
                            ? "bg-rose-500 text-white"
                            : c.weakness > 0.35
                            ? "bg-amber-400 text-white"
                            : "bg-slate-300 text-slate-700"
                        }`}
                      >
                        {pct(c.weakness)}
                      </span>
                      <div>
                        <span className="font-japanese text-sm font-bold text-slate-900">{c.front}</span>
                        <div className="text-[10px] text-slate-500">
                          {c.attempts} attempt(s) · {pct(c.rawAccuracy)} raw · {c.lapses} lapse(s)
                          {c.daysSinceReview !== null && ` · ${c.daysSinceReview}d ago`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.lastRating && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${RATING_COLORS[c.lastRating]}`}>
                          {c.lastRating}
                        </span>
                      )}
                      {c.trend !== null && c.trend < -0.15 && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                          ↓ declining
                        </span>
                      )}
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
                        {c.cardType}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preferences */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Personalization Weights</h3>
              <span className="text-[10px] text-slate-400">
                stored user intent — all signals stay derived from the review log
              </span>
            </div>
            <button
              onClick={savePrefs}
              disabled={busy !== null}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === "prefs" ? "Saving…" : "Save & Recalculate"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {(
              [
                ["weaknessWeight", "Weakness", "How strongly low personal accuracy pulls a card forward."],
                ["urgencyWeight", "Urgency", "How strongly overdue-ness influences ordering."],
                ["difficultyWeight", "Difficulty", "Scheduler-reported easiness as a secondary signal."],
              ] as const
            ).map(([key, label, desc]) => (
              <div key={key}>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {label}
                  </label>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                    {draft[key].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: parseFloat(e.target.value) })}
                  className="mt-2 w-full accent-indigo-600"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            {(
              [
                ["preferWeakAreas", "Prioritize weak areas", "Guarantee capacity for statistically weak material."],
                ["weakFirst", "Weak cards first", "Place established weak cards at the very front."],
                ["autoAdaptTargets", "Adapt daily targets", "Suggest raising/lowering new-card load from performance."],
              ] as const
            ).map(([key, label, desc]) => (
              <button
                key={key}
                onClick={() => setDraft({ ...draft, [key]: !draft[key] })}
                className={`rounded-2xl border-2 p-3 text-left transition-all ${
                  draft[key]
                    ? "border-emerald-300 bg-emerald-50/60"
                    : "border-slate-200 bg-slate-50 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{label}</span>
                  <span
                    className={`flex h-4 w-7 items-center rounded-full transition-colors ${
                      draft[key] ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`ml-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                        draft[key] ? "translate-x-3" : ""
                      }`}
                    />
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Lifecycle gate */}
        <div className="rounded-3xl border-2 border-emerald-200 bg-white p-6 shadow-lg shadow-emerald-100/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Lifecycle Gate</h3>
                <p className="text-[11px] text-slate-500">
                  new card → due → review → rating → reschedule → next due
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {(["good", "easy", "hard", "again"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => runGate(r)}
                  disabled={busy !== null}
                  className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                    r === "good"
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : r === "easy"
                      ? "bg-sky-600 text-white hover:bg-sky-500"
                      : r === "hard"
                      ? "bg-amber-500 text-white hover:bg-amber-400"
                      : "bg-rose-600 text-white hover:bg-rose-500"
                  }`}
                >
                  Run gate · {r}
                </button>
              ))}
            </div>
          </div>

          {busy === "gate" && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-xs font-semibold text-slate-600">
                Running the full lifecycle on a real untouched card…
              </span>
            </div>
          )}

          {gateRun && (
            <div className="mt-4">
              {/* Verdict matrix */}
              <div
                className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 p-4 ${
                  gateRun.verified.allPassed
                    ? "border-emerald-400 bg-emerald-50/70"
                    : "border-rose-400 bg-rose-50/70"
                }`}
              >
                {gateRun.verified.allPassed ? (
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                ) : (
                  <XCircle className="h-7 w-7 text-rose-600" />
                )}
                <div>
                  <div className="text-sm font-black text-slate-900">
                    {gateRun.verified.allPassed ? "GATE PASSED" : "GATE FAILED"}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Card <strong className="font-japanese">{gateRun.front}</strong> scheduled by{" "}
                    <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {gateRun.schedulerKey}@{gateRun.schedulerVersion}
                    </code>
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {(
                    [
                      ["wasNew", "new card"],
                      ["becameDue", "due"],
                      ["wasServedInSession", "review"],
                      ["ratingAccepted", "rating"],
                      ["rescheduledByScheduler", "reschedule"],
                      ["nextDueAdvanced", "next due"],
                      ["leftQueueAfterReview", "left queue"],
                    ] as const
                  ).map(([key, label]) => (
                    <span
                      key={key}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                        gateRun.verified[key]
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      {gateRun.verified[key] ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Step trail */}
              <div className="mt-4 space-y-2">
                {gateRun.steps.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                        {i + 1}
                      </div>
                      {i < gateRun.steps.length - 1 && <div className="my-1 w-px flex-1 bg-slate-200" />}
                    </div>
                    <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{s.label}</span>
                        <span className="rounded bg-white px-1.5 py-0.5 font-japanese text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                          {STAGE_ORDER.includes(s.stage as never)
                            ? s.stage
                            : s.stage}
                        </span>
                        {s.rating && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${RATING_COLORS[s.rating]}`}>
                            {s.rating}
                          </span>
                        )}
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                          → {s.intervalLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Single-card lifecycle trace */}
        {trace && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Lifecycle trace — <span className="font-japanese">{trace.front}</span>
                </h3>
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[9px] text-white">
                  {trace.schedulerKey}@{trace.schedulerVersion}
                </span>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                  trace.inQueueNow ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                }`}
              >
                {trace.inQueueNow ? "in queue now" : "not due"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Timeline */}
              <div className="lg:col-span-2">
                <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
                  {[...trace.timeline].reverse().map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-2.5 ${
                        s.stage === "rescheduled"
                          ? "border-indigo-200 bg-indigo-50/50"
                          : s.stage === "rated"
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-slate-100 bg-slate-50/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-900">{s.label}</span>
                        <span className="font-japanese text-[10px] text-slate-500">{s.japanese}</span>
                        {s.rating && (
                          <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${RATING_COLORS[s.rating]}`}>
                            {s.rating}
                          </span>
                        )}
                        {s.intervalDays !== undefined && (
                          <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] text-indigo-700 ring-1 ring-slate-200">
                            {s.intervalDays.toFixed(2)}d
                          </span>
                        )}
                        {s.at && (
                          <span className="ml-auto text-[9px] text-slate-400">
                            {new Date(s.at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-slate-600">{s.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rating futures + state */}
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-900 p-4">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    What each rating does now
                  </div>
                  <div className="space-y-1.5">
                    {trace.ratingFutures.map((f) => (
                      <div key={f.rating} className="flex items-center justify-between gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${RATING_COLORS[f.rating]}`}>
                          {f.rating}
                        </span>
                        <span className="font-mono text-[10px] text-emerald-300">{f.intervalLabel}</span>
                        <span className="font-mono text-[9px] text-slate-500">{f.phase}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Scheduler state
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    {[
                      ["totalReviews", trace.currentState.totalReviews],
                      ["correct", trace.currentState.correctReviews],
                      ["lapses", trace.currentState.lapses],
                      ["reps", trace.currentState.repetitions],
                      ["interval", `${trace.currentState.intervalDays.toFixed(2)}d`],
                      ["ease", trace.currentState.easeFactor.toFixed(2)],
                      ["box", trace.currentState.box],
                      ["stability", `${trace.currentState.stabilityDays.toFixed(2)}d`],
                      ["difficulty", trace.currentState.difficulty.toFixed(1)],
                      ["phase", trace.currentState.phase],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between">
                        <span className="text-slate-500">{k}</span>
                        <strong className="font-mono text-slate-800">{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {trace.personalStat && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      Personal weakness
                    </div>
                    <div className="text-2xl font-black text-amber-900">
                      {pct(trace.personalStat.weakness)}
                    </div>
                    <p className="mt-1 text-[10px] text-amber-800">
                      {trace.personalStat.attempts} attempt(s) · {pct(trace.personalStat.rawAccuracy)} raw
                      accuracy · {trace.personalStat.lapses} lapse(s)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/review/today"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            View today&apos;s due queue <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </main>
  );
}
