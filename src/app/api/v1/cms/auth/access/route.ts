import { getSubscriptionAccess, hasPermission } from "@/lib/auth/identity";
import { requirePermission } from "@/lib/auth/guard";
import { permissions } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await requirePermission(request, "cms:read");
  if (!identity.ok) return identity.response;

  const user = identity.identity.user;
  const subscription = await getSubscriptionAccess(user.id);
  if (!subscription.active && user.role !== "super_admin") {
    return Response.json(
      { error: "An active subscription is required for CMS access.", code: "SUBSCRIPTION_REQUIRED" },
      { status: 402 },
    );
  }

  const effectivePermissions = await Promise.all(
    permissions.map(async (permission) => ({
      permission,
      allowed: await hasPermission(user.id, user.role, permission),
    })),
  );

  return Response.json({
    ok: true,
    user: { id: user.id, role: user.role, email: user.email },
    subscription,
    permissions: effectivePermissions,
  });
}
