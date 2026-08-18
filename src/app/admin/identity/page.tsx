import { redirect } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { IdentityDesk } from "@/components/IdentityDesk";
import { getStaffSession } from "@/lib/audit/auth";
import { listIdentityUsers, listInstitutions } from "@/lib/identity/service";
import { db } from "@/db";
import { identityMail, identityRolePermissions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function AdminIdentityPage() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  const [users, orgs, mail, grants] = await Promise.all([
    listIdentityUsers(),
    listInstitutions(),
    db.select().from(identityMail).orderBy(desc(identityMail.createdAt)).limit(12),
    db.select().from(identityRolePermissions),
  ]);

  return (
    <AdminShell staff={staff}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#58cc02]">CMS</p>
      <h1 className="text-4xl font-black">Identity</h1>
      <IdentityDesk
        users={users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          plan: user.plan,
          status: user.status,
        }))}
        institutions={orgs}
        mail={mail.map((row) => ({ id: row.id, toEmail: row.toEmail, subject: row.subject, kind: row.kind }))}
        grants={grants}
      />
    </AdminShell>
  );
}
