import "server-only";

import type { CmsActor } from "./actor";

/**
 * Learning-endpoint self-identity policy — Phase 25.
 *
 * `POST /api/xp`, `DELETE /api/xp` and `POST /api/analytics` are *learning*
 * endpoints: they mutate one learner's own records. They are not CMS
 * operations, so they must not require CMS permissions (a `learner` holds
 * none, and granting one to make a learning endpoint work would invert the
 * role model). The policy they DO need is ownership:
 *
 *   identity comes from the verified server-side actor (never from the
 *   request), and a caller may only act on that actor's own rows.
 *
 * This module is the pure decision half of that policy. It is deliberately
 * total — no I/O, no throwing, no request access — so the same rule is applied
 * identically by every learning route and can be tested in isolation:
 *
 *   - claim absent (undefined / null / empty string) → use the actor's id.
 *     Absence is not a lie, and the pre-Phase-25 API allowed it; the value
 *     substituted is the verified one, so nothing is trusted.
 *   - claim equal to the actor's id → allowed (explicit self-reference).
 *   - claim is a non-empty string naming someone else → `foreign`: a spoof
 *     attempt, answered 403. No role escapes this: there is no XP/analytics
 *     administration permission in the model, and inventing an "admin may
 *     write anyone's XP" bypass here would create authority that no document,
 *     caller, or test asks for.
 *   - claim of any other type (number, boolean, array, object) → `malformed`:
 *     an ordinary field validation error, answered 400, so callers can tell a
 *     shape mistake from an authorization refusal.
 */

/** Why a self-identity resolution failed. */
export type SelfIdentityRejection = "malformed" | "foreign";

/** Resolution of a claimed user id against the verified actor. */
export type SelfIdentityResolution =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: SelfIdentityRejection };

/** Stable 400 message for a `userId` that is present but unusable. */
export const SELF_IDENTITY_MALFORMED_MESSAGE = "userId must be a string";

/**
 * Decide which user id the request may act on. The actor is trusted; the
 * claim is not.
 */
export function resolveSelfIdentity(
  actor: CmsActor,
  claimed: unknown
): SelfIdentityResolution {
  if (claimed === undefined || claimed === null || claimed === "") {
    return { ok: true, userId: actor.id };
  }
  if (typeof claimed !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (claimed !== actor.id) {
    return { ok: false, reason: "foreign" };
  }
  return { ok: true, userId: actor.id };
}
