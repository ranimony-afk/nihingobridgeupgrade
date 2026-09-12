/**
 * Typed application errors and their HTTP mapping.
 *
 * Services throw these; route handlers translate them into the frozen API
 * envelope. Internal details (SQL, stack traces, provider messages) must
 * never reach a client (API_OWNERSHIP §5).
 */

import type { ApiErrorCode, ApiErrorDetail } from "@/types/api";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function httpStatusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

/** Base class for every error that is safe to surface to a client. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details && details.length > 0) {
      this.details = details;
    }
  }

  get status(): number {
    return httpStatusForCode(this.code);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: ApiErrorDetail[]) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super("CONFLICT", message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super("RATE_LIMITED", message);
  }
}

/**
 * Convert any thrown value into a client-safe error.
 * Unknown failures are flattened to INTERNAL_ERROR so nothing leaks.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred");
}
