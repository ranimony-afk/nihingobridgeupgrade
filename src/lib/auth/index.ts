import "server-only";

/**
 * Public surface of the Phase 13.3A authorization boundary.
 * Server-only: importing this barrel from a client component fails the
 * Next.js build by design (see the `server-only` package).
 */

export type { CmsActor, CmsPermission, CmsRole } from "./actor";
export {
  CMS_PERMISSIONS,
  CMS_ROLES,
  ROLE_PERMISSIONS,
  actorHasPermission,
  isKnownPermission,
  rolePermissions,
} from "./actor";
export type { ActorResolver, AuthorizationErrorCode } from "./authorization";
export {
  AuthorizationError,
  getCurrentActor,
  requireActor,
  requirePermission,
  requireRole,
  resetActorResolver,
  setActorResolver,
  toErrorPayload,
} from "./authorization";
export type {
  AuthenticatedIdentity,
  ClaimsCapableClient,
  SupabaseClientFactory,
} from "./identity";
export {
  getAuthenticatedIdentity,
  normalizeSupabaseIdentity,
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "./identity";
export type {
  ApplicationUserRecord,
  ApplicationUserStore,
  NewApplicationUser,
} from "./applicationUser";
export {
  createDrizzleApplicationUserStore,
  getCurrentApplicationUser,
  resetApplicationUserStore,
  resolveApplicationUser,
  setApplicationUserStore,
} from "./applicationUser";
