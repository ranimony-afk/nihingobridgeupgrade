"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { ExerciseGrade, ExercisePublic } from "@/types/exercise";

const KIND_LABEL: Record<string, string> = {
  multiple_choice: "Grammar",
  cloze: "Fill the blank",
  reading: "Kanji reading",
  meaning: "Vocabulary",
};

interface AnswerState {
  optionId: number | null;
  value: string;
  grade: ExerciseGrade | null;
  checking: boolean;
}

/**
 * Exercise runner.
 *
 * Every answer is graded by `POST /api/exercises/check`; this component never
 * knows which option is correct until the server says so, so the answer key
 * cannot be read from the page source.
 */
export function ExerciseRunner({
  lessonSlug,
  exercises,
  totalPoints,
}: {
  lessonSlug: string;
  exercises: ExercisePublic[];
  totalPoints: number;
}) {
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ percent: number; status: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const stateFor = useCallback(
    (id: number): AnswerState => answers[id] ?? { optionId: null, value: "", grade: null, checking: false },
    [answers],
  );

  const update = (id: number, patch: Partial<AnswerState>) => {
    setAnswers((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? { optionId: null, value: "", grade: null, checking: false }), ...patch },
    }));
  };

  const check = async (exercise: ExercisePublic) => {
    const state = stateFor(exercise.id);
    if (state.grade) return;
    if (exercise.answerMode === "option" && state.optionId === null) return;
    if (exercise.answerMode === "text" && state.value.trim().length === 0) return;

    update(exercise.id, { checking: true });
    try {
      const response = await fetch("/api/exercises/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: [
            {
              exerciseId: exercise.id,
              optionId: exercise.answerMode === "option" ? state.optionId : undefined,
              value: exercise.answerMode === "text" ? state.value : undefined,
            },
          ],
        }),
      });
      const body = (await response.json()) as {
        data?: { grades?: ExerciseGrade[] };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Grading failed");
      const grade = body.data?.grades?.[0] ?? null;
      update(exercise.id, { grade, checking: false });
      setError(null);
    } catch (cause) {
      update(exercise.id, { checking: false });
      setError((cause as Error)?.message ?? "Grading failed");
    }
  };

  const graded = useMemo(
    () => Object.values(answers).filter((state) => state.grade !== null),
    [answers],
  );
  const score = graded.reduce((sum, state) => sum + (state.grade?.awardedPoints ?? 0), 0);
  const correctCount = graded.filter((state) => state.grade?.correct).length;
  const allDone = graded.length === exercises.length && exercises.length > 0;
  const percent = totalPoints === 0 ? 0 : Math.round((score / totalPoints) * 100);

  const reset = () => {
    setAnswers({});
    setError(null);
    setSaved(null);
  };

  /**
   * Persists the attempt. The server re-grades from its own answer key, so the
   * stored score can never be inflated by the client.
   */
  const saveProgress = async () => {
    setSaving(true);
    try {
      const payload = exercises.map((exercise) => {
        const state = stateFor(exercise.id);
        return {
          exerciseId: exercise.id,
          optionId: exercise.answerMode === "option" ? state.optionId : undefined,
          value: exercise.answerMode === "text" ? state.value : undefined,
        };
      });
      const response = await fetch(
        `/api/lessons/${encodeURIComponent(lessonSlug)}/exercises/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        },
      );
      const body = (await response.json()) as {
        data?: { percent?: number; progress?: { status?: string } | null };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Could not save progress");
      setSaved({
        percent: body.data?.percent ?? 0,
        status: body.data?.progress?.status ?? "in_progress",
      });
      setError(null);
    } catch (cause) {
      setError((cause as Error)?.message ?? "Could not save progress");
    } finally {
      setSaving(false);
    }
  };

  if (exercises.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No exercises are available for this lesson yet.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="exercise-runner">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <p className="text-xs text-slate-500">
          <strong className="text-slate-800">{graded.length}</strong> of {exercises.length} answered ·{" "}
          <strong className="text-slate-800">{correctCount}</strong> correct · {score}/{totalPoints} points
        </p>
        {graded.length > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
          >
            Try again
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <ol className="space-y-4">
        {exercises.map((exercise, index) => {
          const state = stateFor(exercise.id);
          const grade = state.grade;
          return (
            <li
              key={exercise.id}
              className={`rounded-3xl border bg-white p-5 transition ${
                grade ? (grade.correct ? "border-emerald-300" : "border-rose-300") : "border-slate-200"
              }`}
              data-testid="exercise-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
                  {index + 1}. {KIND_LABEL[exercise.kind] ?? exercise.kind}
                </span>
                <span className="text-[11px] text-slate-400">
                  {exercise.points} {exercise.points === 1 ? "point" : "points"}
                </span>
              </div>

              <p className="mt-2 text-base font-medium text-slate-900">{exercise.prompt}</p>
              {exercise.promptJa ? (
                <p className="jp mt-2 rounded-xl bg-slate-50 px-4 py-3 text-lg text-slate-900">
                  {exercise.promptJa}
                </p>
              ) : null}
              {exercise.instructions ? (
                <p className="mt-2 text-xs text-slate-500">{exercise.instructions}</p>
              ) : null}

              {exercise.answerMode === "option" ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {exercise.options.map((option) => {
                    const selected = state.optionId === option.id;
                    const isCorrectOption = grade?.correctOptionId === option.id;
                    const wrongPick = Boolean(grade) && selected && !grade?.correct;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={Boolean(grade)}
                        onClick={() => update(exercise.id, { optionId: option.id })}
                        className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-default ${
                          grade && isCorrectOption
                            ? "border-emerald-500 bg-emerald-50"
                            : wrongPick
                              ? "border-rose-500 bg-rose-50"
                              : selected
                                ? "border-slate-900 bg-slate-50"
                                : "border-slate-200 hover:border-slate-400"
                        }`}
                      >
                        <span className="jp block text-base text-slate-900">{option.label}</span>
                        {option.subLabel ? (
                          <span className="block text-xs text-slate-500">{option.subLabel}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    value={state.value}
                    disabled={Boolean(grade)}
                    onChange={(event) => update(exercise.id, { value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void check(exercise);
                      }
                    }}
                    placeholder="かな"
                    aria-label={`Answer for exercise ${index + 1}`}
                    className="jp min-w-[200px] flex-1 rounded-2xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-slate-900 disabled:bg-slate-50"
                  />
                </div>
              )}

              {!grade ? (
                <button
                  type="button"
                  onClick={() => void check(exercise)}
                  disabled={
                    state.checking ||
                    (exercise.answerMode === "option"
                      ? state.optionId === null
                      : state.value.trim().length === 0)
                  }
                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
                >
                  {state.checking ? "Checking…" : "Check answer"}
                </button>
              ) : (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    grade.correct
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                  data-testid="exercise-feedback"
                >
                  <p className="font-semibold">{grade.correct ? "✓ Correct" : "✗ Not quite"}</p>
                  {!grade.correct && grade.correctAnswer ? (
                    <p className="jp mt-1">Accepted answer: {grade.correctAnswer}</p>
                  ) : null}
                  {grade.explanation ? <p className="mt-1">{grade.explanation}</p> : null}
                  {exercise.reference ? (
                    <Link href={exercise.reference.href} className="mt-2 inline-block underline">
                      Review {exercise.reference.label}
                    </Link>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {allDone ? (
        <div
          className={`rounded-3xl border p-6 text-center ${
            percent >= 70 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
          data-testid="exercise-summary"
        >
          <p className="text-2xl font-semibold text-slate-900">
            {score}/{totalPoints} points · {percent}%
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {percent >= 70
              ? "Nice work — you passed this practice set."
              : "Review the explanations and try the set again."}
          </p>
          {saved ? (
            <p className="mt-3 text-sm font-medium text-emerald-800" data-testid="progress-saved">
              ✓ Saved to your progress ({saved.percent}%)
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {!saved ? (
              <button
                type="button"
                onClick={() => void saveProgress()}
                disabled={saving}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
                data-testid="save-progress"
              >
                {saving ? "Saving…" : "Save my score"}
              </button>
            ) : (
              <Link
                href="/dashboard"
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                View progress →
              </Link>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-900"
            >
              Try again
            </button>
            <Link
              href={`/lessons/${encodeURIComponent(lessonSlug)}`}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Back to lesson
            </Link>
          </div>
        </div>
      ) : null}

      <p className="text-center text-[11px] text-slate-400">
        Answers are graded on the server and saved to your learner profile.
      </p>
    </div>
  );
}
