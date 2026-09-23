import "server-only";

import type { CmsActor, CmsPermission, CmsRole } from "./actor";
import { actorHasPermission, isKnownPermission } from "./actor";
import { getCurrentApplicationUser } from "./applicationUser";

/**
 * Server-side authorization boundary — Phase 13.3A, wired in 13.4D-2.
 *
 * Trust flow (the ONLY supported direction):
 *
 *   request → authenticated identity → actor → role → permission → CMS operation
 *
 * What this module deliberately does NOT do:
 * - It reads no request body, query string, header, or cookie as identity.
 * - It accepts no role or user ID argument from callers (see function
 *   arities: identity has no input channel by construction).
 * - It defines no shared-secret header/env bypass. Tests inject
 *   deterministic actors via setActorResolver(). No escape hatch means no
 *   hatch to leak into production.
 *
 * Default resolution (13.4D-2): the default actor resolver runs the
 * authenticated pipeline — verified provider identity → application user
 * row (provisioned as learner on first sight) → CmsActor built from the
 * application-owned id/role/name. Unauthenticated requests still resolve
 * to null, so every CMS operation fails closed with 401 exactly as before.
 */

/** Resolves the verified actor for the current server context, if any. */
export type ActorResolver = () => Promise<CmsActor | null> | CmsActor | null;

/**
 * Production default: resolve the actor through the authenticated
 * application-user pipeline. Unknown stored roles degrade to `learner`
 * here (and again in normalizeActor below — defense in depth).
 */
async function defaultActorResolver(): Promise<CmsActor | null> {
  const appUser = await getCurrentApplicationUser();
  if (!appUser) return null;
  const role: CmsRole =
    appUser.role === "admin" ||
    appUser.role === "editor" ||
    appUser.role === "reviewer" ||
    appUser.role === "learner"
      ? appUser.role
      : "learner";
  return {
    id: appUser.id,
    role,
    ...(appUser.name !== "" ? { displayName: appUser.name } : {}),
  };
}

let actorResolver: ActorResolver = defaultActorResolver;

/**
 * Install the actor resolver. Intended for deterministic unit tests and
 * emergency overrides. Production code uses the default authenticated
 * pipeline. Server-only by module construction.
 */
export function setActorResolver(resolver: ActorResolver): void {
  actorResolver = resolver;
}

/** Restore the default authenticated pipeline. Used for test isolation. */
export function resetActorResolver(): void {
  actorResolver = defaultActorResolver;
}

export type AuthorizationErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

/**
 * Authorization failure with HTTP semantics. Messages are intentionally
 * generic so routes can surface them without leaking authorization detail.
 */
export class AuthorizationError extends Error {
  readonly status: 401 | 403;
  readonly code: AuthorizationErrorCode;

  constructor(status: 401 | 403) {
    super(
      status === 401
        ? "Authentication required."
        : "You do not have permission to perform this action."
    );
    this.name = "AuthorizationError";
    this.status = status;
    this.code = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN";
  }
}

/**
 * Normalize a resolver-provided actor. Fail-closed rules:
 * - null/undefined or empty identity → unauthenticated (null)
 * - unknown role value → degraded to `learner` (no permissions)
 * The returned actor is frozen so downstream code cannot escalate it.
 */
function normalizeActor(candidate: CmsActor | null | undefined): CmsActor | null {
  if (!candidate || typeof candidate.id !== "string" || candidate.id === "") {
    return null;
  }
  const role: CmsRole =
    candidate.role === "admin" ||
    candidate.role === "editor" ||
    candidate.role === "reviewer" ||
    candidate.role === "learner"
      ? candidate.role
      : "learner";
  return Object.freeze({
    id: candidate.id,
    role,
    ...(candidate.displayName !== undefined
      ? { displayName: candidate.displayName }
      : {}),
  });
}

/**
 * Current verified actor, or null when unauthenticated. Takes NO arguments:
 * identity originates solely from the server-side resolver.
 */
export async function getCurrentActor(): Promise<CmsActor | null> {
  return normalizeActor(await actorResolver());
}

/** Current actor, or throws 401 when unauthenticated. */
export async function requireActor(): Promise<CmsActor> {
  const actor = await getCurrentActor();
  if (!actor) throw new AuthorizationError(401);
  return actor;
}

/**
 * Current actor holding `permission`, or throws 401 (unauthenticated) / 403
 * (unauthorized). An unknown permission string is a programming error and
 * throws a plain Error (fail loud, 500-class) rather than masquerading as a
 * forbidden outcome.
 */
export async function requirePermission(
  permission: CmsPermission
): Promise<CmsActor> {
  if (!isKnownPermission(permission)) {
    throw new Error(`Unknown CMS permission: ${String(permission)}`);
  }
  const actor = await requireActor();
  if (!actorHasPermission(actor, permission)) {
    throw new AuthorizationError(403);
  }
  return actor;
}

/**
 * Current actor holding one of `roles`, or throws 401/403. Prefer
 * requirePermission() for action checks; role checks exist for the rare
 * cases where role identity itself is the rule.
 */
export async function requireRole(...roles: CmsRole[]): Promise<CmsActor> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) {
    throw new AuthorizationError(403);
  }
  return actor;
}

/**
 * Stable error payload for future `/api/admin/*` routes, matching the
 * repository's `{ success: false, error: { code, message } }` API shape.
 */
export function toErrorPayload(error: AuthorizationError): {
  status: 401 | 403;
  body: { success: false; error: { code: AuthorizationErrorCode; message: string } };
} {
  return {
    status: error.status,
    body: {
      success: false,
      error: { code: error.code, message: error.message },
    },
  };
}
