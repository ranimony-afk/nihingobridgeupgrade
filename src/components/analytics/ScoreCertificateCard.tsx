"use client";

import { DetailedTestResult } from "@/types/quiz";
import { Award, CheckCircle, XCircle, Clock, BarChart2, ShieldCheck } from "lucide-react";

interface ScoreCertificateCardProps {
  results: DetailedTestResult;
}

export function ScoreCertificateCard({ results }: ScoreCertificateCardProps) {
  const {
    title,
    jlptLevel,
    score,
    maxScore,
    passed,
    passingScore,
    sectionScores,
    totalTimeSpentSeconds,
    completedAt,
  } = results;

  const minutesSpent = Math.floor(totalTimeSpentSeconds / 60);
  const secondsSpent = totalTimeSpentSeconds % 60;

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
      {/* Background Decorative Crest */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-slate-50 opacity-80 pointer-events-none" />

      <div className="relative z-10">
        {/* Certificate Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-bold text-white uppercase tracking-wider">
                Official Mock Grade
              </span>
              <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                {jlptLevel} Level
              </span>
            </div>
            <h2 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              {title}
            </h2>
            <p className="text-xs text-slate-700 mt-1">
              Completed on {new Date(completedAt || Date.now()).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {/* Pass / Fail Stamp */}
          <div
            className={`flex items-center gap-2.5 rounded-2xl border-2 px-5 py-3 shadow-sm ${
              passed
                ? "border-emerald-500 bg-emerald-50/80 text-emerald-900 ring-4 ring-emerald-100"
                : "border-rose-500 bg-rose-50/80 text-rose-900 ring-4 ring-rose-100"
            }`}
          >
            {passed ? (
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            ) : (
              <XCircle className="h-8 w-8 text-rose-600" />
            )}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">
                {passed ? "Exam Status: PASSED" : "Exam Status: NOT PASSED"}
              </div>
              <div className="text-xl font-black">
                {passed ? "合格 (GOUKAKU)" : "不合格 (FUGOUKAKU)"}
              </div>
            </div>
          </div>
        </div>

        {/* Big Scaled Score Hero */}
        <div className="my-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-6 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Total Scaled Score
            </span>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-black text-slate-950 tracking-tight">
                {score}
              </span>
              <span className="text-lg font-bold text-slate-700">/ {maxScore}</span>
            </div>
            <div className="mt-2 text-xs font-medium text-slate-700">
              Passing Cutoff: <span className="font-bold text-slate-900">{passingScore} pts</span>
            </div>
          </div>

          {/* Sectional Breakdown Cards */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(sectionScores).map(([key, sec]) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[180px]">
                    {sec.title}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      sec.passed
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {sec.passed ? "Passed" : "Below Min"}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {sec.earned}{" "}
                    <span className="text-xs font-normal text-slate-700">/ {sec.max} pts</span>
                  </span>
                  <span className="text-xs font-bold text-slate-700">{sec.percentage}%</span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full transition-all ${
                      sec.passed ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, sec.percentage)}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-slate-700 text-right">
                  Required: {sec.requiredScore} pts
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Meta Stats bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-900 px-6 py-3.5 text-white text-xs">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span>
              Time Elapsed: <strong className="text-white">{minutesSpent}m {secondsSpent}s</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>
              Official Scoring Algorithm: <strong className="text-white">JLPT Scaled Band Model</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-red-400" />
            <span>
              Accuracy: <strong className="text-white">{results.percentage}%</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
