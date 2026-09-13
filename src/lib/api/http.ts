import { NextResponse } from "next/server";

/**
 * Shared HTTP contract for the NihongoBridge JSON API.
 *
 * Every grammar endpoint answers with the same envelope so the web app and the
 * Flutter client can share one typed decoder:
 *
 *   success -> { data: <payload>, meta: { requestId, tookMs, apiVersion, … } }
 *   failure -> { error: { code, message, details? }, meta: { requestId, … } }
 */

export const API_VERSION = "1";

export interface ApiMeta {
  requestId: string;
  tookMs?: number;
  apiVersion: string;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
  [key: string]: unknown;
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
};

function requestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now().toString(36)}`;
  }
}

function baseMeta(meta: Partial<ApiMeta> = {}): ApiMeta {
  return { requestId: requestId(), apiVersion: API_VERSION, ...meta };
}

export function jsonOk<T>(
  data: T,
  options: {
    meta?: Partial<ApiMeta>;
    cacheSeconds?: number;
    staleSeconds?: number;
    status?: number;
  } = {},
): NextResponse {
  const { meta = {}, cacheSeconds = 60, staleSeconds = 300, status = 200 } = options;
  const response = NextResponse.json(
    { data, meta: baseMeta(meta) },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "cache-control": `public, max-age=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`,
        "x-api-version": API_VERSION,
      },
    },
  );
  return response;
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) }, meta: baseMeta() },
    {
      status,
      headers: { ...CORS_HEADERS, "cache-control": "no-store", "x-api-version": API_VERSION },
    },
  );
}

export const notFound = (resource: string) =>
  jsonError(404, "not_found", `${resource} was not found`);

export const badRequest = (message: string, details?: unknown) =>
  jsonError(400, "invalid_request", message, details);

/** Adds CORS + rate-limit headers to an already built response. */
export function withHeaders(
  response: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

/** Pre-flight handler for browser / Flutter web clients. */
export function optionsHandler(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function paginationMeta(
  total: number,
  limit: number,
  offset: number,
): ApiMeta["pagination"] {
  const hasMore = offset + limit < total;
  return {
    limit,
    offset,
    total,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}
