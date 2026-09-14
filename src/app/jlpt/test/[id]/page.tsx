"use client";

import { useEffect, useState, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Question, JLPTLevel } from "@/types/quiz";
import { JLPTTestModel } from "@/types/jlpt";
import { QuestionRenderer } from "@/components/quiz/QuestionRenderer";
import { ExamNavigationMatrix } from "@/components/quiz/ExamNavigationMatrix";
import { ExamTimer } from "@/components/quiz/ExamTimer";
import {
  Award,
  Clock,
  ArrowLeft,
  ArrowRight,
  Send,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Sparkles,
  Loader2,
  Maximize2,
} from "lucide-react";

function JLPTTestContent({ testId }: { testId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPracticeMode = searchParams.get("mode") === "practice";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [test, setTest] = useState<JLPTTestModel | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState<number>(5400); // 90 min default

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});
  const [starOrdersMap, setStarOrdersMap] = useState<Record<string, string[]>>({});
  const [flaggedMap, setFlaggedMap] = useState<Record<string, boolean>>({});
  const [timeSpentMap, setTimeSpentMap] = useState<Record<string, number>>({});

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize Exam Session
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        setLoading(true);

        // Fetch test details
        const testRes = await fetch(`/api/jlpt/tests/${testId}`);
        const testJson = await testRes.json();

        if (!testJson.success || !testJson.test) {
          throw new Error(testJson.error || "Failed to load test");
        }

        if (!isMounted) return;

        setTest(testJson.test);
        setQuestions(testJson.questions || []);

        // Start session in backend
        const sessionRes = await fetch("/api/jlpt/session/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testId,
            quizType: isPracticeMode ? "section_practice" : "jlpt_mock",
            jlptLevel: testJson.test.jlptLevel,
            isTimed: !isPracticeMode,
          }),
        });

        const sessionJson = await sessionRes.json();
        if (sessionJson.success && isMounted) {
          setSessionId(sessionJson.sessionId);
          setTimeLimitSeconds(sessionJson.timeLimitSeconds);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || "Error starting test");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [testId, isPracticeMode]);

  // Track time spent on current question
  useEffect(() => {
    if (questions.length === 0) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const interval = setInterval(() => {
      setTimeSpentMap((prev) => ({
        ...prev,
        [currentQ.id]: (prev[currentQ.id] || 0) + 1,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, questions]);

  // Handle Answer selection
  const handleAnswerChange = async (selected: string, starOrder?: string[]) => {
    const currentQ = questions[currentIndex];
    if (!currentQ || !sessionId) return;

    const newAnswers = { ...answersMap, [currentQ.id]: selected };
    setAnswersMap(newAnswers);

    if (starOrder) {
      setStarOrdersMap((prev) => ({ ...prev, [currentQ.id]: starOrder }));
    }

    // Persist to server
    try {
      await fetch(`/api/jlpt/session/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQ.id,
          selectedAnswer: selected,
          starOrderSubmitted: starOrder,
          timeSpentSeconds: timeSpentMap[currentQ.id] || 0,
          isFlagged: Boolean(flaggedMap[currentQ.id]),
        }),
      });
    } catch (e) {
      console.warn("Could not sync answer to backend:", e);
    }
  };

  // Toggle question flag
  const handleToggleFlag = async () => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    const newFlagState = !flaggedMap[currentQ.id];
    setFlaggedMap((prev) => ({ ...prev, [currentQ.id]: newFlagState }));

    if (sessionId) {
      try {
        await fetch(`/api/jlpt/session/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: currentQ.id,
            selectedAnswer: answersMap[currentQ.id] || "",
            starOrderSubmitted: starOrdersMap[currentQ.id],
            timeSpentSeconds: timeSpentMap[currentQ.id] || 0,
            isFlagged: newFlagState,
          }),
        });
      } catch (e) {
        console.warn("Could not sync flag to backend:", e);
      }
    }
  };

  // Submit test
  const handleSubmitExam = async () => {
    if (!sessionId || submitting) return;

    try {
      setSubmitting(true);
      setShowSubmitModal(false);

      const formattedAnswers = questions.map((q) => ({
        questionId: q.id,
        selectedAnswer: answersMap[q.id] || "",
        starOrderSubmitted: starOrdersMap[q.id] || [],
        timeSpentSeconds: timeSpentMap[q.id] || 0,
        isFlagged: Boolean(flaggedMap[q.id]),
      }));

      const res = await fetch(`/api/jlpt/session/${sessionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: formattedAnswers,
        }),
      });

      const json = await res.json();
      if (json.success) {
        router.push(`/jlpt/results/${sessionId}`);
      } else {
        throw new Error(json.error || "Failed to submit exam");
      }
    } catch (err: any) {
      alert("Submission error: " + err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold">Preparing JLPT Examination Environment...</p>
      </div>
    );
  }

  if (errorMsg || !test || questions.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-20 px-4 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-rose-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Unable to load test</h2>
        <p className="mt-2 text-sm text-slate-600">{errorMsg || "No questions found for this test."}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Return to Hub
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const answeredCount = questions.filter((q) => Boolean(answersMap[q.id])).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-slate-100/60 pb-16">
      {/* Sticky Exam Control Bar */}
      <div className="sticky top-16 z-40 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Left: Test info & Section */}
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-black text-white">
              {test.jlptLevel}
            </span>
            <div className="hidden sm:block">
              <h2 className="text-sm font-bold text-slate-900 truncate max-w-md">
                {test.title}
              </h2>
              <p className="text-[11px] text-slate-500">
                {currentQ.section === "listening"
                  ? "聴解 (Listening Comprehension)"
                  : "言語知識・読解 (Language Knowledge & Reading)"}
              </p>
            </div>
          </div>

          {/* Right: Timer & Submit Action */}
          <div className="flex items-center gap-3">
            {!isPracticeMode && (
              <ExamTimer
                initialSeconds={timeLimitSeconds}
                onTimeExpired={handleSubmitExam}
              />
            )}

            {isPracticeMode && (
              <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
                Practice Mode (Untimed)
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span>Submit Test</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Question Area (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <QuestionRenderer
              question={currentQ}
              questionIndex={currentIndex}
              totalQuestions={questions.length}
              selectedAnswer={answersMap[currentQ.id]}
              starOrderSubmitted={starOrdersMap[currentQ.id]}
              isFlagged={flaggedMap[currentQ.id]}
              showInstantFeedback={isPracticeMode}
              onAnswerChange={handleAnswerChange}
              onToggleFlag={handleToggleFlag}
            />

            {/* Pagination Controls */}
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>

              <span className="text-xs font-bold text-slate-500">
                Problem {currentIndex + 1} of {questions.length}
              </span>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))
                  }
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-all shadow-xs"
                >
                  Next Problem <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-all shadow-md shadow-red-500/20"
                >
                  Finish & Grade <CheckCircle2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right Sidebar: Navigation Matrix (4 cols) */}
          <div className="lg:col-span-4">
            <div className="sticky top-32 space-y-4">
              <ExamNavigationMatrix
                questions={questions}
                currentIndex={currentIndex}
                answersMap={answersMap}
                flaggedMap={flaggedMap}
                onSelectQuestion={(idx) => setCurrentIndex(idx)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 md:p-8 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 font-bold">
              <Award className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Submit JLPT Examination?</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Once submitted, your answers will be locked, scaled according to official JLPT
                scoring bands, and graded with complete diagnostics.
              </p>
            </div>

            {/* Status counts */}
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs">
              <div className="rounded-xl bg-white p-3 border border-slate-200/80">
                <span className="text-slate-500 block">Answered:</span>
                <strong className="text-lg font-black text-emerald-600">
                  {answeredCount} / {questions.length}
                </strong>
              </div>
              <div className="rounded-xl bg-white p-3 border border-slate-200/80">
                <span className="text-slate-500 block">Unanswered:</span>
                <strong className="text-lg font-black text-rose-600">
                  {unansweredCount}
                </strong>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>You have {unansweredCount} unanswered questions left.</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Keep Working
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={submitting}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-md shadow-red-500/25 hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Grading..." : "Yes, Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JLPTTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: testId } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      }
    >
      <JLPTTestContent testId={testId} />
    </Suspense>
  );
}
