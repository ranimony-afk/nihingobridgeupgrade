import "server-only";

/**
 * CMS actor model — Phase 13.3A authorization foundation.
 *
 * Small, closed, replaceable role/permission model for the future Knowledge
 * CMS. This module is pure (no I/O, no request access, no environment reads):
 * it answers "does this actor hold this permission" and nothing else.
 * Identity resolution lives in ./authorization.ts behind an injectable,
 * server-side resolver — there is intentionally NO channel through which
 * client-supplied values (body, query, headers) can reach this model.
 */

/** Conceptual CMS roles. `learner` is the default and holds no permissions. */
export type CmsRole = "admin" | "editor" | "reviewer" | "learner";

export const CMS_ROLES: readonly CmsRole[] = [
  "admin",
  "editor",
  "reviewer",
  "learner",
] as const;

/** Action-oriented CMS permissions (not route-oriented). */
export type CmsPermission =
  | "cms.read"
  | "cms.create"
  | "cms.edit"
  | "cms.submit_review"
  | "cms.approve"
  | "cms.schedule"
  | "cms.publish"
  | "cms.archive"
  | "cms.rollback"
  | "cms.verify_translation";

export const CMS_PERMISSIONS: readonly CmsPermission[] = [
  "cms.read",
  "cms.create",
  "cms.edit",
  "cms.submit_review",
  "cms.approve",
  "cms.schedule",
  "cms.publish",
  "cms.archive",
  "cms.rollback",
  "cms.verify_translation",
] as const;

/**
 * Stable server-side actor representation consumed by future CMS services.
 * `id` is the verified identity key supplied by the authentication
 * mechanism — never a client-supplied user ID.
 */
export interface CmsActor {
  readonly id: string;
  readonly role: CmsRole;
  readonly displayName?: string;
}

/**
 * Role → permission matrix (Phase 13.3A §3):
 * - learner:  no CMS permissions
 * - editor:   read / create / edit / submit_review
 * - reviewer: read / approve / verify_translation
 * - admin:    all CMS permissions
 */
export const ROLE_PERMISSIONS: Record<CmsRole, readonly CmsPermission[]> = {
  learner: [],
  editor: ["cms.read", "cms.create", "cms.edit", "cms.submit_review"],
  reviewer: ["cms.read", "cms.approve", "cms.verify_translation"],
  admin: [...CMS_PERMISSIONS],
};

function isKnownRole(role: string): role is CmsRole {
  return (CMS_ROLES as readonly string[]).includes(role);
}

export function isKnownPermission(
  permission: string
): permission is CmsPermission {
  return (CMS_PERMISSIONS as readonly string[]).includes(permission);
}

/**
 * Permissions for a role string. Unknown / forged role values resolve to the
 * empty set (fail closed to least privilege) — a fake role can never widen
 * access, it can only lose it.
 */
export function rolePermissions(role: string): readonly CmsPermission[] {
  if (!isKnownRole(role)) return [];
  return ROLE_PERMISSIONS[role];
}

/**
 * Pure permission check. Returns false for null/undefined actors, missing
 * identity, unknown roles, and unknown permissions. Never throws for
 * authorization outcomes — callers that need 401/403 semantics use
 * requirePermission() in ./authorization.ts.
 */
export function actorHasPermission(
  actor: CmsActor | null | undefined,
  permission: string
): boolean {
  if (!actor || typeof actor.id !== "string" || actor.id.length === 0) {
    return false;
  }
  if (!isKnownPermission(permission)) return false;
  return rolePermissions(actor.role).includes(permission);
}
