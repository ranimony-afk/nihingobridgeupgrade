"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Question, JLPTLevel } from "@/types/quiz";
import { QuestionRenderer } from "@/components/quiz/QuestionRenderer";
import {
  Zap,
  Award,
  Layers,
  Settings2,
  Clock,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Loader2,
} from "lucide-react";

function QuickDrillContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Config state
  const [level, setLevel] = useState<JLPTLevel>(
    (searchParams.get("level") as JLPTLevel) || "N5"
  );
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [isInstantFeedback, setIsInstantFeedback] = useState<boolean>(true);

  // Active Drill Session state
  const [isDrillActive, setIsDrillActive] = useState<boolean>(false);
  const [drillQuestions, setDrillQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [drillAnswers, setDrillAnswers] = useState<Record<string, string>>({});
  const [drillStarOrders, setDrillStarOrders] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>("");

  const startDrill = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/jlpt/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizType: "quick_drill",
          jlptLevel: level,
          sectionFilter,
          isTimed: !isInstantFeedback,
          questionLimit: questionCount,
        }),
      });

      const json = await res.json();
      if (json.success && json.questions && json.questions.length > 0) {
        setSessionId(json.sessionId);
        setDrillQuestions(json.questions);
        setCurrentIdx(0);
        setDrillAnswers({});
        setDrillStarOrders({});
        setIsDrillActive(true);
      } else {
        alert("No questions found for the selected drill filters.");
      }
    } catch (e: any) {
      alert("Error starting drill: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = async (selected: string, starOrder?: string[]) => {
    const currentQ = drillQuestions[currentIdx];
    if (!currentQ) return;

    setDrillAnswers((prev) => ({ ...prev, [currentQ.id]: selected }));
    if (starOrder) {
      setDrillStarOrders((prev) => ({ ...prev, [currentQ.id]: starOrder }));
    }

    if (sessionId) {
      try {
        await fetch(`/api/jlpt/session/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: currentQ.id,
            selectedAnswer: selected,
            starOrderSubmitted: starOrder,
          }),
        });
      } catch (e) {
        // quiet background save
      }
    }
  };

  const finishDrill = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const formattedAnswers = drillQuestions.map((q) => ({
        questionId: q.id,
        selectedAnswer: drillAnswers[q.id] || "",
        starOrderSubmitted: drillStarOrders[q.id] || [],
        timeSpentSeconds: 10,
      }));

      await fetch(`/api/jlpt/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: formattedAnswers }),
      });

      router.push(`/jlpt/results/${sessionId}`);
    } catch (e: any) {
      alert("Error grading drill: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold">Generating Personalized Drill...</p>
      </div>
    );
  }

  // Active Drill View
  if (isDrillActive && drillQuestions.length > 0) {
    const currentQ = drillQuestions[currentIdx];
    const isLast = currentIdx === drillQuestions.length - 1;

    return (
      <main className="min-h-screen bg-slate-100/60 pb-20 pt-6">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
          {/* Top Progress bar */}
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 font-bold text-red-700 text-xs">
                {level}
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900">
                  Quick Drill ({currentIdx + 1}/{drillQuestions.length})
                </span>
                <p className="text-[10px] text-slate-500">
                  {isInstantFeedback ? "Instant Explanation Mode" : "Test Mode"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDrillActive(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Exit Drill
              </button>
            </div>
          </div>

          {/* Question Card */}
          <QuestionRenderer
            question={currentQ}
            questionIndex={currentIdx}
            totalQuestions={drillQuestions.length}
            selectedAnswer={drillAnswers[currentQ.id]}
            starOrderSubmitted={drillStarOrders[currentQ.id]}
            showInstantFeedback={isInstantFeedback}
            onAnswerChange={handleAnswerChange}
          />

          {/* Bottom Nav */}
          <div className="flex items-center justify-between rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
              disabled={currentIdx === 0}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30"
            >
              Previous
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={finishDrill}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-6 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-md shadow-red-500/20"
              >
                Finish Drill <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentIdx((prev) => Math.min(drillQuestions.length - 1, prev + 1))}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-6 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Next Problem <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Drill Builder View
  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            <Zap className="h-3.5 w-3.5 fill-current" /> High-Intensity Quick Drill
          </div>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Custom Quiz & Drill Generator
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Configure a rapid drill tailored to your target JLPT level, domain, and time availability.
          </p>
        </div>

        {/* Configuration Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100 space-y-6">
          {/* Level Picker */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Choose JLPT Level
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`rounded-2xl border-2 py-3 text-center transition-all ${
                    level === lvl
                      ? "border-red-600 bg-red-50/60 text-red-900 font-black ring-2 ring-red-400"
                      : "border-slate-200 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100"
                  }`}
                >
                  <span className="text-base">{lvl}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Question Count */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              2. Number of Questions
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`rounded-2xl border-2 py-2.5 text-center text-xs font-bold transition-all ${
                    questionCount === count
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {count} Problems (~{Math.round(count * 1.2)} min)
                </button>
              ))}
            </div>
          </div>

          {/* Section Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              3. Target Domain
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: "all", label: "Mixed (All)" },
                { key: "vocab", label: "Vocabulary & Kanji" },
                { key: "grammar", label: "Grammar & Star ★" },
                { key: "listening", label: "Listening Audio" },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSectionFilter(s.key)}
                  className={`rounded-2xl border-2 p-3 text-left text-xs font-bold transition-all ${
                    sectionFilter === s.key
                      ? "border-indigo-600 bg-indigo-50/60 text-indigo-900 ring-2 ring-indigo-400"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feedback mode */}
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Instant Explanation Mode
              </span>
              <p className="text-[11px] text-slate-500">
                Reveal comprehensive grammar and vocabulary breakdown right after each selection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsInstantFeedback(!isInstantFeedback)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                isInstantFeedback ? "bg-red-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isInstantFeedback ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Launch Button */}
          <button
            type="button"
            onClick={startDrill}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 py-4 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:from-red-500 hover:to-rose-500 active:scale-95 transition-all"
          >
            <Zap className="h-5 w-5 fill-current" />
            Start Instant Drill ({questionCount} Problems)
          </button>
        </div>
      </div>
    </main>
  );
}

export default function QuickDrillPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      }
    >
      <QuickDrillContent />
    </Suspense>
  );
}
