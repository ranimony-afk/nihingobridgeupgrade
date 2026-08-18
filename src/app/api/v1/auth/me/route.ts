import { getIdentity } from "@/lib/identity/request";
import { hasPermission } from "@/lib/identity/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getIdentity(request);
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return Response.json({
    ok: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
      learnerId: user.learnerId,
      emailVerified: Boolean(user.emailVerifiedAt),
      totpEnabled: user.totpEnabled,
      permissions: {
        learn: hasPermission(user.role, "lms.learn"),
        roster: hasPermission(user.role, "teacher.roster"),
        users: hasPermission(user.role, "identity.users.read"),
      },
    },
  });
}
