import Link from "next/link";

import { getEtlStatus } from "@/repositories/etl";
import { getGrammarStats } from "@/repositories/grammar";
import { getKnowledgeStats } from "@/repositories/knowledge";
import { getSearchHealth } from "@/services/search/postgres-search";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · knowledge graph | NihongoBridge" };

export default async function AdminPage() {
  const [status, stats, grammar, search] = await Promise.all([
    getEtlStatus(),
    getKnowledgeStats(),
    getGrammarStats(),
    getSearchHealth(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Admin · knowledge graph
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Read-only control surface for the knowledge ETL. Provenance, dataset versions and run
          history are stored in PostgreSQL so any content question can be answered from the data
          itself.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[
          { label: "Kanji", value: stats.kanji },
          { label: "Radicals", value: stats.radicals },
          { label: "Components", value: stats.components },
          { label: "Component links", value: stats.componentLinks },
          { label: "Vocabulary", value: stats.vocabulary },
          { label: "Vocabulary links", value: stats.vocabularyLinks },
          { label: "Readings", value: stats.readings },
          { label: "Sources", value: stats.sources },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="text-xl font-semibold text-slate-900">
              {item.value.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Grammar knowledge</h2>
        <p className="mt-1 text-xs text-slate-500">
          Curated points, their surface patterns and the corpus evidence harvested for them.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Points", value: grammar.points },
            { label: "Patterns", value: grammar.patterns },
            { label: "Examples", value: grammar.examples },
            { label: "Matches", value: grammar.matches },
            { label: "Relations", value: grammar.relations },
            { label: "Sources", value: grammar.sources },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
              <p className="text-xl font-semibold text-slate-900">
                {item.value.toLocaleString("en-US")}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {grammar.byLevel.map((level) => (
            <span key={level.jlptLevel ?? "none"} className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              {level.jlptLevel ? `N${level.jlptLevel}` : "unlevelled"}: {level.total}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">PostgreSQL search</h2>
            <p className="mt-1 text-xs text-slate-500">
              Exact · GIN full-text · pg_trgm fuzzy. No external search engine.
            </p>
          </div>
          <Link href="/api/search/stats" className="text-xs text-slate-500 hover:text-slate-900">
            JSON health →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Active docs</p>
            <p className="text-xl font-semibold text-slate-900">{search.active.toLocaleString("en-US")}</p>
          </div>
          {search.byType.map((type) => (
            <div key={type.entityType} className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{type.entityType}</p>
              <p className="text-xl font-semibold text-slate-900">{type.active.toLocaleString("en-US")}</p>
            </div>
          ))}
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">pg_trgm</p>
            <p className={`text-sm font-semibold ${search.pgTrgm ? "text-emerald-700" : "text-rose-700"}`}>
              {search.pgTrgm ? "ready" : "missing"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">GIN FTS</p>
            <p className={`text-sm font-semibold ${search.fullTextIndex ? "text-emerald-700" : "text-rose-700"}`}>
              {search.fullTextIndex ? "ready" : "missing"}
            </p>
          </div>
        </div>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
          {`node etl/run-search-index.mjs\npsql "$DATABASE_URL" -f scripts/search-indexes.sql`}
        </pre>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Sources &amp; provenance</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Licence</th>
                <th className="py-2 pr-4">Retrieved</th>
                <th className="py-2">Checksum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {status.sources.map((source) => (
                <tr key={source.code}>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700">{source.code}</td>
                  <td className="py-2 pr-4 text-slate-700">{source.name}</td>
                  <td className="py-2 pr-4 text-slate-500">{source.version ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-500">{source.license}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {source.retrievedAt ? new Date(source.retrievedAt).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-400">{source.checksum ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          See <code>docs/PROVENANCE.md</code> for licence details and redistribution rules.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">ETL runs</h2>
          <Link
            href="/api/admin/etl/status"
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            JSON →
          </Link>
        </div>
        {status.runs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No pipeline runs recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {status.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    run.status === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : run.status === "running"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {run.status}
                </span>
                <span className="font-mono text-xs text-slate-700">{run.pipeline}</span>
                <span className="text-xs text-slate-500">
                  {run.startedAt ? new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 19) : "—"}
                </span>
                <span className="text-xs text-slate-500">
                  read {run.recordsRead.toLocaleString("en-US")} · wrote{" "}
                  {run.recordsWritten.toLocaleString("en-US")}
                </span>
                {run.message ? (
                  <span className="text-xs text-slate-400">{run.message}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">
          {`# re-run the knowledge pipeline (additive, no DROP/TRUNCATE)
node etl/run-pipeline.mjs                 # all stages
node etl/run-pipeline.mjs --only kanji    # KANJIDIC2 only
node etl/run-pipeline.mjs --only structure
node etl/run-pipeline.mjs --only vocabulary --max-priority 2`}
        </pre>
      </section>
    </div>
  );
}
