"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { QuizRunDetail, QuizRunItemPublic } from "@/types/quiz";

/**
 * Assessment runner — one component for practice quizzes and timed JLPT
 * attempts. It never contains an answer key: correctness, points and the pass
 * decision all arrive from the server (`POST /api/quiz/runs/{id}/answers` and
 * `.../complete`), which is the whole point of phase 10's single engine.
 */

const SKILL_LABEL: Record<string, string> = {
  grammar: "Grammar",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  reading: "Reading",
};

const fmtClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const fmtMinutes = (seconds: number | null) =>
  seconds == null ? "—" : `${Math.round(seconds / 60)} min`;

/** Shape returned by POST /api/quiz/runs/{id}/answers. */
interface GradeResponse {
  run: QuizRunDetail["run"];
  position: number;
  grade: {
    correct: boolean;
    points: number;
    awardedPoints: number;
    correctAnswer: string | null;
    explanation: string | null;
    feedback: string | null;
  };
  remaining: number;
}

interface Props {
  initial: QuizRunDetail;
  /** Where to send the learner when the run is closed. */
  exitHref: string;
  exitLabel: string;
}

export function AssessmentRunner({ initial, exitHref, exitLabel }: Props) {
  const [detail, setDetail] = useState<QuizRunDetail>(initial);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initial.items.findIndex((item) => !item.answer),
    ),
  );
  const [selection, setSelection] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemShownAt = useRef<number>(Date.now());

  const { run, items, result } = detail;
  const item: QuizRunItemPublic | undefined = items[index];
  const section = useMemo(
    () => (item?.sectionCode ? run.sections.find((entry) => entry.code === item.sectionCode) : null),
    [item?.sectionCode, run.sections],
  );
  const finished = run.status !== "in_progress";
  const remaining = run.questionCount - run.answeredCount;

  useEffect(() => {
    itemShownAt.current = Date.now();
    setSelection(item?.answer?.optionId ?? null);
    setTyped(item?.answer?.value ?? "");
    setError(null);
  }, [index, item?.answer?.optionId, item?.answer?.value]);

  const submit = useCallback(async () => {
    if (!item || submitting || item.answer) return;
    if (item.question.answerMode === "option" && selection === null) return;
    if (item.question.answerMode === "text" && typed.trim().length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/quiz/runs/${run.publicId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position: item.position,
          optionId: item.question.answerMode === "option" ? selection : null,
          value: item.question.answerMode === "text" ? typed.trim() : null,
          elapsedMs: Date.now() - itemShownAt.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 410) {
          setDetail((previous) => ({
            ...previous,
            run: { ...previous.run, status: "expired" },
          }));
        }
        setError(payload?.error?.message ?? "Could not grade that answer.");
        return;
      }
      const data = payload.data as GradeResponse;
      setDetail((previous) => ({
        ...previous,
        run: { ...previous.run, ...data.run },
        items: previous.items.map((entry) =>
          entry.position === data.position
            ? {
                ...entry,
                answer: {
                  optionId: item.question.answerMode === "option" ? selection : null,
                  value: item.question.answerMode === "text" ? typed.trim() : null,
                  correct: data.grade.correct,
                  awardedPoints: data.grade.awardedPoints,
                  points: entry.question.points,
                  correctAnswer: data.grade.correctAnswer,
                  feedback: data.grade.feedback,
                  explanation: data.grade.explanation,
                  elapsedMs: Date.now() - itemShownAt.current,
                },
              }
            : entry,
        ),
      }));
    } catch {
      setError("Network error — the answer was not saved.");
    } finally {
      setSubmitting(false);
    }
  }, [item, run.publicId, selection, submitting, typed]);

  const finish = useCallback(
    async (expired = false) => {
      if (finishing) return;
      setFinishing(true);
      setError(null);
      try {
        const response = await fetch(`/api/quiz/runs/${run.publicId}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(expired ? {} : {}),
        });
        const payload = await response.json();
        if (response.ok && payload.data) {
          setDetail(payload.data as QuizRunDetail);
        } else {
          setError(payload?.error?.message ?? "Could not finish the run.");
        }
      } catch {
        setError("Network error — the run was not finished.");
      } finally {
        setFinishing(false);
      }
    },
    [finishing, run.publicId],
  );

  const jump = (position: number) => {
    const target = items.findIndex((entry) => entry.position === position);
    if (target >= 0) setIndex(target);
  };

  /* Server-side clock: the run's expiry timestamp is authoritative, never the
   * browser, so a learner cannot extend a timed JLPT attempt locally. */
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    const expiresAt = run.expiresAt;
    if (!expiresAt || finished) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) void finish(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [run.expiresAt, finished, finish]);


  const currentAnswer = item?.answer ?? null;

  return (
    <div className="space-y-6" data-testid="assessment-runner">
      {/* Header: identity, clock, progress */}
      <header className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {run.kind === "jlpt" ? `JLPT attempt · ${run.jlptSlug ?? ""}` : "Practice quiz"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{run.title}</h1>
            {run.jlptLevel ? (
              <p className="mt-1 text-sm text-slate-500">
                Level N{6 - run.jlptLevel} · {run.questionCount} questions ·{" "}
                {fmtMinutes(run.timeLimitSeconds)} limit
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                {run.questionCount} questions · {run.totalPoints} points
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {secondsLeft !== null ? (
              <span
                className={`rounded-2xl px-4 py-2 font-mono text-lg ${
                  secondsLeft <= 60
                    ? "bg-rose-50 text-rose-700"
                    : "bg-slate-900 text-white"
                }`}
                data-testid="assessment-clock"
              >
                {fmtClock(secondsLeft)}
              </span>
            ) : run.status === "expired" ? (
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                Time expired
              </span>
            ) : null}
            <Link
              href={exitHref}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-900"
            >
              {exitLabel}
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{
                width: `${run.questionCount === 0 ? 0 : (run.answeredCount / run.questionCount) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {run.answeredCount}/{run.questionCount} answered
            {run.kind === "quiz" ? ` · ${run.score} pts` : ""}
          </span>
        </div>
      </header>

      {/* Question sheet */}
      {item ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="assessment-question">
          {section ? (
            <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Section {section.position} · {section.title}
                {section.titleJa ? ` · ${section.titleJa}` : ""}
              </p>
              {section.instructions ? (
                <p className="mt-1 text-sm text-slate-600">{section.instructions}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Question {item.position} of {run.questionCount}
            </span>
            <span className="text-xs text-slate-500">
              {SKILL_LABEL[item.question.skill] ?? item.question.skill} ·{" "}
              {item.question.answerMode === "text" ? "type the answer" : "choose one"} ·{" "}
              {item.question.points} pt
            </span>
          </div>

          <p className="jp-glyph mt-4 text-lg font-medium leading-relaxed text-slate-900">
            {item.question.prompt}
          </p>
          {item.question.promptJa ? (
            <p className="jp-glyph mt-1 text-sm text-slate-500">{item.question.promptJa}</p>
          ) : null}
          {item.question.instructions ? (
            <p className="mt-2 text-sm text-slate-500">{item.question.instructions}</p>
          ) : null}

          {item.question.answerMode === "option" ? (
            <ul className="mt-5 space-y-2">
              {item.question.options.map((option) => {
                const chosen = selection === option.id;
                const graded = Boolean(currentAnswer);
                const isPicked = currentAnswer?.optionId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={graded || finished}
                      onClick={() => setSelection(option.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        graded
                          ? isPicked
                            ? currentAnswer?.correct
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-rose-400 bg-rose-50"
                            : "border-slate-200 bg-white opacity-70"
                          : chosen
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white hover:border-slate-400"
                      }`}
                    >
                      <span className="jp-glyph flex-1 text-base">{option.label}</span>
                      {option.subLabel ? (
                        <span className="text-xs opacity-70">{option.subLabel}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-5">
              <input
                type="text"
                value={typed}
                disabled={Boolean(currentAnswer) || finished}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="答えを入力 (hiragana)"
                className="jp-glyph w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-slate-900"
                data-testid="assessment-text-input"
              />
              <p className="mt-2 text-xs text-slate-500">
                Katakana and hiragana are interchangeable — the server normalises both.
              </p>
            </div>
          )}

          {/* Post-answer feedback: correctness is only known after submitting. */}
          {currentAnswer ? (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 ${
                currentAnswer.correct
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
              data-testid="assessment-feedback"
            >
              <p className="text-sm font-semibold text-slate-900">
                {currentAnswer.correct ? "Correct" : "Not correct"} ·{" "}
                {currentAnswer.awardedPoints}/{currentAnswer.points} pt
              </p>
              {currentAnswer.correctAnswer ? (
                <p className="jp-glyph mt-1 text-sm text-slate-700">
                  Expected: {currentAnswer.correctAnswer}
                </p>
              ) : null}
              {currentAnswer.feedback ? (
                <p className="mt-1 text-sm text-slate-600">{currentAnswer.feedback}</p>
              ) : null}
              {currentAnswer.explanation ? (
                <p className="mt-1 text-sm text-slate-600">{currentAnswer.explanation}</p>
              ) : null}
              {item.question.reference ? (
                <Link
                  href={item.question.reference.href}
                  className="mt-2 inline-block text-xs font-medium text-slate-700 underline"
                >
                  Study {item.question.reference.label} →
                </Link>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndex((current) => Math.max(0, current - 1))}
                disabled={index === 0}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setIndex((current) => Math.min(items.length - 1, current + 1))}
                disabled={index >= items.length - 1}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
            {!currentAnswer && !finished ? (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                data-testid="assessment-submit"
              >
                {submitting ? "Checking…" : "Submit answer"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Navigator */}
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Questions
          </h2>
          <span className="text-xs text-slate-500">{remaining} left</span>
        </div>
        <ol className="mt-3 flex flex-wrap gap-2">
          {items.map((entry) => {
            const answered = Boolean(entry.answer);
            const correct = entry.answer?.correct;
            return (
              <li key={entry.position}>
                <button
                  type="button"
                  onClick={() => jump(entry.position)}
                  className={`h-9 w-9 rounded-xl text-sm font-medium transition ${
                    entry.position === item?.position
                      ? "bg-slate-900 text-white"
                      : answered
                        ? correct
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {entry.position}
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Completion / result */}
      {finished ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6" data-testid="assessment-result">
          <h2 className="text-lg font-semibold text-slate-900">
            {run.status === "expired" ? "Time expired" : "Run complete"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Score {run.score}/{run.totalPoints} · {run.percent}% · {run.correctCount} correct
            {run.durationSeconds != null ? ` · ${fmtClock(run.durationSeconds)} used` : ""}
          </p>

          {result ? (
            <>
              {run.kind === "jlpt" ? (
                <p
                  className={`mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${
                    result.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
                  }`}
                  data-testid="assessment-verdict"
                >
                  {result.passed
                    ? `Passed (≥ ${result.passingPercent}% overall, ≥ ${result.sectionMinimumPercent}% per section)`
                    : `Not passed — needs ≥ ${result.passingPercent}% overall and ≥ ${result.sectionMinimumPercent}% in every section`}
                </p>
              ) : null}

              {result.sections.length > 0 ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2">Section</th>
                        <th className="py-2">Correct</th>
                        <th className="py-2">Score</th>
                        <th className="py-2">Percent</th>
                        {run.kind === "jlpt" ? <th className="py-2">Gate</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {result.sections.map((sectionRow) => (
                        <tr key={sectionRow.code} className="border-t border-slate-100">
                          <td className="py-2 pr-4 font-medium text-slate-800">{sectionRow.title}</td>
                          <td className="py-2 pr-4 text-slate-600">
                            {sectionRow.correct}/{sectionRow.questionCount}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">
                            {sectionRow.score}/{sectionRow.totalPoints}
                          </td>
                          <td className="py-2 pr-4 text-slate-600">{sectionRow.percent}%</td>
                          {run.kind === "jlpt" ? (
                            <td className="py-2 pr-4">
                              <span
                                className={
                                  sectionRow.passed
                                    ? "text-emerald-700"
                                    : "text-rose-600"
                                }
                              >
                                {sectionRow.passed ? "pass" : "below minimum"}
                              </span>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {result.skills.length > 0 ? (
                <div className="mt-5 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Skill breakdown
                  </h3>
                  {result.skills.map((skill) => (
                    <div key={skill.skill} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-slate-600">
                        {SKILL_LABEL[skill.skill] ?? skill.skill}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${skill.percent}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-xs text-slate-500">
                        {skill.correct}/{skill.questionCount} · {skill.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-5 text-xs text-slate-500">
                Skipped questions score zero: {result.skipped}. Graded server-side from run{" "}
                <code>{run.publicId}</code> with seed <code>{run.seed}</code>.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              This run ran out of time. Open it again to score the answers you submitted.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void finish()}
              disabled={finishing}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              {finishing ? "Scoring…" : "Re-score this run"}
            </button>
            <Link
              href={exitHref}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              {exitLabel}
            </Link>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void finish()}
            disabled={finishing}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            data-testid="assessment-finish"
          >
            {finishing ? "Scoring…" : "Finish & score"}
          </button>
          <p className="text-xs text-slate-500">
            Unanswered questions score zero. Grading and the pass decision happen on the server.
          </p>
        </div>
      )}
    </div>
  );
}
