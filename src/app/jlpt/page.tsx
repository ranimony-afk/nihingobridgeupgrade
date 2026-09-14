import Link from "next/link";

import { getJlptStats, listPublishedTests } from "@/services/jlpt/tests";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "JLPT tests | NihongoBridge",
  description: "Timed JLPT mock tests assembled from the canonical question bank.",
};

export default async function JlptIndexPage() {
  const [tests, stats] = await Promise.all([listPublishedTests(), getJlptStats()]);

  return (
    <div className="space-y-8" data-testid="jlpt-page">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">JLPT mock tests</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Each test declares its sections, per-section time limits and pass gates. Questions are
          drawn from the canonical bank when the attempt starts, so scores always reflect the
          knowledge graph — never a private copy of it.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Published tests", value: stats.published },
          { label: "Attempts", value: stats.attempts },
          { label: "Pass rate", value: `${stats.passRate}%` },
          { label: "Average score", value: `${stats.averagePercent}%` },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        {tests.length === 0 ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No blueprints are published yet. Run <code>node etl/run-jlpt-blueprints.mjs</code> to
            load them.
          </p>
        ) : (
          tests.map((test) => (
            <article
              key={test.slug}
              className="rounded-3xl border border-slate-200 bg-white p-6"
              data-testid="jlpt-test-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                      {test.levelLabel}
                    </span>
                    {test.available ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        bank ready
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        bank gap
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">
                    {test.title}
                    {test.titleJa ? (
                      <span className="jp-glyph ml-2 text-base text-slate-500">{test.titleJa}</span>
                    ) : null}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{test.subtitle}</p>
                  <p className="mt-3 max-w-2xl text-sm text-slate-600">{test.description}</p>
                </div>
                <Link
                  href={`/jlpt/${encodeURIComponent(test.slug)}`}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-900"
                >
                  View blueprint →
                </Link>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-4">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Questions</dt>
                  <dd className="text-sm font-medium text-slate-800">{test.questionCount}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Time limit</dt>
                  <dd className="text-sm font-medium text-slate-800">
                    {Math.round(test.timeLimitSeconds / 60)} min
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Pass mark</dt>
                  <dd className="text-sm font-medium text-slate-800">
                    {test.passingPercent}% overall · {test.sectionMinimumPercent}% per section
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Sections</dt>
                  <dd className="text-sm font-medium text-slate-800">
                    {test.sections.map((section) => section.titleJa ?? section.title).join(" · ")}
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Bank coverage by level</h2>
        <p className="mt-1 text-sm text-slate-600">
          Blueprints are published per level as soon as the bank can fill every section. The
          listening section (聴解) ships with the platform&apos;s audio domain.
        </p>
        <ul className="mt-4 space-y-2">
          {stats.bankQuestionsByLevel.map((entry) => (
            <li key={entry.level} className="flex items-center gap-3">
              <span className="w-10 text-sm font-medium text-slate-700">N{6 - entry.level}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: `${Math.min(100, (entry.total / 450) * 100)}%`,
                  }}
                />
              </div>
              <span className="w-28 text-right text-xs text-slate-500">
                {entry.total.toLocaleString()} questions
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
