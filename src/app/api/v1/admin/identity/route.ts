import { getStaffSession } from "@/lib/audit/auth";
import { listIdentityUsers, listInstitutions, updateIdentityUser } from "@/lib/identity/service";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { identityMail, identityRolePermissions } from "@/db/schema";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const [users, orgs, mail, grants] = await Promise.all([
    listIdentityUsers(),
    listInstitutions(),
    db.select().from(identityMail).orderBy(desc(identityMail.createdAt)).limit(20),
    db.select().from(identityRolePermissions),
  ]);
  return Response.json({
    ok: true,
    data: {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        totpEnabled: user.totpEnabled,
      })),
      institutions: orgs,
      mail,
      grants,
    },
  });
}

export async function PATCH(request: Request) {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const body = (await request.json()) as {
    id?: string;
    role?: string;
    plan?: string;
    status?: string;
    institutionId?: string | null;
  };
  if (!body.id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
  const result = await updateIdentityUser(body.id, {
    role: body.role,
    plan: body.plan,
    status: body.status,
    institutionId: body.institutionId,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  return Response.json({ ok: true, data: result.user });
}
