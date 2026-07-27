/**
 * Shared REST API helpers.
 *
 * All /api/v1/* routes return a consistent envelope:
 *   { ok: true, data: T }        // success
 *   { ok: false, error: string } // failure
 */

export {
  EDITORIAL_STATUSES,
  type EditorialStatus,
  isEditorialStatus,
  canTransition,
} from "@/shared/workflow";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: string; code?: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies ApiSuccess<T>, init);
}

export function fail(
  error: string,
  status = 400,
  code?: string,
): Response {
  return Response.json({ ok: false, error, code } satisfies ApiError, {
    status,
  });
}
