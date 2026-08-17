import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { getStaffSession } from "@/lib/audit/auth";
import { getAuditBundle } from "@/lib/audit/repo";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const bundle = await getAuditBundle();

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">Phase {bundle.report?.phase}</p>
      <h1 className="mt-1 text-4xl font-black">{bundle.report?.title}</h1>
      <p className="mt-3 max-w-3xl text-white/70">{bundle.report?.summary}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Readiness" value={`${bundle.score}`} hint="/ 100" />
        <Stat label="Domain coverage" value={`${bundle.coverage}%`} hint="enterprise map" />
        <Stat label="Open" value={`${bundle.byStatus.open ?? 0}`} hint="need owners" />
        <Stat label="Critical" value={`${bundle.bySeverity.critical ?? 0}`} hint="blockers" />
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-black">Roadmap</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {bundle.roadmap.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#ffc800]">
                Phase {item.phase} · {item.status}
              </p>
              <h3 className="mt-1 text-lg font-black">{item.title}</h3>
              <p className="mt-1 text-sm text-white/70">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-black">Findings</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/10 text-xs uppercase tracking-widest text-white/60">
              <tr>
                <th className="px-3 py-3">P</th>
                <th className="px-3 py-3">Severity</th>
                <th className="px-3 py-3">Domain</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {bundle.findings.map((finding) => (
                <tr key={finding.id} className="border-t border-white/10">
                  <td className="px-3 py-3 font-black">{finding.priority}</td>
                  <td className="px-3 py-3">
                    <SeverityBadge value={finding.severity} />
                  </td>
                  <td className="px-3 py-3 text-white/70">{finding.domain}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/findings/${finding.id}`} className="font-bold hover:text-[#58cc02]">
                      {finding.title}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-white/70">{finding.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-black">Activity</h2>
        <ul className="mt-3 space-y-2 text-sm text-white/70">
          {bundle.events.map((event) => (
            <li key={event.id}>
              <span className="font-black text-white">{event.action}</span> · {event.detail}
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-extrabold uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="text-xs text-white/50">{hint}</p>
    </div>
  );
}

function SeverityBadge({ value }: { value: string }) {
  const color =
    value === "critical" ? "#ff4b4b" : value === "high" ? "#ff9600" : value === "medium" ? "#ffc800" : "#58cc02";
  return (
    <span className="rounded-full px-2 py-1 text-xs font-black uppercase" style={{ background: color, color: "#111" }}>
      {value}
    </span>
  );
}
