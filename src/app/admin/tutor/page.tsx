import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { getStaffSession } from "@/lib/audit/auth";
import { listSessions, tutorStats } from "@/lib/tutor/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminTutorPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const [stats, sessions] = await Promise.all([tutorStats(), listSessions(30)]);

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ce82ff]">CMS</p>
      <h1 className="text-4xl font-black">AI tutor</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase text-white/50">Provider</p>
          <p className="text-2xl font-black">{stats.provider}</p>
        </article>
        <article className="rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase text-white/50">Sessions</p>
          <p className="text-2xl font-black">{stats.total}</p>
        </article>
        <article className="rounded-2xl border border-white/10 p-4">
          <p className="text-xs uppercase text-white/50">Average score</p>
          <p className="text-2xl font-black">{stats.avg}</p>
        </article>
      </div>
      <ul className="mt-6 space-y-2 text-sm text-white/70">
        {sessions.map((row) => (
          <li key={row.id}>
            {row.scenario} · {row.persona} · {row.level} · {row.turns} turns · score {row.score}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
