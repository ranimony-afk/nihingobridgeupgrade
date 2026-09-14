"use client";

import { useState } from "react";
import { QuestionEvaluationResult, JLPTLevel } from "@/types/quiz";
import {
  CheckCircle2,
  XCircle,
  Bookmark,
  Clock,
  Lightbulb,
  ArrowRight,
  BookOpen,
  RotateCcw,
  Star,
} from "lucide-react";
import Link from "next/link";
import { ListeningAudioPlayer } from "../quiz/ListeningAudioPlayer";

interface MistakeNotebookProps {
  evaluations: QuestionEvaluationResult[];
  jlptLevel: JLPTLevel;
}

export function MistakeNotebook({ evaluations, jlptLevel }: MistakeNotebookProps) {
  const [filter, setFilter] = useState<"all" | "incorrect" | "flagged">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const wrongCount = evaluations.filter((e) => !e.isCorrect).length;
  const flaggedCount = evaluations.filter((e) => e.isFlagged).length;

  const filteredEvals = evaluations.filter((e) => {
    if (filter === "incorrect") return !e.isCorrect;
    if (filter === "flagged") return e.isFlagged;
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
      {/* Header & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-red-600" />
            Detailed Review & Mistake Notebook
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Step-by-step diagnostic breakdown of each question
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({evaluations.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("incorrect")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === "incorrect"
                  ? "bg-rose-500 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Mistakes ({wrongCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("flagged")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === "flagged"
                  ? "bg-amber-400 text-amber-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Flagged ({flaggedCount})
            </button>
          </div>

          {/* Drill Mistakes CTA */}
          {wrongCount > 0 && (
            <Link
              href={`/quiz/drill?level=${jlptLevel}&mistakesOnly=true`}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Drill Mistakes ({wrongCount})
            </Link>
          )}
        </div>
      </div>

      {/* List of Questions */}
      {filteredEvals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-2" />
          <p className="font-bold text-sm text-slate-800">No questions in this filter</p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === "incorrect"
              ? "Flawless score! You got every question correct."
              : "No questions were flagged during this session."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvals.map((item, idx) => {
            const q = item.question;
            const isExpanded = expandedId === q.id || filteredEvals.length <= 3;
            const correctOpt = q.options.find((o) => o.id === q.correctAnswer);
            const userOpt = q.options.find((o) => o.id === item.selectedAnswer);

            return (
              <div
                key={q.id}
                className={`rounded-2xl border-2 transition-all ${
                  item.isCorrect
                    ? "border-slate-100 bg-white"
                    : "border-rose-100 bg-rose-50/20"
                }`}
              >
                {/* Collapsible Header Row */}
                <div
                  onClick={() => toggleExpand(q.id)}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-xs ${
                        item.isCorrect
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {item.isCorrect ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Question {idx + 1}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {q.category}
                        </span>
                        {item.isFlagged && (
                          <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Bookmark className="h-2.5 w-2.5 fill-current" /> Flagged
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-bold font-japanese text-slate-900">
                        {q.prompt}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {item.timeSpentSeconds}s
                    </span>
                    <span className="font-bold text-indigo-600 hover:text-indigo-800">
                      {isExpanded ? "Collapse ▲" : "View Explanation ▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded Detailed Breakdown */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-5 space-y-4 rounded-b-2xl">
                    {/* Listening Audio if audio question */}
                    {q.section === "listening" && (
                      <ListeningAudioPlayer
                        audioScript={q.audioScript}
                        audioUrl={q.audioUrl}
                        prompt={q.prompt}
                      />
                    )}

                    {/* Reading passage if reading question */}
                    {q.passage && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs font-japanese leading-relaxed text-slate-900">
                        <div className="font-bold text-amber-900 mb-1">本文 (Passage):</div>
                        {q.passage}
                      </div>
                    )}

                    {/* Answer Comparison */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        className={`rounded-xl border p-3.5 ${
                          item.isCorrect
                            ? "border-emerald-200 bg-emerald-50/60 text-emerald-950"
                            : "border-rose-200 bg-rose-50/60 text-rose-950"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider block">
                          Your Answer:
                        </span>
                        <div className="mt-1 text-sm font-bold font-japanese">
                          {userOpt ? `[${userOpt.id}] ${userOpt.text}` : "No answer selected"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-emerald-950">
                        <span className="text-[10px] font-bold uppercase tracking-wider block">
                          Correct Answer:
                        </span>
                        <div className="mt-1 text-sm font-bold font-japanese">
                          [{q.correctAnswer}] {correctOpt?.text}
                        </div>
                      </div>
                    </div>

                    {/* Star Order Solution if star question */}
                    {q.questionType === "star_order" && q.starOrderParts && (
                      <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3.5 text-xs text-indigo-950">
                        <span className="font-bold flex items-center gap-1 mb-1">
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                          Correct Order Structure:
                        </span>
                        <div className="flex flex-wrap items-center gap-1 font-japanese font-bold text-sm">
                          {q.starOrderParts.correctOrder.map((partId, pIdx) => {
                            const pObj = q.starOrderParts?.parts.find((p) => p.id === partId);
                            const isStar = pIdx + 1 === q.starOrderParts?.starPosition;
                            return (
                              <span
                                key={pIdx}
                                className={`px-2 py-1 rounded-lg ${
                                  isStar
                                    ? "bg-amber-300 text-amber-950 ring-2 ring-amber-400"
                                    : "bg-white border border-indigo-200 text-indigo-900"
                                }`}
                              >
                                {pObj?.text} {isStar && "★"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Full Explanation */}
                    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 uppercase tracking-wider">
                        <Lightbulb className="h-4 w-4 text-amber-500" /> Solution & Explanation
                      </div>
                      <p className="text-xs leading-relaxed text-slate-800 font-japanese">
                        {q.explanation}
                      </p>

                      {/* Distractor rationale (Why Wrong) */}
                      {q.explanationBreakdown?.whyWrong && (
                        <div className="mt-3 pt-3 border-t border-slate-100 text-xs">
                          <span className="font-bold text-slate-700 block mb-1.5">
                            Distractor Analysis:
                          </span>
                          <div className="space-y-1">
                            {Object.entries(q.explanationBreakdown.whyWrong).map(
                              ([optId, reason]) => (
                                <p key={optId} className="text-slate-600">
                                  <strong className="text-slate-800">Option {optId}:</strong>{" "}
                                  {reason}
                                </p>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
