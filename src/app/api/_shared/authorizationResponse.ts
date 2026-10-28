import "server-only";

import { NextResponse } from "next/server";
import { AuthorizationError, requireActor } from "@/lib/auth";
import type { CmsActor } from "@/lib/auth";
import {
  SELF_IDENTITY_MALFORMED_MESSAGE,
  type SelfIdentityRejection,
} from "@/lib/auth/learningIdentity";
import { logOperationFailure } from "@/lib/logging/safeDiagnostics";

/**
 * Shared transport glue for the learning write routes — Phase 25.
 *
 * These routes already answered with the repository's FLAT error envelope
 * (`{ success: false, error: <stable string>, code }`), unlike the CMS routes
 * which nest `error`. Adding authorization must not restyle working clients, so
 * `AuthorizationError` is flattened into that same envelope — exactly the
 * translation `POST /api/questions` already performs.
 *
 * No policy lives here: `requireActor()` decides who the caller is,
 * `resolveSelfIdentity()` (../lib/auth/learningIdentity) decides what they may
 * touch. This file only maps outcomes to HTTP.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** 401/403 in the flat envelope, with the canonical generic messages. */
export function authorizationFailureResponse(
  error: AuthorizationError
): NextResponse {
  return NextResponse.json(
    { success: false, error: error.message, code: error.code },
    { status: error.status, headers: NO_STORE }
  );
}

/** 403 for a foreign identity claim, 400 for a malformed one. */
export function selfIdentityFailureResponse(
  reason: SelfIdentityRejection
): NextResponse {
  if (reason === "foreign") {
    return authorizationFailureResponse(new AuthorizationError(403));
  }
  return NextResponse.json(
    { success: false, error: SELF_IDENTITY_MALFORMED_MESSAGE },
    { status: 400, headers: NO_STORE }
  );
}

/** Authenticated actor, or the HTTP response that must be returned instead. */
export type ActorOrResponse =
  | { readonly ok: true; readonly actor: CmsActor }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Resolve the verified actor before any validation, read, or write.
 *
 * Two distinct failures are kept distinct on purpose:
 * - `AuthorizationError` → canonical 401/403 (an authorization outcome).
 * - anything else (e.g. the users row cannot be read while the database is
 *   down) → the route's own sanitized 500. Reporting 401 would blame the
 *   caller for a server-side failure, and the thrown value carries SQL,
 *   parameters and the connection target, so it is classified and never
 *   echoed.
 */
export async function authenticateActor(
  failureMessage: string
): Promise<ActorOrResponse> {
  try {
    return { ok: true, actor: await requireActor() };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, response: authorizationFailureResponse(error) };
    }
    logOperationFailure("error", "auth.requireActor", error);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: failureMessage, code: "INTERNAL_ERROR" },
        { status: 500, headers: NO_STORE }
      ),
    };
  }
}
