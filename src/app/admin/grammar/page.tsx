import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { GrammarAdminTools } from "@/components/GrammarAdminTools";
import { getStaffSession } from "@/lib/audit/auth";
import { grammarStats, listGrammarPoints } from "@/lib/grammar/engine";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminGrammarPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const [stats, points] = await Promise.all([grammarStats(), listGrammarPoints()]);

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">CMS</p>
      <h1 className="text-4xl font-black">Grammar engine</h1>
      <p className="mt-2 text-white/70">
        {stats.total} explanations · capacity {stats.capacity.toLocaleString()}
      </p>
      <GrammarAdminTools />
      <ul className="mt-6 space-y-1 text-sm text-white/70">
        {points.slice(0, 60).map((row) => (
          <li key={row.id}>
            {row.level} · d{row.meta?.difficulty ?? 1} · {row.title} — {row.structure}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
