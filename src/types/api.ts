/**
 * Frozen HTTP contract types (API_OWNERSHIP §2).
 *
 * Success: { success: true, data, meta? }
 * Failure: { success: false, error: { code, message, details? } }
 *
 * Repository B's { data, meta, error } envelope is explicitly rejected.
 */

export interface ApiMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export interface ApiErrorDetail {
  /** Dotted path to the offending field, when applicable. */
  path?: string;
  message: string;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponseBody<T> = ApiSuccess<T> | ApiFailure;
