/**
 * CMS service errors — Phase 13.3B.
 *
 * CmsError covers service-level failures (validation, state, concurrency,
 * policy). Authentication/authorization failures are NOT represented here:
 * the service lets AuthorizationError (401/403) from @/lib/auth propagate
 * untouched so future API routes can map it directly.
 */

export type CmsErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "VERSION_CONFLICT"
  | "SELF_APPROVAL_FORBIDDEN";

export class CmsError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  readonly code: CmsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    status: 400 | 403 | 404 | 409,
    code: CmsErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CmsError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static validation(
    message: string,
    details?: Record<string, unknown>
  ): CmsError {
    return new CmsError(400, "VALIDATION_ERROR", message, details);
  }

  static notFound(entity: string, id: string): CmsError {
    return new CmsError(404, "NOT_FOUND", `${entity} not found: ${id}`, {
      id,
    });
  }

  static invalidTransition(from: string, to: string): CmsError {
    return new CmsError(
      400,
      "INVALID_TRANSITION",
      `Invalid CMS transition: ${from} -> ${to}.`,
      { from, to }
    );
  }

  static versionConflict(expected: number, actual: number): CmsError {
    return new CmsError(
      409,
      "VERSION_CONFLICT",
      `Version conflict: expected ${expected}, current is ${actual}. Reload and retry.`,
      { expected, actual }
    );
  }

  static selfApprovalForbidden(): CmsError {
    return new CmsError(
      403,
      "SELF_APPROVAL_FORBIDDEN",
      "The author cannot approve their own content. Use the explicit admin override operation if this is an emergency."
    );
  }
}
