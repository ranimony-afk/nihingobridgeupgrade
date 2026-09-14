"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Award,
  Zap,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Flame,
  Layers,
  RotateCcw,
} from "lucide-react";

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await fetch("/api/quiz/analytics");
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      } catch (e) {
        console.error("Failed to load analytics:", e);
      } finally {
        setLoading(false);
      }
    }

    loadAnalytics();
  }, []);

  const analytics = data?.analytics || {
    testsCompleted: 1,
    drillsCompleted: 3,
    totalQuestionsAnswered: 24,
    totalCorrectAnswers: 20,
    averageScorePercent: 83.3,
    streakDays: 4,
    weakGrammarPoints: ["Sentence Composition ★", "Particle で vs に"],
  };

  const recentSessions = data?.recentSessions || [];

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Diagnostic Dashboard
              </span>
              <span className="text-xs font-semibold text-slate-500">
                JLPT N5 Proficiency Tracker
              </span>
            </div>
            <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Learning Analytics & Test Performance
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/jlpt/test/jlpt-n5-mock-01"
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 transition-colors"
            >
              <Award className="h-4 w-4" /> Take N5 Mock Exam
            </Link>
          </div>
        </div>

        {/* 4 Stat Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Exam Accuracy</span>
              <Award className="h-5 w-5 text-red-600" />
            </div>
            <div className="text-3xl font-black text-slate-900">
              {analytics.averageScorePercent || 80}%
            </div>
            <p className="mt-1 text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Above Passing Threshold
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Completed Tests</span>
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="text-3xl font-black text-slate-900">
              {analytics.testsCompleted + (analytics.drillsCompleted || 0)}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.testsCompleted} Mocks • {analytics.drillsCompleted || 0} Drills
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Problems Solved</span>
              <Zap className="h-5 w-5 text-amber-500" />
            </div>
            <div className="text-3xl font-black text-slate-900">
              {analytics.totalQuestionsAnswered || 24}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {analytics.totalCorrectAnswers || 20} correct responses
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider">Study Streak</span>
              <Flame className="h-5 w-5 text-orange-500" />
            </div>
            <div className="text-3xl font-black text-slate-900">
              {analytics.streakDays || 1} Days
            </div>
            <p className="mt-1 text-xs text-orange-600 font-semibold">Active Streak 🔥</p>
          </div>
        </div>

        {/* Two Column Section: Category Mastery + Diagnostic Action Plan */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Recent Exam Sessions */}
          <div className="lg:col-span-7 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-600" />
                Recent Test & Drill Sessions
              </h3>
            </div>

            {recentSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                <Award className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-800">No mock tests completed yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Take the official N5 sample test to generate comprehensive diagnostics.
                </p>
                <Link
                  href="/jlpt/test/jlpt-n5-mock-01"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  Start N5 Mock Exam
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentSessions.map((s: any) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          {s.jlptLevel}
                        </span>
                        <span className="text-xs font-bold text-slate-900 capitalize">
                          {s.quizType.replace(/_/g, " ")}
                        </span>
                        {s.passed !== null && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              s.passed
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {s.passed ? "Passed" : "Failed"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {new Date(s.startedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {s.score !== null && (
                        <div className="text-right">
                          <span className="text-base font-extrabold text-slate-900">
                            {s.score} <span className="text-xs text-slate-500">/ {s.maxScore}</span>
                          </span>
                        </div>
                      )}

                      <Link
                        href={`/jlpt/results/${s.id}`}
                        className="flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 shadow-xs"
                      >
                        Scorecard <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diagnostic Action Plan */}
          <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
              <Sparkles className="h-5 w-5 text-red-600" />
              <h3 className="text-base font-bold text-slate-900">Recommended Study Priorities</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-center gap-2 font-bold text-rose-900 mb-1">
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  <span>Sentence Composition (★)</span>
                </div>
                <p className="text-slate-700">
                  Focus on noun modification clauses and particle pairs (〜と いっしょに) to
                  consistently score full points on Star questions.
                </p>
                <Link
                  href="/question-bank?category=sentence_order"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-900"
                >
                  Drill Star Problems <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center gap-2 font-bold text-amber-900 mb-1">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                  <span>Particle Precision (で vs に vs を)</span>
                </div>
                <p className="text-slate-700">
                  Review location of action (で) vs direction of movement (へ/に) in short sentence
                  contexts.
                </p>
                <Link
                  href="/question-bank?category=grammar_form"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-950"
                >
                  Drill Particle Problems <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
