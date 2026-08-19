import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { SearchReindex } from "@/components/SearchReindex";
import { getStaffSession } from "@/lib/audit/auth";
import { searchIndexSize } from "@/lib/search/indexer";
import { popularQueries, zeroResultQueries } from "@/lib/search/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminSearchPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const [size, popular, zero] = await Promise.all([
    searchIndexSize(),
    popularQueries(10),
    zeroResultQueries(10),
  ]);

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#1cb0f6]">CMS</p>
      <h1 className="text-4xl font-black">Search</h1>
      <p className="mt-2 text-white/70">
        {size.total} indexed documents across {Object.keys(size.byKind).length} content types.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {Object.entries(size.byKind).map(([kind, count]) => (
          <article key={kind} className="rounded-2xl border border-white/10 p-4">
            <p className="text-xs uppercase text-white/50">{kind}</p>
            <p className="text-2xl font-black">{count}</p>
          </article>
        ))}
      </div>

      <SearchReindex />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-xl font-black">Popular queries</h2>
          <ul className="mt-3 space-y-1 text-sm text-white/70">
            {popular.map((row) => (
              <li key={row.query}>
                {row.query} · {row.count}× · avg {row.avgHits} hits
              </li>
            ))}
            {popular.length === 0 ? <li>No searches logged yet.</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 p-5">
          <h2 className="text-xl font-black">Zero-result queries</h2>
          <p className="text-xs text-white/50">Content gaps worth filling.</p>
          <ul className="mt-3 space-y-1 text-sm text-white/70">
            {zero.map((row) => (
              <li key={row.query}>
                {row.query} · {row.count}×
              </li>
            ))}
            {zero.length === 0 ? <li>Every logged query returned results.</li> : null}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
