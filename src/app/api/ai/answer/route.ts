/**
 * POST /api/ai/answer
 *
 * First AI tutor endpoint. Provider-neutral; calls
 * GroundedAnswerService.generateGroundedAnswer() and returns a normalized
 * JSON response with the answer, citations, sources, provider metadata,
 * safe usage telemetry, and the prompt version used.
 *
 * Status: DEVELOPMENT / PRE-AUTHENTICATION.
 *
 *   Authentication is NOT YET IMPLEMENTED for this endpoint. It is
 *   intended for local development and internal testing only. Do NOT
 *   deploy this to a publicly reachable production environment without
 *   first wiring session/user auth and rate limiting. Any client-supplied
 *   userId field is ignored (never trusted as identity).
 *
 * Method: POST only. GET/PUT/DELETE return 405.
 *
 * Request body (JSON):
 *   {
 *     query: string (required, 1..1000 chars after trim)
 *     jlptLevel?: "N5"|"N4"|"N3"|"N2"|"N1"
 *     domain?:    "dictionary"|"kanji"|"grammar"|"sentence"
 *     entityId?:  string     (requires domain)
 *     locale?:    "en"|"ja"  (default "en")
 *     requestId?: string     (correlation id; echoed back; not trusted)
 *   }
 *
 * Success response (200):
 *   {
 *     success: true,
 *     data: {
 *       answer, citations, knowledgeRefs, sources,
 *       grounded, chunkCount,
 *       provider: { id, model, responseId, finishReason },
 *       usage:    { inputTokens, outputTokens, totalTokens },
 *       promptVersion, requestId, locale, queryType
 *     }
 *   }
 *
 * Error responses (4xx/5xx):
 *   { success: false, error: { code, message, retryable? } }
 *   - 400 VALIDATION_ERROR        malformed JSON / empty or overlong query /
 *                                 bad JLPT / bad domain / bad locale
 *   - 405 METHOD_NOT_ALLOWED      non-POST method
 *   - 500 AI_PROVIDER_ERROR       provider failure (code/retryable from
 *                                 AIProviderError are surfaced; raw
 *                                 messages are NOT echoed verbatim)
 *   - 500 INTERNAL_ERROR          unexpected failure (message sanitized)
 *
 * Safety guarantees:
 *   - API keys and upstream error bodies never appear in responses.
 *   - AIProviderError messages are mapped to stable codes; the raw
 *     upstream message is NOT forwarded (prevents prompt/key leakage).
 *   - Arbitrary client-supplied `userId` is ignored and not logged.
 *   - No conversation persistence. Every request is stateless.
 */

import { NextRequest, NextResponse } from "next/server";

import { AIProviderError } from "@/services/ai/provider";
import type { KnowledgeDomain } from "@/services/ai/knowledgeRetriever";
import { KNOWLEDGE_DOMAINS } from "@/services/ai/knowledgeRetriever";
import { createGroundedAnswerService } from "@/services/ai/serviceFactory";
import { GroundedAnswerService } from "@/services/ai/groundedAnswerService";

export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 1000;
const VALID_JLPT = new Set(["N5", "N4", "N3", "N2", "N1"]);
const VALID_LOCALES = new Set(["en", "ja"]);

type ErrorCode =
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "AI_PROVIDER_ERROR"
  | "INTERNAL_ERROR";

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  opts: { retryable?: boolean; provider?: string } = {},
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(opts.retryable !== undefined ? { retryable: opts.retryable } : {}),
        ...(opts.provider ? { provider: opts.provider } : {}),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function validateBody(body: unknown):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }
  return { ok: true, value: body as Record<string, unknown> };
}

/**
 * Map an AIProviderError thrown by the service to a sanitized HTTP
 * response. We NEVER forward the raw error message verbatim because
 * adapter errors may include upstream responses that echo prompts.
 * Instead we return a stable, user-safe message keyed off the code,
 * plus the retryable flag so clients can decide to retry.
 */
function mapProviderError(err: AIProviderError): NextResponse {
  let status = 500;
  let userMessage = "The AI tutor is temporarily unavailable.";
  switch (err.code) {
    case "INVALID_REQUEST":
      status = 400;
      userMessage = "The request was rejected by the AI provider.";
      break;
    case "AUTHENTICATION_ERROR":
    case "CONFIGURATION_ERROR":
      // These are server misconfigurations — never leak which; just 500.
      status = 500;
      userMessage = "The AI tutor is temporarily unavailable.";
      break;
    case "RATE_LIMITED":
      status = 429;
      userMessage = "The AI tutor is busy right now. Please try again shortly.";
      break;
    case "TIMEOUT":
      status = 504;
      userMessage = "The AI tutor took too long to respond. Please try again.";
      break;
    case "PROVIDER_UNAVAILABLE":
      status = 503;
      userMessage = "The AI tutor is temporarily unavailable.";
      break;
    case "UPSTREAM_ERROR":
      status = 502;
      userMessage = "The AI tutor returned an unexpected error.";
      break;
    case "UNKNOWN_ERROR":
    default:
      status = 500;
      userMessage = "The AI tutor encountered an unexpected error.";
  }
  return errorResponse(
    status === 400 ? "VALIDATION_ERROR" : "AI_PROVIDER_ERROR",
    userMessage,
    status,
    { retryable: err.retryable, provider: err.provider },
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  // 1. Parse JSON; reject malformed bodies with 400.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      "VALIDATION_ERROR",
      "Request body must be valid JSON.",
      400,
    );
  }

  const parsed = validateBody(body);
  if (!parsed.ok) {
    return errorResponse("VALIDATION_ERROR", parsed.message, 400);
  }
  const b = parsed.value;

  // 2. Validate query.
  const queryRaw = b.query;
  if (typeof queryRaw !== "string") {
    return errorResponse(
      "VALIDATION_ERROR",
      "Field 'query' is required and must be a string.",
      400,
    );
  }
  const query = queryRaw.trim();
  if (query.length === 0) {
    return errorResponse("VALIDATION_ERROR", "Field 'query' must not be empty.", 400);
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return errorResponse(
      "VALIDATION_ERROR",
      `Field 'query' must be at most ${MAX_QUERY_LENGTH} characters.`,
      400,
    );
  }

  // 3. Validate optional JLPT level.
  let jlptLevel: string | undefined;
  if (b.jlptLevel !== undefined && b.jlptLevel !== null && b.jlptLevel !== "") {
    if (typeof b.jlptLevel !== "string") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'jlptLevel' must be a string (N5..N1).",
        400,
      );
    }
    const normalized = b.jlptLevel.trim().toUpperCase();
    if (!VALID_JLPT.has(normalized)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Invalid 'jlptLevel'. Must be one of: ${[...VALID_JLPT].join(", ")}.`,
        400,
      );
    }
    jlptLevel = normalized;
  }

  // 4. Validate optional domain / entityId.
  let domain: KnowledgeDomain | undefined;
  if (b.domain !== undefined && b.domain !== null && b.domain !== "") {
    if (typeof b.domain !== "string") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'domain' must be a string.",
        400,
      );
    }
    const normalized = b.domain.trim().toLowerCase() as KnowledgeDomain;
    if (!(KNOWLEDGE_DOMAINS as readonly string[]).includes(normalized)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Invalid 'domain'. Must be one of: ${[...KNOWLEDGE_DOMAINS].join(", ")}.`,
        400,
      );
    }
    domain = normalized;
  }

  let entityId: string | undefined;
  if (b.entityId !== undefined && b.entityId !== null && b.entityId !== "") {
    if (typeof b.entityId !== "string") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'entityId' must be a string.",
        400,
      );
    }
    entityId = b.entityId.trim();
    if (entityId && !domain) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'entityId' requires 'domain' to be set.",
        400,
      );
    }
  }

  // 5. Validate optional locale.
  let locale: "en" | "ja" = "en";
  if (b.locale !== undefined && b.locale !== null && b.locale !== "") {
    if (typeof b.locale !== "string") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'locale' must be a string.",
        400,
      );
    }
    const normalized = b.locale.trim().toLowerCase();
    if (!VALID_LOCALES.has(normalized)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Invalid 'locale'. Must be one of: ${[...VALID_LOCALES].join(", ")}.`,
        400,
      );
    }
    locale = normalized as "en" | "ja";
  }

  // 6. requestId — optional string, echoed back; never used for identity.
  let requestId: string | undefined;
  if (b.requestId !== undefined && b.requestId !== null && b.requestId !== "") {
    if (typeof b.requestId !== "string") {
      return errorResponse(
        "VALIDATION_ERROR",
        "Field 'requestId' must be a string when provided.",
        400,
      );
    }
    requestId = b.requestId.trim().slice(0, 128);
  } else {
    // Generate a server-side correlation id so errors can be traced.
    requestId = `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // Explicitly ignore any client-supplied userId. Auth is not implemented.
  // (We don't even read it into a variable.)

  // 7. Invoke the service.
  let service: GroundedAnswerService;
  try {
    service = createGroundedAnswerService();
  } catch (err) {
    // Configuration-time failures (missing AI_PROVIDER/AI_PROMPT_VERSION/key).
    console.error("[api/ai/answer] failed to construct service:", err);
    if (err instanceof AIProviderError) return mapProviderError(err);
    return errorResponse(
      "INTERNAL_ERROR",
      "The AI tutor is not configured.",
      500,
    );
  }

  try {
    const result = await service.generateGroundedAnswer({
      query,
      jlptLevel,
      domain,
      entityId,
      locale,
      requestId,
    });

    // 8. Strip any fields that might accidentally leak upstream detail.
    //    The service already returns a clean shape; we additionally
    //    collapse usage to the safe fields.
    const safeUsage = result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        }
      : undefined;

    return NextResponse.json(
      {
        success: true,
        data: {
          answer: result.answer,
          citations: result.citations,
          knowledgeRefs: result.knowledgeRefs,
          sources: result.sources,
          grounded: result.grounded,
          chunkCount: result.chunkCount,
          provider: result.provider,
          usage: safeUsage,
          promptVersion: result.promptVersion,
          requestId: result.requestId,
          locale: result.locale,
          queryType: result.queryType,
        },
        // Endpoint is development-only and responses may vary per request.
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/ai/answer] request failed:", {
      requestId,
      code: err instanceof AIProviderError ? err.code : undefined,
    });
    if (err instanceof AIProviderError) return mapProviderError(err);
    if (isAbortLike(err)) {
      // Client disconnected — return non-cachable 504, no body leak.
      return errorResponse(
        "AI_PROVIDER_ERROR",
        "The request was cancelled.",
        504,
      );
    }
    return errorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while generating an answer.",
      500,
    );
  }
}

function isAbortLike(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handlePost(request);
}

/** Disallow non-POST methods with a normalised 405. */
function methodNotAllowed(): NextResponse {
  return errorResponse(
    "METHOD_NOT_ALLOWED",
    "Method not allowed. Use POST.",
    405,
  );
}

export async function GET(_request: NextRequest) { return methodNotAllowed(); }
export async function PUT(_request: NextRequest) { return methodNotAllowed(); }
export async function PATCH(_request: NextRequest) { return methodNotAllowed(); }
export async function DELETE(_request: NextRequest) { return methodNotAllowed(); }


