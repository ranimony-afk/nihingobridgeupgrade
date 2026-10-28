import "server-only";

import { NextResponse } from "next/server";

/**
 * Phase 26F-E1 — emergency SRS containment.
 *
 * WHY THIS EXISTS
 * ---------------
 * The SRS API currently has no authenticated actor and no ownership predicate
 * at the service boundary. Any caller can read or mutate any learner's cards,
 * reviews, sessions, devices and XP by supplying an id. That defect cannot be
 * fixed by adding route authentication alone: the services behind these routes
 * accept caller-supplied `userId`/`ownerId` and fall back to the shared
 * `"anonymous-user"` sentinel, so an authenticated but unowned request would
 * still reach another learner's rows.
 *
 * Until the identity path and the service-layer ownership predicates land
 * (Phase 26F-D), every route that can read or mutate learner-owned SRS data
 * returns this response INSTEAD of calling its service. The denial happens
 * before any request parsing, database access, session work, sync work or XP
 * award, so no partially-authorized path remains reachable.
 *
 * DELIBERATE PROPERTIES
 * ---------------------
 * - Fail-closed: there is no environment flag, header, query parameter or
 *   cookie that can switch this off. Removing the containment requires a code
 *   change reviewed as such. A kill-switch that a misconfiguration could flip
 *   would not be containment.
 * - Non-disclosing: the body is a fixed string. It never echoes the caller's
 *   `userId`, `ownerId`, `deviceId`, `cardId`, `sessionId`, nor any database or
 *   stack detail, and it is identical whether or not the referenced resource
 *   exists — so it cannot be used as an existence oracle.
 * - Non-cacheable: `Cache-Control: no-store` prevents an intermediary from
 *   replaying a stale response against learner data.
 * - HTTP 503: "temporarily unable to handle the request" is the honest status
 *   for a deliberate, operator-visible outage of a working endpoint. 401/403
 *   would misdescribe the cause as a caller problem and would leak that
 *   authentication, rather than containment, is the active gate.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Containment is not authorization. It removes reachability; it does not
 * implement ownership. Public beta stays blocked until Phase 26F-D replaces
 * this module with real authentication and ownership enforcement.
 */

/** Stable machine-readable code. Clients may branch on this exact string. */
export const SRS_CONTAINMENT_CODE = "SRS_CONTAINMENT_ACTIVE";

/** Fixed operator-facing explanation. Contains no caller data. */
export const SRS_CONTAINMENT_MESSAGE =
  "SRS learner-data operations are temporarily unavailable while a cross-learner ownership defect is being remediated.";

/** 503 — deliberately unavailable, not a client error and not a server fault. */
export const SRS_CONTAINMENT_STATUS = 503;

/**
 * Whether containment is currently engaged.
 *
 * Always `true`, and deliberately a FUNCTION rather than a constant or an env
 * flag:
 *
 * - A `const` (or an inline `return`) makes every statement after the guard
 *   unreachable. TypeScript disables control-flow narrowing inside unreachable
 *   code, so the retained handler bodies would stop type-checking and force a
 *   rewrite of working code — the opposite of a minimal, reversible patch.
 *   A function call cannot be constant-folded by the compiler, so the bodies
 *   keep narrowing correctly while execution still stops at the guard.
 * - An env/header/query switch would be a kill-switch a misconfiguration could
 *   flip off. Containment must fail closed, so there is intentionally no input
 *   that can change this answer.
 *
 * Removing containment therefore requires deleting the guard calls in review —
 * a visible code change, not a configuration change.
 */
export function srsContainmentActive(): boolean {
  return true;
}

/**
 * The single containment response. Every contained handler returns this before
 * it reads the request or calls a service.
 */
export function srsContainmentResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: SRS_CONTAINMENT_MESSAGE,
      code: SRS_CONTAINMENT_CODE,
    },
    {
      status: SRS_CONTAINMENT_STATUS,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
