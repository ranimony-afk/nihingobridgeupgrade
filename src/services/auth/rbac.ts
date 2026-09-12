/**
 * Role-based access control.
 *
 * Roles are read from the database via the session. Inbound headers such as
 * `x-admin-role` are never consulted — Repository B's header-trust pattern is
 * explicitly rejected (INTEGRATION_BOUNDARIES §6.6).
 */

// Relative imports: this module is pure policy and is unit-tested directly
// under `node --test`, which has no bundler to resolve the "@/" alias.
import type { IdentityRole } from "../../db/schema.ts";
import { ForbiddenError, UnauthenticatedError } from "../../lib/errors.ts";

import type { PublicUser } from "./service.ts";

/** Ordered least → most privileged. */
export const ROLE_RANK: Record<IdentityRole, number> = {
  learner: 0,
  reviewer: 1,
  content_editor: 2,
  admin: 3,
  super_admin: 4,
};

export function hasRole(user: PublicUser, role: IdentityRole): boolean {
  return user.roles.includes(role);
}

/** True when the user holds `role` or anything more privileged. */
export function hasAtLeast(user: PublicUser, role: IdentityRole): boolean {
  const required = ROLE_RANK[role];
  return user.roles.some((held) => ROLE_RANK[held] >= required);
}

export function isAdmin(user: PublicUser): boolean {
  return hasAtLeast(user, "admin");
}

/** Throw unless a user is present. */
export function requireUser(user: PublicUser | null): PublicUser {
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Throw unless the user holds `role` or higher. */
export function requireRole(user: PublicUser | null, role: IdentityRole): PublicUser {
  const authenticated = requireUser(user);
  if (!hasAtLeast(authenticated, role)) {
    throw new ForbiddenError(`This action requires the ${role} role`);
  }
  return authenticated;
}

/**
 * Throw unless the user is acting on their own data, or is an admin.
 * Guards against one learner reading another's progress by changing an id.
 */
export function requireSelfOrAdmin(user: PublicUser | null, targetUserId: string): PublicUser {
  const authenticated = requireUser(user);
  if (authenticated.id !== targetUserId && !isAdmin(authenticated)) {
    throw new ForbiddenError("You may only access your own data");
  }
  return authenticated;
}
