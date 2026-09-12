/**
 * Route and page guards — the authorization boundary.
 *
 * WHY NOT MIDDLEWARE
 * ------------------
 * Middleware is the obvious place to centralise auth, and it is the wrong
 * place to *enforce* it. CVE-2025-29927 let attackers skip Next.js middleware
 * entirely with a single `x-middleware-subrequest` header, and GHSA-6gpp-xcg3-4w24
 * did the same for App Router applications built with Turbopack. Both were
 * authorization bypasses in applications whose code was otherwise correct.
 *
 * The lesson is structural, not version-specific: a check that runs *before*
 * the handler can be routed around. A check inside the handler cannot, because
 * there is no request path that reaches the data without passing through it.
 *
 * So authorization is enforced here, at the point of data access. Middleware
 * adds security headers and a redirect for signed-out users — both are
 * usability and hardening, neither is the boundary.
 *
 * Every guard throws a typed AppError, which route handlers convert into the
 * frozen envelope via `jsonFromError`.
 */

import type { IdentityRole } from "@/db/schema";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { hasAtLeast } from "@/services/auth/rbac";
import { getCurrentUser } from "@/services/auth/session-cookie";
import type { PublicUser } from "@/services/auth/service";

/**
 * Require an authenticated user.
 * @throws UnauthenticatedError (401) when no valid session is present.
 */
export async function requireAuth(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/**
 * Require an authenticated user holding `role` or higher.
 *
 * Roles come from the database via the session. An inbound header claiming a
 * role is ignored — Repository B's header-trust pattern is rejected
 * (INTEGRATION_BOUNDARIES §6.6).
 *
 * @throws UnauthenticatedError (401) when signed out.
 * @throws ForbiddenError (403) when signed in without sufficient privilege.
 */
export async function requireRoleAtLeast(role: IdentityRole): Promise<PublicUser> {
  const user = await requireAuth();
  if (!hasAtLeast(user, role)) {
    throw new ForbiddenError(`This action requires the ${role} role`);
  }
  return user;
}

/**
 * Require that the caller owns the targeted resource, or is an admin.
 *
 * This is the guard that stops one learner reading another's progress by
 * editing an id in the URL. 401 and 403 are kept distinct: "sign in" and
 * "you may not do this" are different problems for the client.
 */
export async function requireSelf(targetUserId: string): Promise<PublicUser> {
  const user = await requireAuth();
  if (user.id !== targetUserId && !hasAtLeast(user, "admin")) {
    throw new ForbiddenError("You may only access your own data");
  }
  return user;
}

/** Non-throwing variant for endpoints that serve both states. */
export async function optionalAuth(): Promise<PublicUser | null> {
  return getCurrentUser();
}
