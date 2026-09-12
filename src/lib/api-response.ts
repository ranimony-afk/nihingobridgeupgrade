/**
 * Builders for the frozen API envelope (API_OWNERSHIP §2).
 *
 * Body builders are pure so they can be unit tested without a server.
 * The `json*` helpers use the Web-standard `Response`, which works in both
 * Next.js route handlers and plain Node.
 *
 * Note: GET /api/health is deliberately exempt — its `{ ok: true }` body
 * predates this envelope and is a frozen contract.
 */

import type {
  ApiErrorCode,
  ApiErrorDetail,
  ApiFailure,
  ApiMeta,
  ApiSuccess,
} from "@/types/api";
import { httpStatusForCode, toAppError } from "./errors.ts";

export interface MetaInput {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

/** Normalise partial meta into a complete, consistent ApiMeta. */
export function buildMeta(input: MetaInput = {}): ApiMeta {
  const { page: rawPage, pageSize: rawPageSize, total: rawTotal, ...rest } = input;

  const page = Math.max(1, Math.trunc(rawPage ?? 1));
  const pageSize = Math.max(1, Math.trunc(rawPageSize ?? 20));
  const total = Math.max(0, Math.trunc(rawTotal ?? 0));

  return {
    ...rest,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export function buildSuccess<T>(data: T, meta?: MetaInput): ApiSuccess<T> {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta: buildMeta(meta) };
}

export function buildFailure(
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): ApiFailure {
  const error: ApiFailure["error"] =
    details && details.length > 0 ? { code, message, details } : { code, message };
  return { success: false, error };
}

export function jsonSuccess<T>(
  data: T,
  meta?: MetaInput,
  init?: ResponseInit,
): Response {
  return Response.json(buildSuccess(data, meta), { status: 200, ...init });
}

export function jsonFailure(
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
  init?: ResponseInit,
): Response {
  return Response.json(buildFailure(code, message, details), {
    status: httpStatusForCode(code),
    ...init,
  });
}

/** Terminal handler: turn any thrown value into a safe HTTP response. */
export function jsonFromError(error: unknown): Response {
  const appError = toAppError(error);
  return jsonFailure(appError.code, appError.message, appError.details);
}
