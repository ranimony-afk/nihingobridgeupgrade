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
  // Log server-side errors
  console.error(`🚨 API Error [${code ?? "ERROR"}]: ${error} (Status: ${status})`);
  return Response.json({ ok: false, error, code } satisfies ApiError, {
    status,
  });
}

/** Structured Error Codes (Phase 12 Completion) */
export const STRUCTURED_ERRORS = {
  DATABASE_UNAVAILABLE: { message: "Database unavailable", status: 503 },
  MIGRATION_MISSING: { message: "Migration missing", status: 500 },
  TABLE_NOT_FOUND: { message: "Table not found", status: 404 },
  PERMISSION_DENIED: { message: "Permission denied", status: 403 },
  VALIDATION_FAILED: { message: "Validation failed", status: 400 },
  CONNECTION_TIMEOUT: { message: "Connection timeout", status: 504 },
} as const;

export type StructuredErrorCode = keyof typeof STRUCTURED_ERRORS;

export function failWithCode(
  code: StructuredErrorCode,
  customMessage?: string
): Response {
  const err = STRUCTURED_ERRORS[code];
  return fail(customMessage || err.message, err.status, code);
}
