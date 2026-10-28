/**
 * Owner-identity enforcement for learner-owned service operations.
 * Phase 26F-E3.
 *
 * THE PROBLEM THIS CLOSES
 * -----------------------
 * Several service methods selected a learner's records implicitly:
 *
 *     const userId = payload.userId || "anonymous-user";   // XpService.award
 *     static async getTotalXp(userId = "anonymous-user")   // and getLevel,
 *     static async getSummary(userId = "anonymous-user")   // getSummary,
 *                                                          // getLedger,
 *                                                          // getSettings,
 *                                                          // awardDailyStreak,
 *                                                          // getUserProgressSummary
 *
 * Two distinct defects hide in those two shapes:
 *
 *   1. A DEFAULT makes "no identity" silently mean "the shared sentinel". The
 *      caller does not have to decide anything; the service decides for them,
 *      and the decision is always the same account.
 *   2. A `||` FALLBACK turns any falsy value — missing, empty string, or a
 *      caller who simply forgot — into that same shared account, after
 *      whatever value the request supplied has already been trusted.
 *
 * Both are identity-selection mechanisms. Neither is an authorization check:
 * neither can tell a verified actor from a string an attacker typed.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * The last line of defence at the service boundary. Routes already resolve a
 * verified actor (`getClaims` → `resolveApplicationUser` → `CmsActor` →
 * `requireActor`) and pass `actor.id`; this module refuses to let a service run
 * an owner-scoped query when that id is absent, blank, or the shared sentinel.
 *
 * Deliberately total and side-effect free: no I/O, no logging, no throwing of
 * driver-derived data. A rejection carries only the operation name, so it can
 * never leak a query, a parameter, or a caller-supplied value into a log or an
 * HTTP response.
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 * It is not authentication, and it is not ownership. It cannot know whether an
 * id was verified — only the auth chain can. It stops the *silent* selection of
 * an identity; proving the id belongs to the caller remains the job of the
 * route (verified actor) and of each query's ownership predicate.
 */

/**
 * The legacy shared-owner sentinel.
 *
 * Rows written before ownership existed carry this value. They are kept (never
 * deleted, reassigned or rewritten) but the value is **not an identity**: no
 * caller can prove it, so a service must never treat it as the owner of an
 * operation it is about to perform.
 */
export const SHARED_SENTINEL = "anonymous-user";

/** Stable code for callers that must not mistake this for a validation error. */
export const MISSING_OWNER_CODE = "MISSING_OWNER";

/**
 * Raised when an owner-scoped service is asked to run without a usable owner.
 *
 * Deliberately carries no request data — only the operation name — so it is
 * safe to log and safe to let a route's sanitized 500 swallow.
 */
export class MissingOwnerError extends Error {
  readonly code = MISSING_OWNER_CODE;
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation} requires a verified owner identity`);
    this.name = "MissingOwnerError";
    this.operation = operation;
  }
}

/**
 * Return the owner an owner-scoped operation may use, or throw.
 *
 * Rejected: non-strings, empty, whitespace-only, and the shared sentinel
 * (including a padded spelling of it).
 *
 * Accepted values are returned **unchanged**. In particular there is no
 * trimming of a legitimate id: the repository's identity comparisons are exact
 * (`learningIdentity` states the same rule), and silently normalising
 * `" learner-1 "` into `"learner-1"` would turn a near-miss into a match.
 */
export function requireOwner(userId: unknown, operation: string): string {
  if (typeof userId !== "string") {
    throw new MissingOwnerError(operation);
  }

  const trimmed = userId.trim();
  if (trimmed === "" || trimmed === SHARED_SENTINEL) {
    throw new MissingOwnerError(operation);
  }

  return userId;
}
