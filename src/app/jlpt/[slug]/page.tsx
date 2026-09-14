import Link from "next/link";
import { notFound } from "next/navigation";

import { JlptStartButton } from "@/components/quiz/jlpt-start-button";
import { readLearner } from "@/services/learning/session";
import { getTest, listAttempts } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const test = await getTest(slug);
  return {
    title: test ? `${test.title} | NihongoBridge` : "JLPT test | NihongoBridge",
    description: test?.description ?? "Timed JLPT mock test",
  };
}

export default async function JlptTestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const test = await getTest(slug);
  if (!test) notFound();

  const learner = await readLearner();
  const attempts = learner
    ? (await listAttempts(learner.id, { limit: 20 })).filter((attempt) => attempt.testSlug === slug)
    : [];

  return (
    <div className="space-y-8" data-testid="jlpt-test-page">
      <header className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                {test.levelLabel}
              </span>
              <span className="text-xs text-slate-500">
                {test.questionCount} questions · {Math.round(test.timeLimitSeconds / 60)} min ·{" "}
                {test.sections.length} sections
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              {test.title}
            </h1>
            {test.titleJa ? (
              <p className="jp-glyph mt-1 text-lg text-slate-500">{test.titleJa}</p>
            ) : null}
            <p className="mt-3 max-w-2xl text-sm text-slate-600">{test.description}</p>
          </div>
          <JlptStartButton slug={test.slug} available={test.available} />
        </div>

        {test.instructions ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {test.instructions}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-slate-500">
          Pass: ≥ {test.passingPercent}% overall and ≥ {test.sectionMinimumPercent}% in every
          section. Grading, the clock and the pass decision are all computed server-side.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Sections</h2>
        {test.sections.map((section) => (
          <article
            key={section.code}
            className="rounded-3xl border border-slate-200 bg-white p-6"
            data-testid="jlpt-section"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Section {section.position}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  {section.title}
                  {section.titleJa ? (
                    <span className="jp-glyph ml-2 text-slate-500">{section.titleJa}</span>
                  ) : null}
                </h3>
                {section.instructions ? (
                  <p className="mt-1 text-sm text-slate-600">{section.instructions}</p>
                ) : null}
              </div>
              <dl className="grid grid-cols-3 gap-4 text-right">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Questions</dt>
                  <dd className="text-sm font-medium text-slate-800">{section.questionCount}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Limit</dt>
                  <dd className="text-sm font-medium text-slate-800">
                    {Math.round(section.timeLimitSeconds / 60)} min
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Bank</dt>
                  <dd
                    className={`text-sm font-medium ${
                      section.satisfiable ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {section.available} available
                  </dd>
                </div>
              </dl>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Samples skills: {section.skills.join(", ")}
              {section.kinds.length > 0 ? ` · kinds: ${section.kinds.join(", ")}` : ""}
            </p>
          </article>
        ))}
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500">
          聴解 (listening) is planned for this blueprint and will be added as a third section once
          the platform&apos;s audio domain ships.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Your attempts</h2>
        {attempts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No attempts yet for this test.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100" data-testid="jlpt-attempts">
            {attempts.map((attempt) => (
              <li key={attempt.publicId} className="py-3">
                <Link
                  href={`/jlpt/${encodeURIComponent(slug)}/attempt/${attempt.publicId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-2 py-2 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {attempt.status.replace("_", " ")} · {attempt.correctCount}/
                      {attempt.questionCount} correct
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(attempt.startedAt).toLocaleString()}
                      {attempt.durationSeconds != null
                        ? ` · ${Math.round(attempt.durationSeconds / 60)} min`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">
                      {attempt.score}/{attempt.totalPoints} pts
                    </span>
                    <span className="text-base font-semibold text-slate-900">
                      {attempt.percent}%
                    </span>
                    {attempt.passed != null ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          attempt.passed
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {attempt.passed ? "passed" : "failed"}
                      </span>
                    ) : null}
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
