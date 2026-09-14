import Link from "next/link";

import { QuizBuilder } from "@/components/quiz/quiz-builder";
import { readLearner } from "@/services/learning/session";
import { getBankStats } from "@/services/questions/engine";
import { getRunHistory, getRunStats } from "@/services/quiz/run-engine";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quizzes | NihongoBridge",
  description: "Build a practice quiz from the canonical question bank and get server-side grading.",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export default async function QuizPage() {
  const [bank, stats] = await Promise.all([getBankStats(), getRunStats()]);
  const learner = await readLearner();
  const runs = learner ? await getRunHistory(learner.id, { limit: 12 }) : [];

  return (
    <div className="space-y-8" data-testid="quiz-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Quizzes</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            A quiz is a frozen, ordered sample of the canonical question bank. Sampling, grading
            and scoring all happen server-side, and every run can be replayed from its seed.
          </p>
        </div>
        <Link
          href="/jlpt"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-900"
        >
          Timed JLPT tests →
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Bank questions", value: bank.active.toLocaleString() },
          { label: "Runs recorded", value: stats.runs.toLocaleString() },
          { label: "Answers graded", value: stats.answers.toLocaleString() },
          { label: "Average score", value: `${stats.averagePercent}%` },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <QuizBuilder bankTotals={bank.active} />

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Your runs</h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No runs yet — start a quiz above, or try a timed JLPT test.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100" data-testid="quiz-history">
            {runs.map((run) => (
              <li key={run.publicId} className="py-3">
                <Link
                  href={`/quiz/${run.publicId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {run.title}
                      {run.jlptLevel ? (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          N{6 - run.jlptLevel}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {run.kind === "jlpt" ? "JLPT attempt" : "Quiz"} · started {fmt(run.startedAt)} ·{" "}
                      seed {run.seed}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        run.status === "completed"
                          ? "text-slate-700"
                          : run.status === "expired"
                            ? "text-rose-600"
                            : "text-sky-700"
                      }
                    >
                      {run.status.replace("_", " ")}
                    </span>
                    {run.status === "completed" ? (
                      <span className="font-semibold text-slate-900">{run.percent}%</span>
                    ) : (
                      <span className="text-slate-500">
                        {run.answeredCount}/{run.questionCount}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
