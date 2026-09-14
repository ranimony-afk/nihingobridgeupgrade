"use client";

import { CategoryPerformance, DiagnosticRecommendation } from "@/types/quiz";
import { BarChart3, TrendingUp, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

interface SkillRadarBreakdownProps {
  categoryBreakdown: Record<string, CategoryPerformance>;
  recommendations: DiagnosticRecommendation[];
}

export function SkillRadarBreakdown({
  categoryBreakdown,
  recommendations,
}: SkillRadarBreakdownProps) {
  const categories = Object.values(categoryBreakdown);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Category Mastery Bars */}
      <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Sub-Domain Performance Breakdown
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              JLPT Official Category Ratings (A: ≥67%, B: 34-66%, C: &lt;34%)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {categories.map((cat) => {
            const gradeColor =
              cat.grade === "A"
                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                : cat.grade === "B"
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-rose-100 text-rose-800 border-rose-300";

            const barColor =
              cat.grade === "A"
                ? "bg-emerald-500"
                : cat.grade === "B"
                ? "bg-amber-500"
                : "bg-rose-500";

            return (
              <div key={cat.categoryKey} className="rounded-2xl border border-slate-100 p-4 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black ${gradeColor}`}
                    >
                      {cat.grade}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {cat.categoryName}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-900">
                      {cat.correct} / {cat.total}
                    </span>
                    <span className="ml-2 text-xs font-semibold text-slate-500">
                      ({cat.percentage}%)
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={`h-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Recommendations & Weak Point Diagnostic */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-xl shadow-slate-100">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-100">
          <Sparkles className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-bold text-slate-900">AI Diagnostic Plan</h3>
        </div>

        <div className="space-y-3">
          {recommendations.map((rec, idx) => {
            const isHigh = rec.severity === "high";
            const isMedium = rec.severity === "medium";

            return (
              <div
                key={idx}
                className={`rounded-2xl border p-4 transition-all ${
                  isHigh
                    ? "border-rose-200 bg-rose-50/60"
                    : isMedium
                    ? "border-amber-200 bg-amber-50/60"
                    : "border-emerald-200 bg-emerald-50/60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {isHigh ? (
                    <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : isMedium ? (
                    <TrendingUp className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-snug">
                      {rec.title}
                    </h4>
                    <span className="inline-block rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 my-1">
                      {rec.domain}
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {rec.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
