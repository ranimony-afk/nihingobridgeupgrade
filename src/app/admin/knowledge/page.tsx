import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById, hasPermission } from "@/lib/auth/identity";
import { syncKnowledgeDatasetRegistry } from "@/lib/knowledge/datasets";
import { getKnowledgeAdminOverview } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export default async function KnowledgeAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=/admin/knowledge");
  const user = await getUserById(session.user.id);
  if (!user || !(await hasPermission(user.id, user.role, "knowledge:manage"))) redirect("/unauthorized");

  await syncKnowledgeDatasetRegistry();
  const overview = await getKnowledgeAdminOverview();

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10">
      <div className="mx-auto max-w-6xl"><a href="/admin" className="text-sm font-bold text-[#277a5c] underline">← CMS workspace</a><div className="mb-7 mt-5"><p className="text-xs font-extrabold tracking-[.16em] text-[#277a5c]">JAPANESE KNOWLEDGE GRAPH</p><h1 className="mt-1 font-serif text-4xl font-normal text-[#18231d]">Corpus operations</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#657166]">Source datasets are versioned, checksummed, validated, and ingested through a controlled worker. This console surfaces database provenance and data-quality health without allowing arbitrary server file execution.</p></div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[{ label: "Lexemes", value: overview.metrics.lexemes }, { label: "Kanji", value: overview.metrics.kanji }, { label: "Sentences", value: overview.metrics.sentences }, { label: "Grammar", value: overview.metrics.grammar }, { label: "Validation issues", value: overview.metrics.validationIssues }].map((metric) => <article key={metric.label} className="rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-4"><p className="text-xs font-bold uppercase tracking-[.11em] text-[#748076]">{metric.label}</p><p className="mt-2 font-serif text-2xl text-[#18231d]">{metric.value.toLocaleString()}</p></article>)}</section>
      <section className="mt-6 rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">CONTROLLED IMPORT COMMAND</p><pre className="mt-3 overflow-x-auto rounded-xl bg-[#18231d] p-4 text-xs leading-6 text-[#dff2de]">npx tsx scripts/knowledge/ingest.ts --dataset jmdict --input "$KNOWLEDGE_DATA_DIR/JMdict_e.xml.gz" --version 2026-01 --mode incremental</pre><p className="mt-3 text-sm text-[#657166]">Run imports in a worker or release job after source-license review. Revalidate an existing run with <code>npx tsx scripts/knowledge/validate.ts --run &lt;run-id&gt;</code>.</p></section>
      <section className="mt-6 rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">DATASETS</p><div className="mt-3 divide-y divide-[#e1e6de]">{overview.datasets.map((dataset) => <div className="flex flex-wrap items-start justify-between gap-3 py-3" key={dataset.id}><div><p className="text-sm font-bold text-[#415247]">{dataset.title} <span className="font-mono text-xs text-[#748076]">{dataset.key}</span></p><p className="mt-1 max-w-3xl text-xs leading-5 text-[#657166]">{dataset.license} · {dataset.attribution}</p></div><span className="rounded-full bg-[#edf0e9] px-2.5 py-1 text-xs font-bold text-[#526157]">{dataset.latestVersion ?? "not imported"}</span></div>)}</div></section>
      <section className="mt-6 rounded-2xl border border-[#dce3d8] bg-[#fbfcf7] p-5"><p className="text-xs font-extrabold tracking-[.14em] text-[#277a5c]">RECENT IMPORT RUNS</p><div className="mt-3 divide-y divide-[#e1e6de]">{overview.latestRuns.map((run) => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={run.id}><div><p className="font-mono text-xs text-[#415247]">{run.id}</p><p className="mt-1 text-xs text-[#657166]">{run.status} · read {run.recordsRead.toLocaleString()} · written {run.recordsWritten.toLocaleString()} · failed {run.recordsFailed.toLocaleString()}</p></div><span className="text-xs text-[#748076]">{run.sourceVersion}</span></div>)}{overview.latestRuns.length === 0 && <p className="py-4 text-sm text-[#657166]">No imports have run yet.</p>}</div></section></div>
    </main>
  );
}
