import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { KgImport } from "@/components/KgImport";
import { getStaffSession } from "@/lib/audit/auth";
import { graphStats } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminKgPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const stats = await graphStats();

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#1cb0f6]">CMS</p>
      <h1 className="text-4xl font-black">Knowledge graph</h1>
      <p className="mt-2 text-white/70">Normalized schema is sized for JMdict-scale loads. Core corpus is incremental.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.entries({
          Lexemes: `${stats.lexemes} / ${stats.capacity.lexemes.toLocaleString()}`,
          Kanji: `${stats.kanji} / ${stats.capacity.kanji.toLocaleString()}`,
          Sentences: `${stats.sentences} / ${stats.capacity.sentences.toLocaleString()}`,
          Grammar: `${stats.grammar} / ${stats.capacity.grammar.toLocaleString()}`,
          Idioms: `${stats.idioms} / ${stats.capacity.idioms.toLocaleString()}`,
          Collocations: `${stats.collocations} / ${stats.capacity.collocations.toLocaleString()}`,
        }).map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-white/10 p-4">
            <p className="text-xs uppercase text-white/50">{label}</p>
            <p className="text-xl font-black">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-6">
        <KgImport />
      </div>
      <section className="mt-6">
        <h2 className="text-xl font-black">Import runs</h2>
        <ul className="mt-2 space-y-1 text-sm text-white/70">
          {stats.runs.map((run) => (
            <li key={run.id}>
              {run.status} · {run.sourceId} · {JSON.stringify(run.counts)}
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
