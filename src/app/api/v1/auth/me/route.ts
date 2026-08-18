import { getSubscriptionAccess } from "@/lib/auth/identity";
import { requireIdentity } from "@/lib/auth/guard";
import { permissionsForRole } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (!identity.ok) return identity.response;

  const subscription = await getSubscriptionAccess(identity.identity.user.id);
  const user = identity.identity.user;

  return Response.json(
    {
      ok: true,
      source: identity.identity.source,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.emailVerified),
      },
      permissions: permissionsForRole(user.role),
      subscription,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
