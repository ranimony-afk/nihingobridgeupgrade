import "server-only";

import { auth } from "@/auth";
import { extractBearerToken, verifyMobileAccessToken } from "@/lib/auth/jwt";
import {
  getSubscriptionAccess,
  getUserById,
  hasPermission,
  type AuthenticatedUser,
} from "@/lib/auth/identity";
import type { Permission } from "@/lib/auth/permissions";

export type RequestIdentity = {
  user: AuthenticatedUser;
  source: "session" | "mobile";
};

export type GuardResult =
  | { ok: true; identity: RequestIdentity }
  | { ok: false; response: Response };

export async function getRequestIdentity(request: Request): Promise<RequestIdentity | null> {
  const bearerToken = extractBearerToken(request);
  if (bearerToken) {
    const claims = await verifyMobileAccessToken(bearerToken);
    if (!claims) return null;

    const user = await getUserById(claims.userId);
    if (!user || user.status !== "active" || user.tokenVersion !== claims.tokenVersion) return null;
    return { user, source: "mobile" };
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await getUserById(session.user.id);
  if (!user || user.status !== "active") return null;
  return { user, source: "session" };
}

export async function requireIdentity(request: Request): Promise<GuardResult> {
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return {
      ok: false,
      response: Response.json({ error: "Authentication is required.", code: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }

  return { ok: true, identity };
}

export async function requirePermission(
  request: Request,
  permission: Permission,
): Promise<GuardResult> {
  const identityResult = await requireIdentity(request);
  if (!identityResult.ok) return identityResult;

  const allowed = await hasPermission(
    identityResult.identity.user.id,
    identityResult.identity.user.role,
    permission,
  );
  if (!allowed) {
    return {
      ok: false,
      response: Response.json({ error: "You do not have permission for this action.", code: "FORBIDDEN" }, { status: 403 }),
    };
  }

  return identityResult;
}

export async function requireActiveSubscription(request: Request): Promise<GuardResult> {
  const identityResult = await requireIdentity(request);
  if (!identityResult.ok) return identityResult;

  const subscription = await getSubscriptionAccess(identityResult.identity.user.id);
  if (!subscription.active && identityResult.identity.user.role !== "super_admin") {
    return {
      ok: false,
      response: Response.json(
        { error: "An active subscription is required.", code: "SUBSCRIPTION_REQUIRED" },
        { status: 402 },
      ),
    };
  }

  return identityResult;
}
