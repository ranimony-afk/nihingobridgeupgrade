"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  XpLedgerEntry,
  XpRuleDescriptor,
  XpSummary,
} from "@/types/gamification";
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Cpu,
  Flame,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Undo2,
  Zap,
} from "lucide-react";

const EVENT_META: Record<string, { label: string; tone: string; icon: typeof Zap }> = {
  "review.graded": { label: "Review", tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  "review.session_completed": { label: "Session", tone: "bg-sky-100 text-sky-700", icon: Award },
  "quiz.answered": { label: "Question", tone: "bg-indigo-100 text-indigo-700", icon: Zap },
  "quiz.test_completed": { label: "Mock exam", tone: "bg-violet-100 text-violet-700", icon: Award },
  "knowledge.card_added": { label: "Knowledge", tone: "bg-amber-100 text-amber-800", icon: Sparkles },
  "streak.day_completed": { label: "Streak", tone: "bg-orange-100 text-orange-700", icon: Flame },
};

export default function ProgressPage() {
  const [summary, setSummary] = useState<XpSummary | null>(null);
  const [rules, setRules] = useState<XpRuleDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/xp?historyDays=14");
      const json = await res.json();
      if (json.success) {
        setSummary(json.summary);
        setRules(json.rules);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !summary) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Tallying your XP ledger…</p>
      </div>
    );
  }

  const lvl = summary.level;
  const maxDaily = Math.max(...summary.daily.map((d) => d.points), 1);

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Phase 12 · Prompt 12.1
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Event-Based XP
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              経験値 — Progress & XP
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Every point is an append-only ledger entry. Totals and levels are derived by summing
              events — never stored as a counter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRules(!showRules)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Cpu className="h-4 w-4 text-violet-600" /> XP Rules ({rules.length})
            </button>
            <button
              onClick={load}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        {/* Level hero */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-100">
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-red-600 to-rose-500 shadow-lg">
                  <span className="text-4xl font-black text-white">{lvl.level}</span>
                  <span className="absolute -bottom-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-slate-900 shadow">
                    LEVEL
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-extrabold text-white">{lvl.title}</h2>
                    <span className="font-japanese text-lg text-amber-300">{lvl.japanese}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    {summary.totalXp.toLocaleString()} XP total
                    {!lvl.isMaxLevel && lvl.xpAtNextLevel !== null && (
                      <>
                        {" · "}
                        {(lvl.xpAtNextLevel - summary.totalXp).toLocaleString()} XP to level{" "}
                        {lvl.level + 1}
                      </>
                    )}
                  </p>
                  <div className="mt-3 w-64 max-w-full">
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all"
                        style={{ width: `${lvl.progressPercent}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                      <span>{lvl.xpIntoLevel.toLocaleString()} XP</span>
                      <span>{lvl.progressPercent}%</span>
                      <span>{lvl.xpForThisLevel.toLocaleString()} XP</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Today", value: summary.todayXp, tone: "text-emerald-300" },
                  { label: "This week", value: summary.weekXp, tone: "text-sky-300" },
                  { label: "Streak", value: `${summary.currentStreakDays}d`, tone: "text-orange-300" },
                ].map((m) => (
                  <div key={m.label} className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                    <div className={`text-2xl font-black ${m.tone}`}>{m.value}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Daily trend */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                14-day XP trend
              </span>
              <span className="text-[10px] text-slate-400">
                {summary.totalEvents} events
                {summary.revokedEvents > 0 && ` · ${summary.revokedEvents} revoked`}
              </span>
            </div>
            <div className="mt-3 flex items-end gap-1.5">
              {summary.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-700">{d.points || ""}</span>
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      d.points > 0 ? "bg-gradient-to-t from-red-500 to-amber-400" : "bg-slate-200"
                    }`}
                    style={{ height: `${Math.max(4, (d.points / maxDaily) * 80)}px` }}
                    title={`${d.date}: ${d.points} XP from ${d.events} event(s)`}
                  />
                  <span className="text-[8px] text-slate-400">{d.weekday.slice(0, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rules panel */}
        {showRules && (
          <div className="rounded-3xl border-2 border-violet-200 bg-white p-6 shadow-lg shadow-violet-100/50">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Cpu className="h-5 w-5 text-violet-600" />
              <h3 className="text-base font-bold text-slate-900">Registered XP Rules</h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {rules.length} loaded
              </span>
              <span className="text-[10px] text-slate-400">
                scoring lives in versioned code, not the database
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {rules.map((r) => (
                <div key={r.key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-violet-100 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-700">
                        {r.key}
                      </span>
                      <strong className="text-sm text-slate-900">{r.name}</strong>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">v{r.version}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{r.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
                      {r.eventType}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                      base {r.basePoints} XP
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">
                      {r.dailyCap > 0 ? `cap ${r.dailyCap}/day` : "uncapped"}
                    </span>
                  </div>
                  {r.examples.length > 0 && (
                    <div className="mt-2.5 border-t border-slate-100 pt-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Pays
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.examples.map((ex) => (
                          <span
                            key={ex.label}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 ring-1 ring-emerald-100"
                          >
                            {ex.label}: {ex.points} XP
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Source breakdown */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Where XP came from</h3>
            </div>
            {summary.bySource.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No XP yet — review a card or take a quiz.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {summary.bySource.map((s) => {
                  const meta = EVENT_META[s.eventType] ?? {
                    label: s.eventType,
                    tone: "bg-slate-100 text-slate-700",
                    icon: Zap,
                  };
                  const Icon = meta.icon;
                  return (
                    <div key={s.ruleKey} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                        </div>
                        <span className="text-xs font-black text-slate-900">
                          {s.points.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-sky-400"
                          style={{ width: `${s.percentOfTotal}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                        <span>{s.events} event(s)</span>
                        <span>{s.percentOfTotal}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ledger */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-slate-600" />
                <h3 className="text-base font-bold text-slate-900">XP Ledger</h3>
                <span className="text-[10px] text-slate-400">
                  append-only · every award shows its scoring breakdown
                </span>
              </div>
            </div>

            {summary.recent.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                <Zap className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                <p className="text-sm font-bold text-slate-800">No XP events yet</p>
                <p className="text-xs text-slate-400">
                  Grade a card in{" "}
                  <Link href="/review/today" className="font-bold text-red-600 hover:underline">
                    Today&apos;s queue
                  </Link>{" "}
                  to start earning.
                </p>
              </div>
            ) : (
              <div className="mt-3 max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
                {summary.recent.map((e: XpLedgerEntry) => {
                  const meta = EVENT_META[e.eventType] ?? {
                    label: e.eventType,
                    tone: "bg-slate-100 text-slate-700",
                    icon: Zap,
                  };
                  const revoked = Boolean(e.revokedAt);
                  return (
                    <div
                      key={e.id}
                      className={`rounded-xl border p-3 ${
                        revoked
                          ? "border-slate-200 bg-slate-50 opacity-60"
                          : "border-slate-100 bg-slate-50/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${meta.tone}`}>
                            {meta.label}
                          </span>
                          <span className="font-mono text-[9px] text-slate-400">
                            {e.ruleKey}@v{e.ruleVersion}
                          </span>
                          {revoked && (
                            <span className="flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                              <Undo2 className="h-2.5 w-2.5" /> revoked
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-black ${
                              revoked ? "text-slate-400 line-through" : "text-emerald-600"
                            }`}
                          >
                            +{e.points}
                          </span>
                          <span className="text-[9px] text-slate-400">
                            {new Date(e.occurredAt).toLocaleTimeString("en-US", { hour12: false })}
                          </span>
                        </div>
                      </div>

                      {e.breakdown.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {e.breakdown.map((b, i) => (
                            <span
                              key={i}
                              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                b.kind === "base"
                                  ? "bg-white text-slate-700 ring-1 ring-slate-200"
                                  : b.kind === "bonus"
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                  : b.kind === "multiplier"
                                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                              }`}
                            >
                              {b.label}
                              {b.kind === "multiplier" ? ` ×${b.value}` : ` ${b.value > 0 ? "+" : ""}${b.value}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Daily caps */}
        {summary.capUsage.length > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Calendar className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900">Daily XP caps</h3>
              <span className="text-[10px] text-slate-400">
                caps keep grinding from dominating genuine study
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.capUsage.map((c) => {
                const pct = c.dailyCap > 0 ? (c.usedToday / c.dailyCap) * 100 : 0;
                return (
                  <div key={c.ruleKey} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{c.name}</span>
                      {c.isCapped && (
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">
                          capped
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full ${c.isCapped ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                      <span>
                        {c.usedToday} / {c.dailyCap} XP
                      </span>
                      <span>{c.remaining} left</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Link
            href="/review/today"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <TrendingUp className="h-3.5 w-3.5" /> Earn XP in today&apos;s queue
          </Link>
        </div>
      </div>
    </main>
  );
}
