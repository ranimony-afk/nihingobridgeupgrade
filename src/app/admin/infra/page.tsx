import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { InfraActions } from "@/components/InfraActions";
import { getStaffSession } from "@/lib/audit/auth";
import { eventCounts, listEvents } from "@/lib/infra/analytics";
import { listBackups } from "@/lib/infra/backups";
import { listErrors } from "@/lib/infra/errors";
import { getInfraStatus } from "@/lib/infra/health";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function InfraPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");

  const [status, backups, errors, events, summary] = await Promise.all([
    getInfraStatus(),
    listBackups(8),
    listErrors(8),
    listEvents(8),
    eventCounts(),
  ]);

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Phase 2</p>
      <h1 className="mt-1 text-4xl font-black">Infrastructure</h1>
      <p className="mt-3 max-w-3xl text-white/70">
        Production adapters around the live LMS. Redis, Supabase, and Sentry are optional — Postgres remains the
        source of truth.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {Object.entries(status.services).map(([name, service]) => (
          <article key={name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-extrabold uppercase tracking-widest text-white/50">{name}</p>
            <p className="mt-1 text-2xl font-black">{service.status}</p>
            <p className="text-xs text-white/50">{service.ok ? "healthy" : "needs attention"}</p>
          </article>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-2xl font-black">Backups</h2>
        <p className="mt-1 text-sm text-white/70">Logical snapshots land in BACKUP_DIR and are catalogued here.</p>
        <div className="mt-4">
          <InfraActions />
        </div>
        <ul className="mt-4 space-y-2 text-sm text-white/70">
          {backups.map((row) => (
            <li key={row.id}>
              <span className="font-black text-white">{row.status}</span> · {row.filename} · {row.bytes} bytes
            </li>
          ))}
          {backups.length === 0 ? <li>No backups yet.</li> : null}
        </ul>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-black">Error tracking</h2>
          <p className="text-sm text-white/60">{summary.total} analytics events recorded</p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {errors.map((row) => (
              <li key={row.id}>
                <span className="font-black text-white">{row.source}</span> · {row.message}
              </li>
            ))}
            {errors.length === 0 ? <li>No captured errors.</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-black">Analytics</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {events.map((row) => (
              <li key={row.id}>
                <span className="font-black text-white">{row.name}</span> · {row.path}
              </li>
            ))}
            {events.length === 0 ? <li>No events yet. Play a lesson to emit game_action.</li> : null}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
