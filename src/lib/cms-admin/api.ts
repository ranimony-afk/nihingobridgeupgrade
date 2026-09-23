/**
 * CMS admin API client — Phase 13.5B.
 *
 * Client-safe fetch wrapper over the 13.5A routes. Same-origin requests
 * carry the session cookie; no identity is ever attached by the client
 * (no userId, no role, no custom headers — the server derives the actor).
 * All failures map to display-safe kinds; server internals never render.
 */

export const CMS_DICTIONARY_API = "/api/cms/dictionary";
export const CMS_TRANSLATIONS_API = "/api/cms/translations";

/** Exact 409 copy mandated by the phase spec. */
export const VERSION_CONFLICT_MESSAGE =
  "This content was changed by another user. Reload before saving.";

export const SESSION_EXPIRED_MESSAGE =
  "Session expired — please sign in again.";

export type ApiFailureKind =
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "validation"
  | "notFound"
  | "server";

export interface ApiFailure {
  readonly kind: ApiFailureKind;
  readonly status: number;
  readonly code: string;
  /** Display-safe message (server text only where the contract proves safe). */
  readonly message: string;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; failure: ApiFailure };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Interpret an API response. Pure and total: unknown shapes and unknown
 * statuses degrade to generic kinds, never to raw server text.
 */
export function interpretApiResponse(
  status: number,
  body: unknown
): ApiResult<unknown> {
  const envelope = asRecord(body);
  if (status >= 200 && status < 300 && envelope.success === true) {
    return { ok: true, status, data: envelope.data };
  }
  const error = asRecord(envelope.error);
  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const serverMessage =
    typeof error.message === "string" ? error.message : "";

  switch (status) {
    case 401:
      return {
        ok: false,
        status,
        failure: {
          kind: "unauthorized",
          status,
          code,
          message: SESSION_EXPIRED_MESSAGE,
        },
      };
    case 403:
      return {
        ok: false,
        status,
        failure: {
          kind: "forbidden",
          status,
          code,
          // 403 messages are contract-safe (permission denial or the
          // self-approval policy sentence) — show the server's wording.
          message: serverMessage !== "" ? serverMessage : "Permission denied.",
        },
      };
    case 404:
      return {
        ok: false,
        status,
        failure: {
          kind: "notFound",
          status,
          code,
          message: "This item was not found. It may have been removed.",
        },
      };
    case 409:
      return {
        ok: false,
        status,
        failure: {
          kind: "conflict",
          status,
          code,
          message: VERSION_CONFLICT_MESSAGE,
        },
      };
    default:
      break;
  }
  // Validation failures are 400 in this codebase; 422 is accepted too so a
  // future API tightening cannot surface as a cryptic 500-class state.
  if (status === 400 || status === 422) {
    return {
      ok: false,
      status,
      failure: {
        kind: "validation",
        status,
        code,
        message:
          serverMessage !== ""
            ? serverMessage
            : "Some fields need attention before saving.",
      },
    };
  }
  return {
    ok: false,
    status,
    failure: {
      kind: "server",
      status,
      code,
      message: "Unexpected server error. Please try again.",
    },
  };
}

/** POST/PATCH/GET JSON against the CMS API. Network faults → server kind. */
export async function cmsRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      ...(options.body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(options.body),
          }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      failure: {
        kind: "server",
        status: 0,
        code: "NETWORK_ERROR",
        message: "Could not reach the server. Check your connection.",
      },
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return interpretApiResponse(response.status, body) as ApiResult<T>;
}
