import Link from "next/link";
import { db } from "@/db";
import { questions as questionsTable, jlptTests as jlptTestsTable } from "@/db/schema";
import { sql } from "drizzle-orm";
import { TestService } from "@/services/jlpt/testService";
import {
  Award,
  Zap,
  BookOpen,
  BarChart3,
  CheckCircle2,
  Clock,
  Volume2,
  Star,
  Layers,
  ArrowRight,
  ShieldCheck,
  Flame,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await TestService.ensureSeeded();

  const tests = await TestService.listTests();
  const [qCountRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(questionsTable);
  const totalQuestions = qCountRow?.count ?? 0;

  return (
    <main className="min-h-screen bg-slate-50/50 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-4 pt-16 pb-20 text-white sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(220,38,38,0.25),rgba(255,255,255,0))] pointer-events-none" />

        <div className="relative mx-auto max-w-7xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1 text-xs font-semibold text-red-300 backdrop-blur">
            <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            Phase 10 — JLPT & Question Engine Ready
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl font-japanese">
                日本語能力試験
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-300 text-3xl sm:text-4xl lg:text-5xl mt-2 font-sans font-bold">
                  JLPT N5 Full Exam Simulator & Quiz Core
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
                Experience authentic JLPT mock examinations with all 14 official Mondai question
                formats, live countdown timers, star composition (★), audio listening dialogues, and
                instant deep diagnostics.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/jlpt/test/jlpt-n5-mock-01"
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:from-red-500 hover:to-rose-500 active:scale-95 transition-all"
                >
                  <Award className="h-5 w-5" />
                  Take Full N5 Mock Exam (90 min)
                </Link>

                <Link
                  href="/quiz/drill"
                  className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 active:scale-95 transition-all"
                >
                  <Zap className="h-4 w-4 text-amber-400" />
                  Quick 10-Q Drill
                </Link>

                <Link
                  href="/question-bank"
                  className="flex items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 px-5 py-3.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all"
                >
                  <BookOpen className="h-4 w-4 text-indigo-400" />
                  Question Bank ({totalQuestions})
                </Link>
              </div>

              {/* Badges / Guarantees */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>14 Official Mondai</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Scaled JLPT Scoring</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>N5 to N1 Ready</span>
                </div>
              </div>
            </div>

            {/* Right Card: Exam Launch Showcase */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 rounded-full bg-red-500 animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                      Standard Exam Preset
                    </span>
                  </div>
                  <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-400">
                    JLPT N5
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <h3 className="text-xl font-bold text-white">
                    JLPT N5 Official Sample Mock Exam 1
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Complete Japanese Foundation test evaluating Kanji, Vocabulary, Grammar, Star
                    Scrambles, Reading comprehension passages, and Audio Listening.
                  </p>

                  <div className="rounded-2xl bg-slate-950/80 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-amber-400" /> Time Limit:
                      </span>
                      <strong className="text-white">90 Minutes (Sectional)</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Passing Threshold:
                      </span>
                      <strong className="text-emerald-400">80 / 180 pts (≥38 Lang, ≥19 List)</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Layers className="h-3.5 w-3.5 text-indigo-400" /> Question Formats:
                      </span>
                      <strong className="text-indigo-300">Multiple Choice, Star ★, Audio</strong>
                    </div>
                  </div>

                  <Link
                    href="/jlpt/test/jlpt-n5-mock-01"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-500 transition-all shadow-md shadow-red-600/30"
                  >
                    Launch Exam Session <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        {/* Core Pillars / Engine Capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100/50 hover:shadow-xl transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-3 font-bold">
              <Award className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">JLPT Test Simulator</h3>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">
              Official section breaks, countdown timer, question matrix, and auto-submit.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100/50 hover:shadow-xl transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 mb-3 font-bold">
              <Star className="h-5 w-5 fill-indigo-100" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Star Ordering (★) Engine</h3>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">
              Drag or click 4 clause fragments into slots to solve JLPT star composition.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100/50 hover:shadow-xl transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-3 font-bold">
              <Volume2 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Listening Audio Player</h3>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">
              Interactive Japanese voice playback, tempo adjustment (0.8x-1.2x), and scripts.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100/50 hover:shadow-xl transition-shadow">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-3 font-bold">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Deep Results Analytics</h3>
            <p className="mt-1 text-xs text-slate-700 leading-relaxed">
              Scaled 0–180 score, official A/B/C skill ratings, and mistake notebook.
            </p>
          </div>
        </div>

        {/* Section 2: Available Exam Presets */}
        <div className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Available JLPT Exams & Presets
              </h2>
              <p className="text-xs text-slate-700 mt-1">
                Choose a timed mock examination or targeted skill sprint
              </p>
            </div>
            <Link
              href="/quiz/drill"
              className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700"
            >
              Build Custom Drill <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tests.map((test) => {
              const isN5 = test.jlptLevel === "N5";
              const isN4 = test.jlptLevel === "N4";

              return (
                <div
                  key={test.id}
                  className="flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                          isN5
                            ? "bg-red-100 text-red-700"
                            : isN4
                            ? "bg-blue-100 text-blue-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {test.jlptLevel} Exam
                      </span>
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {test.totalDurationMinutes} min
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 leading-snug">
                      {test.title}
                    </h3>
                    <p className="mt-2 text-xs text-slate-700 leading-relaxed line-clamp-3">
                      {test.description}
                    </p>

                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs space-y-1.5 border border-slate-100">
                      <div className="flex justify-between text-slate-700">
                        <span>Max Score:</span>
                        <strong className="text-slate-900">{test.totalScore} pts</strong>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Passing Threshold:</span>
                        <strong className="text-emerald-600">{test.passingScore} pts</strong>
                      </div>
                      <div className="flex justify-between text-slate-700">
                        <span>Questions Included:</span>
                        <strong className="text-slate-900">{test.questionCount || "Full"} Qs</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                    <Link
                      href={`/jlpt/test/${test.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-xs"
                    >
                      Take Test <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/jlpt/test/${test.id}?mode=practice`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                      title="Untimed practice mode with immediate explanations"
                    >
                      Practice
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Architecture Extensibility Showcase */}
        <div className="mt-12 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 p-6 md:p-8 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Universal Architecture
                </span>
              </div>
              <h3 className="mt-1 text-xl md:text-2xl font-bold tracking-tight">
                Designed for JLPT N5 → N1 Without Redesign
              </h3>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              Zero Breaking Changes Needed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center">
            {[
              { lvl: "N5", label: "Foundation", q: "14 Mondai Formats", status: "Active & Seeded", active: true },
              { lvl: "N4", label: "Elementary", q: "Grammar & Modifiers", status: "Active in Engine", active: true },
              { lvl: "N3", label: "Intermediate", q: "Bridge Articles", status: "Active in Engine", active: true },
              { lvl: "N2", label: "Pre-Advanced", q: "Business & Nuance", status: "Schema Ready", active: false },
              { lvl: "N1", label: "Advanced", q: "Academic & Abstract", status: "Schema Ready", active: false },
            ].map((item) => (
              <div
                key={item.lvl}
                className={`rounded-2xl border p-4 transition-all ${
                  item.active
                    ? "border-red-500/40 bg-red-950/20 shadow-md ring-1 ring-red-500/20"
                    : "border-slate-800 bg-slate-900/50 opacity-70"
                }`}
              >
                <span className="text-2xl font-black text-white">{item.lvl}</span>
                <p className="text-xs font-bold text-slate-300 mt-0.5">{item.label}</p>
                <p className="text-[11px] text-slate-400 mt-1">{item.q}</p>
                <span className="mt-3 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
