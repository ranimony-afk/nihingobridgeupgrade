"use client";

import { useState } from "react";
import { Question } from "@/types/quiz";
import { Bookmark, CheckCircle2, Circle, Flag } from "lucide-react";

interface ExamNavigationMatrixProps {
  questions: Question[];
  currentIndex: number;
  answersMap: Record<string, string>;
  flaggedMap: Record<string, boolean>;
  onSelectQuestion: (index: number) => void;
}

export function ExamNavigationMatrix({
  questions,
  currentIndex,
  answersMap,
  flaggedMap,
  onSelectQuestion,
}: ExamNavigationMatrixProps) {
  const [filter, setFilter] = useState<"all" | "flagged" | "unanswered">("all");

  const answeredCount = questions.filter((q) => Boolean(answersMap[q.id])).length;
  const flaggedCount = questions.filter((q) => Boolean(flaggedMap[q.id])).length;
  const unansweredCount = questions.length - answeredCount;

  // Group questions by section
  const sections = Array.from(new Set(questions.map((q) => q.section)));

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Question Matrix</h3>
          <p className="text-xs text-slate-500">Jump directly to any problem</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-slate-900">
            {answeredCount} / {questions.length}
          </span>
          <p className="text-[10px] text-slate-400">Answered</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 my-3 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-all ${
            filter === "all"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          All ({questions.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("flagged")}
          className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-all ${
            filter === "flagged"
              ? "bg-amber-100 text-amber-900 shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Flagged ({flaggedCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unanswered")}
          className={`flex-1 rounded-md py-1 text-[11px] font-bold transition-all ${
            filter === "unanswered"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          Left ({unansweredCount})
        </button>
      </div>

      {/* Question Number Pills */}
      <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
        {sections.map((sec) => {
          const sectionQuestions = questions
            .map((q, idx) => ({ question: q, index: idx }))
            .filter((item) => item.question.section === sec);

          const filteredList = sectionQuestions.filter((item) => {
            const isAns = Boolean(answersMap[item.question.id]);
            const isFlg = Boolean(flaggedMap[item.question.id]);
            if (filter === "flagged") return isFlg;
            if (filter === "unanswered") return !isAns;
            return true;
          });

          if (filteredList.length === 0) return null;

          const sectionLabel =
            sec === "listening"
              ? "聴解 (Listening)"
              : sec === "vocab"
              ? "言語知識 (Vocabulary)"
              : sec === "grammar"
              ? "言語知識 (Grammar)"
              : sec === "reading"
              ? "読解 (Reading)"
              : "Language Knowledge & Reading";

          return (
            <div key={sec}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-2">
                {sectionLabel}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {filteredList.map(({ question, index }) => {
                  const isCurrent = index === currentIndex;
                  const isAnswered = Boolean(answersMap[question.id]);
                  const isFlagged = Boolean(flaggedMap[question.id]);

                  let btnStyle =
                    "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";

                  if (isAnswered) {
                    btnStyle =
                      "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold";
                  }

                  if (isFlagged) {
                    btnStyle =
                      "border-amber-400 bg-amber-50 text-amber-900 font-bold ring-2 ring-amber-300";
                  }

                  if (isCurrent) {
                    btnStyle += " ring-2 ring-slate-900 ring-offset-1";
                  }

                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => onSelectQuestion(index)}
                      className={`relative flex h-10 w-full items-center justify-center rounded-xl border text-xs font-semibold transition-all ${btnStyle}`}
                      title={`Go to Question ${index + 1} (${question.category})`}
                    >
                      {index + 1}
                      {isFlagged && (
                        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white">
                          <Flag className="h-2 w-2 fill-current" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Answered
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Flagged
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" /> Unanswered
        </div>
      </div>
    </div>
  );
}
