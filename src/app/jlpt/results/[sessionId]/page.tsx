"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { DetailedTestResult } from "@/types/quiz";
import { ScoreCertificateCard } from "@/components/analytics/ScoreCertificateCard";
import { SkillRadarBreakdown } from "@/components/analytics/SkillRadarBreakdown";
import { MistakeNotebook } from "@/components/analytics/MistakeNotebook";
import {
  Award,
  ArrowLeft,
  RotateCcw,
  Zap,
  BookOpen,
  Share2,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function ExamResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [results, setResults] = useState<DetailedTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadResults() {
      try {
        setLoading(true);
        const res = await fetch(`/api/jlpt/session/${sessionId}/results`);
        const json = await res.json();

        if (json.success && json.results) {
          setResults(json.results);
        } else {
          throw new Error(json.error || "Failed to load test results");
        }
      } catch (e: any) {
        setErrorMsg(e.message || "Error fetching results");
      } finally {
        setLoading(false);
      }
    }

    loadResults();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold">Calculating JLPT Scaled Scores & Diagnostics...</p>
      </div>
    );
  }

  if (errorMsg || !results) {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-rose-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Scorecard Not Found</h2>
        <p className="mt-2 text-sm text-slate-600">{errorMsg || "Unable to find results for this session."}</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Return to Hub
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Top Breadcrumb & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Examination Hub
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={`/jlpt/test/${results.testId || "jlpt-n5-mock-01"}`}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retake Exam
            </Link>
            <Link
              href="/quiz/drill"
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" /> Launch Quick Drill
            </Link>
          </div>
        </div>

        {/* 1. Official Scaled Certificate Card */}
        <ScoreCertificateCard results={results} />

        {/* 2. Sub-Domain Performance & Recommendations */}
        <SkillRadarBreakdown
          categoryBreakdown={results.categoryBreakdown}
          recommendations={results.recommendations}
        />

        {/* 3. Detailed Mistake Notebook & Solution Analysis */}
        <MistakeNotebook
          evaluations={results.evaluations}
          jlptLevel={results.jlptLevel}
        />
      </div>
    </main>
  );
}
