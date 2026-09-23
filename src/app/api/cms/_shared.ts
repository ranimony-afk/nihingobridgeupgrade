import "server-only";

import { NextResponse } from "next/server";
import { AuthorizationError, toErrorPayload } from "@/lib/auth";
import { CmsError } from "@/services/cms";
import type { CmsAuditRecord } from "@/services/cms";

/**
 * Shared CMS API glue (13.5A dictionary slice, reused by 13.5C+).
 *
 * Thin by contract: routes pick whitelisted fields out of the transport,
 * enforce their slice scope, and delegate every decision to CmsService.
 * No lifecycle logic, no identity reads, no invented provenance here.
 * Error mapping follows docs/cms-api-boundary-contract-13-5A.md.
 */

/** Success envelope, matching the repository's API shape. */
export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Map service errors to HTTP responses. AuthorizationError keeps its
 * canonical 401/403 payload; CmsError keeps its status/code/message;
 * anything else becomes a generic 500 with no leaked internals.
 */
export function cmsErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    const payload = toErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
  if (error instanceof CmsError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status }
    );
  }
  console.error("CMS API unexpected error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    },
    { status: 500 }
  );
}

/** Parse a JSON object body. Malformed bodies are 400, never 500. */
export async function parseJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw CmsError.validation("Request body must be valid JSON.", {
      field: "body",
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw CmsError.validation("Request body must be a JSON object.", {
      field: "body",
    });
  }
  return parsed as Record<string, unknown>;
}

/**
 * Transport-level expectedVersion check: presence + integer shape.
 * The semantic compare against currentVersion stays inside CmsService.
 */
export function readExpectedVersion(body: Record<string, unknown>): number {
  const value = body.expectedVersion;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw CmsError.validation("expectedVersion must be an integer.", {
      field: "expectedVersion",
    });
  }
  return value;
}

/**
 * Public audit-event shape: explicit field whitelist. `ipAddress` is
 * stored for forensics but NEVER exposed over the API, and whitelisting
 * (rather than deleting one key) keeps future columns private by default.
 */
export interface PublicAuditEvent {
  readonly id: string;
  readonly contentItemId: string | null;
  readonly actorId: string;
  readonly action: string;
  readonly details: Record<string, unknown>;
  readonly occurredAt: Date;
}

export function sanitizeAuditEvents(
  events: readonly CmsAuditRecord[]
): PublicAuditEvent[] {
  return events.map((event) => ({
    id: event.id,
    contentItemId: event.contentItemId,
    actorId: event.actorId,
    action: event.action,
    details: event.details,
    occurredAt: event.occurredAt,
  }));
}

export type RouteParams = { params: Promise<{ id: string }> };

export async function routeId(params: RouteParams["params"]): Promise<string> {
  return (await params).id;
}
