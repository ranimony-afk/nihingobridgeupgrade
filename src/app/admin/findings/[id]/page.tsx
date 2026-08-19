import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AdminShell } from "@/components/AdminShell";
import { FindingStatusForm } from "@/components/FindingStatusForm";
import { db } from "@/db";
import { auditFindings } from "@/db/schema";
import { getStaffSession } from "@/lib/audit/auth";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminFindingPage({ params }: { params: Promise<{ id: string }> }) {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const { id } = await params;
  const [finding] = await db.select().from(auditFindings).where(eq(auditFindings.id, id));
  if (!finding) notFound();

  return (
    <AdminShell staff={staff}>
      <Link href="/admin" className="text-sm font-bold text-[#58cc02]">
        ← All findings
      </Link>
      <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-[#ffc800]">
        {finding.domain} · {finding.category} · P{finding.priority} · {finding.effort}
      </p>
      <h1 className="mt-2 text-3xl font-black">{finding.title}</h1>
      <p className="mt-4 max-w-3xl text-white/75">{finding.description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/50">Evidence</h2>
          <p className="mt-2 font-mono text-sm text-[#89e219]">{finding.evidence}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-white/50">Recommendation</h2>
          <p className="mt-2 text-sm text-white/80">{finding.recommendation}</p>
        </article>
      </div>
      <div className="mt-6 rounded-2xl bg-white p-5">
        <FindingStatusForm id={finding.id} status={finding.status} />
      </div>
    </AdminShell>
  );
}
