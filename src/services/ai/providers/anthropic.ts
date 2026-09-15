/**
 * AnthropicProvider — production adapter for the Anthropic Messages API.
 *
 * Phase 13.3D. Implements the canonical AIProvider interface using a
 * minimal server-side HTTP adapter over native fetch (Node 18+ / Next.js
 * runtime). No third-party Anthropic SDK is required, keeping client
 * bundle weight at zero and avoiding an additional dependency.
 *
 * Safety invariants (enforced by this module):
 *   - Server-only (imports "server-only").
 *   - Never reads ANTHROPIC_API_KEY on the client.
 *   - Never logs API keys, system prompts, messages, grounding context,
 *     or full upstream error bodies. Log lines are prefixed with
 *     "[ai:anthropic]" and carry only correlation ids, status codes,
 *     model, providerResponseId, token counts, and error codes.
 *   - Requires AI_PROVIDER=anthropic to be selected explicitly; no
 *     automatic discovery/fallback (enforced by factory.ts).
 *   - Fails closed on misconfiguration, non-2xx responses, malformed
 *     JSON, timeout, and AbortSignal cancellation.
 *   - AbortSignal and AI_REQUEST_TIMEOUT_MS are both honored; whichever
 *     fires first wins.
 *
 * Mapping to canonical contract:
 *   - 401 → AUTHENTICATION_ERROR (retryable=false)
 *   - 403 → AUTHENTICATION_ERROR (retryable=false)
 *   - 429 → RATE_LIMITED (retryable=true)
 *   - 500 / 502 / 503 → UPSTREAM_ERROR / PROVIDER_UNAVAILABLE (retryable=true)
 *   - 400 / 422 → INVALID_REQUEST (retryable=false)
 *   - AbortError from our own timeout controller → TIMEOUT (retryable=true)
 *   - AbortError from caller's signal → DOMException("AbortError") pass-through
 *   - Network/DNS failures → PROVIDER_UNAVAILABLE (retryable=true)
 *   - Malformed/non-JSON / unexpected shape → UNKNOWN_ERROR (retryable=false)
 *
 * Streaming is intentionally not supported in this phase (the contract
 * only exposes chat()).
 */

import "server-only";

import {
  AIErrors,
  AIProviderError,
} from "@/services/ai/provider";
import type {
  AIErrorOptions,
  AIProvider,
  ChatRequest,
  ChatResponse,
  FinishReason,
  TokenUsage,
} from "@/services/ai/provider";

/* ============================================================
 * Configuration
 * ============================================================ */

const DEFAULT_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_TIMEOUT_MS = 45_000;
const API_VERSION = "2023-06-01";

/** Upper bound on the length of a safe log line excerpt. */
const SAFE_LOG_MAX = 160;

export interface AnthropicProviderOptions {
  /** API key. Required; read from ANTHROPIC_API_KEY by default. */
  apiKey?: string;
  /** Model id. Defaults to ANTHROPIC_MODEL or "claude-sonnet-4-5". */
  model?: string;
  /** Override endpoint (for tests or proxies). Defaults to ANTHROPIC_API_URL. */
  apiUrl?: string;
  /** Per-request timeout (ms). Defaults to AI_REQUEST_TIMEOUT_MS or 45000. */
  timeoutMs?: number;
  /**
   * Optional fetch injection for tests. Production callers never set this;
   * the adapter uses the runtime's global fetch when omitted.
   */
  fetchImpl?: typeof globalThis.fetch;
}

/* ============================================================
 * Construction
 * ============================================================ */

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(opts: AnthropicProviderOptions = {}) {
    const envApiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    const apiKey = (opts.apiKey ?? envApiKey).trim();
    if (!apiKey) {
      throw AIErrors.authentication(
        "Anthropic adapter requires ANTHROPIC_API_KEY to be set.",
        { provider: "anthropic" },
      );
    }
    this.apiKey = apiKey;

    const envModel = (process.env.ANTHROPIC_MODEL ?? "").trim();
    this.model = (opts.model ?? (envModel || DEFAULT_MODEL)).trim();

    const envUrl = (process.env.ANTHROPIC_API_URL ?? "").trim();
    this.apiUrl = (opts.apiUrl ?? (envUrl || DEFAULT_API_URL)).trim();

    const rawTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS);
    const envTimeout =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;
    const timeoutMs = opts.timeoutMs ?? envTimeout;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw AIErrors.configuration(
        "AI_REQUEST_TIMEOUT_MS must be a positive number of milliseconds.",
        { provider: "anthropic" },
      );
    }
    this.timeoutMs = timeoutMs;

    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    if (typeof this.fetchImpl !== "function") {
      throw AIErrors.configuration(
        "Anthropic adapter requires a global fetch implementation (Node 18+ or Next.js edge/server runtime).",
        { provider: "anthropic" },
      );
    }
  }

  /* ============================================================
   * Public API
   * ============================================================ */

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Pre-abort fast path: caller already cancelled before we even start.
    if (request.signal?.aborted) {
      throwAbort(request.signal);
    }

    // Compose a combined AbortController that fires on (a) the caller's
    // signal or (b) our per-request timeout. We MUST distinguish the two
    // cases so timeout surfaces as TIMEOUT (retryable=true) rather than
    // as a pass-through AbortError.
    const controller = new AbortController();
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let callerAbortHandler: (() => void) | undefined;
    let timedOut = false;

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (callerAbortHandler && request.signal) {
        request.signal.removeEventListener("abort", callerAbortHandler);
      }
    };

    if (request.signal) {
      callerAbortHandler = () => controller.abort(request.signal!.reason);
      if (request.signal.aborted) {
        controller.abort(request.signal.reason);
      } else {
        request.signal.addEventListener("abort", callerAbortHandler, { once: true });
      }
    }

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("anthropic request timed out", "TimeoutError"));
    }, this.timeoutMs);

    const { body } = this.buildRequestBody(request);
    const logCtx = buildLogCtx(request, this.model);

    let response: Response;
    let responseText = "";
    try {
      this.log("request", logCtx, {
        // Log only coarse request shape — never content.
        groundingChunks: request.context?.chunkCount,
        groundingTokens: request.context?.estimatedTokens,
        messageCount: request.messages.length,
        maxTokens: request.options?.maxTokens,
        temperature: request.options?.temperature,
        timeoutMs: this.timeoutMs,
      });

      response = await this.fetchImpl(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
          // We don't send beta headers; we use the stable Messages API.
          ...(request.requestId
            ? { "x-request-id": request.requestId }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Never follow non-HTTP redirects that could leak the API key.
        redirect: "error",
        // Keep credentials off; the API key is in the x-api-key header.
        credentials: "omit",
      });
    } catch (err) {
      cleanup();
      if (isAbortError(err)) {
        if (timedOut) {
          this.log("error", logCtx, { code: "TIMEOUT" });
          throw AIErrors.timeout(
            `Anthropic request timed out after ${this.timeoutMs}ms.`,
            { provider: "anthropic" },
          );
        }
        // Caller cancelled → surface as a DOMException(AbortError),
        // matching the contract's expectation for intentional cancellation.
        throwAbort(request.signal);
      }
      // Network-level failure (DNS, connection refused, etc.).
      this.log("error", logCtx, { code: "PROVIDER_UNAVAILABLE", kind: "network" });
      throw AIErrors.unavailable(
        "Anthropic API could not be reached (network error).",
        { provider: "anthropic", cause: redactCause(err) },
      );
    }

    // Read body even for non-2xx so we can map Anthropic's error JSON.
    try {
      responseText = await response.text();
    } catch (readErr) {
      cleanup();
      this.log("error", logCtx, { code: "UNKNOWN_ERROR", kind: "body-read-failed", status: response.status });
      throw AIErrors.unknown("Failed to read Anthropic response body.", {
        provider: "anthropic",
        status: response.status,
        cause: redactCause(readErr),
      });
    }
    cleanup();

    if (!response.ok) {
      throw this.mapErrorResponse(response.status, responseText, logCtx);
    }

    const parsed = this.parseSuccess(responseText, logCtx);
    const chatResponse = this.mapResponse(parsed, request, logCtx);
    this.log("response", logCtx, {
      providerResponseId: chatResponse.providerResponseId,
      finishReason: chatResponse.finishReason,
      inputTokens: chatResponse.usage?.inputTokens,
      outputTokens: chatResponse.usage?.outputTokens,
    });
    return chatResponse;
  }

  /* ============================================================
   * Request mapping
   * ============================================================ */

  private buildRequestBody(request: ChatRequest): {
    body: Record<string, unknown>;
  } {
    // Anthropic separates `system` from the `messages` array, and requires
    // the final message to be a user turn. We mirror that faithfully.
    //
    // Grounded context is appended to the system prompt so it participates
    // in every turn without confusing message-role alternation. This
    // matches how production RAG systems typically handle retrieved
    // context, and avoids the "messages must alternate user/assistant"
    // errors when grounding is passed as a user-visible message.
    const systemParts: string[] = [];
    if (request.system) systemParts.push(request.system);
    if (request.context?.text) {
      systemParts.push(
        `<grounding-context chunks="${request.context.chunkCount ?? 0}" estimated-tokens="${request.context.estimatedTokens ?? 0}">\n${request.context.text}\n</grounding-context>`,
      );
    }
    const system = systemParts.join("\n\n");

    // Strip system messages from the `messages` array; we handle them via
    // the top-level `system` field.
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const maxTokens = request.options?.maxTokens ?? 1024;

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages,
      ...(system ? { system } : {}),
    };

    if (request.options?.temperature !== undefined) {
      body.temperature = request.options.temperature;
    }
    if (request.options?.topP !== undefined) {
      body.top_p = request.options.topP;
    }

    if (request.options?.responseFormat?.type === "json") {
      // Anthropic's Messages API does not have a dedicated JSON mode
      // analogous to OpenAI's; the documented idiom is to instruct the
      // model in the system prompt. We append a deterministic instruction
      // that the response must be valid JSON only. Callers can still add
      // their own schema in the system prompt; we do not inspect the
      // schema object to avoid leaking it in logs.
      body.system =
        (system ? `${system}\n\n` : "") +
        "Respond with valid JSON only. No preamble, no markdown fences, no trailing prose.";
    }

    // Attach metadata so upstream logs can correlate with our requestId.
    // Anthropic allows a `metadata` object with a `user_id` field plus
    // arbitrary string key/values in newer versions; we stick to
    // `metadata.user_id` (requestId) which is universally accepted.
    if (request.requestId) {
      body.metadata = { user_id: request.requestId };
    }

    return { body };
  }

  /* ============================================================
   * Response parsing
   * ============================================================ */

  private parseSuccess(text: string, ctx: LogCtx): AnthropicMessageResponse {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.log("error", ctx, { code: "UNKNOWN_ERROR", kind: "invalid-json" });
      throw AIErrors.unknown("Anthropic returned a non-JSON response.", {
        provider: "anthropic",
        status: 200,
      });
    }
    if (!isRecord(json)) {
      this.log("error", ctx, { code: "UNKNOWN_ERROR", kind: "non-object-json" });
      throw AIErrors.unknown("Anthropic response was not a JSON object.", {
        provider: "anthropic",
        status: 200,
      });
    }
    const msg = json as unknown as AnthropicMessageResponse;
    if (typeof msg.id !== "string" || !Array.isArray(msg.content)) {
      this.log("error", ctx, {
        code: "UNKNOWN_ERROR",
        kind: "missing-id-or-content",
        hasId: typeof msg.id,
        contentIsArray: Array.isArray(msg.content),
      });
      throw AIErrors.unknown(
        "Anthropic response was missing required fields (id, content).",
        { provider: "anthropic", status: 200 },
      );
    }
    return msg;
  }

  private mapResponse(
    msg: AnthropicMessageResponse,
    request: ChatRequest,
    ctx: LogCtx,
  ): ChatResponse {
    // Concatenate text blocks; skip any tool_use blocks (we don't issue
    // tool calls in this phase — if they appear it's provider drift).
    const textParts: string[] = [];
    let toolBlockCount = 0;
    for (const block of msg.content) {
      if (block && typeof block === "object" && block.type === "text") {
        if (typeof block.text === "string") textParts.push(block.text);
      } else if (block && typeof block === "object" && block.type === "tool_use") {
        toolBlockCount += 1;
      }
    }

    if (textParts.length === 0 && toolBlockCount === 0) {
      this.log("error", ctx, { code: "UNKNOWN_ERROR", kind: "no-text-blocks" });
      throw AIErrors.unknown(
        "Anthropic response contained no text blocks and no tool_use blocks.",
        { provider: "anthropic", status: 200 },
      );
    }

    const text = textParts.join("");

    const usage: TokenUsage = {
      inputTokens:
        typeof msg.usage?.input_tokens === "number" ? msg.usage.input_tokens : undefined,
      outputTokens:
        typeof msg.usage?.output_tokens === "number" ? msg.usage.output_tokens : undefined,
      breakdown: msg.usage?.cache_creation_input_tokens !== undefined ||
        msg.usage?.cache_read_input_tokens !== undefined
        ? {
            cacheCreationInputTokens: msg.usage.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: msg.usage.cache_read_input_tokens ?? 0,
          }
        : undefined,
    };
    if (usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
      usage.totalTokens = usage.inputTokens + usage.outputTokens;
    }

    let parsedJson: unknown;
    if (request.options?.responseFormat?.type === "json" && text.trim()) {
      try {
        parsedJson = JSON.parse(stripJsonFences(text));
      } catch {
        this.log("error", ctx, {
          code: "UPSTREAM_ERROR",
          kind: "json-mode-non-json-output",
          // Never log the actual text in production; include length only.
          responseLength: text.length,
        });
        throw AIErrors.upstream(
          "Anthropic returned non-JSON output when JSON mode was requested.",
          { provider: "anthropic", status: 200 },
        );
      }
    }

    return {
      text,
      json: parsedJson,
      provider: this.id,
      model: msg.model ?? this.model,
      finishReason: mapFinishReason(msg.stop_reason, msg.stop_sequence),
      usage,
      requestId: request.requestId,
      providerResponseId: msg.id,
    };
  }

  /* ============================================================
   * Error mapping
   * ============================================================ */

  private mapErrorResponse(
    status: number,
    text: string,
    ctx: LogCtx,
  ): never {
    // Anthropic errors are JSON: { type: "error", error: { type, message } }
    let errorType: string | undefined;
    let errorMessage: string | undefined;
    try {
      const parsed = JSON.parse(text) as {
        error?: { type?: string; message?: string };
      };
      if (parsed?.error) {
        errorType = parsed.error.type;
        errorMessage = parsed.error.message;
      }
    } catch {
      // Non-JSON error body (HTML gateway page, etc.) — treat as upstream.
    }

    // Safe-log without leaking the error body (Anthropic echoes request
    // content in many validation/error messages, which we must never log).
    // We log only the status, Anthropic error type, and body LENGTH.
    // There is no verbose flag that bypasses this — body content never
    // reaches logs, period.
    this.log("error", ctx, {
      status,
      anthropicErrorType: errorType,
      bodyLength: typeof text === "string" ? text.length : 0,
    });

    const base: Partial<AIErrorOptions> = {
      provider: "anthropic",
      status,
    };

    // Map Anthropic error types: https://docs.anthropic.com/en/api/errors
    const et = errorType ?? "";

    // Status-class overrides take precedence over type, since gateway
    // responses (502/503/504) frequently come without an Anthropic-style
    // JSON body and should still be classified as UNAVAILABLE.
    if (status === 502 || status === 503 || status === 504 || et === "overloaded_error") {
      throw AIErrors.unavailable("Anthropic is temporarily unavailable.", base);
    }
    if (et === "authentication_error" || status === 401 || status === 403) {
      throw AIErrors.authentication(
        "Anthropic authentication failed (check ANTHROPIC_API_KEY).",
        base,
      );
    }
    if (et === "rate_limit_error" || status === 429) {
      throw AIErrors.rateLimited("Anthropic rate limit exceeded.", base);
    }
    if (
      et === "invalid_request_error" ||
      status === 400 ||
      status === 422
    ) {
      throw AIErrors.invalidRequest(
        "Anthropic rejected the request as invalid.",
        base,
      );
    }
    if (et === "api_error" || status >= 500) {
      throw AIErrors.upstream("Anthropic returned an internal server error.", base);
    }

    // Catch-all for any other non-2xx we didn't recognize.
    throw AIErrors.unknown(
      `Anthropic returned an unexpected status ${status}.`,
      { ...base, cause: redactCause({ anthropicErrorType: errorType }) },
    );
  }

  /* ============================================================
   * Safe logging
   * ============================================================ */

  private log(
    event: "request" | "response" | "error",
    ctx: LogCtx,
    fields: Record<string, unknown>,
  ): void {
    // In serverless/test environments console may be unavailable; guard.
    if (typeof console === "undefined") return;

    // Avoid noisy per-call logs in test environments unless explicitly
    // enabled via AI_DEBUG_LOGS.
    if (process.env.NODE_ENV === "test" && !process.env.AI_DEBUG_LOGS) return;

    const line = {
      event,
      provider: "anthropic",
      model: ctx.model,
      requestId: ctx.requestId,
      promptVersion: ctx.promptVersion,
      ...fields,
    };
    // Use the appropriate level. Keep output one-line for easy parsing.
    const msg = `[ai:anthropic] ${event} ${safeStringify(line)}`;
    if (event === "error") console.error(msg);
    else console.info(msg);
  }
}

/* ============================================================
 * Types for the Anthropic wire format
 * ============================================================ */

interface AnthropicContentBlock {
  type: "text" | "tool_use" | string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  id: string;
  type?: string;
  role?: string;
  content: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/* ============================================================
 * Helpers
 * ============================================================ */

interface LogCtx {
  requestId?: string;
  promptVersion: string;
  model: string;
}

function buildLogCtx(request: ChatRequest, model: string): LogCtx {
  return {
    requestId: request.requestId,
    promptVersion: request.promptVersion,
    model,
  };
}

function mapFinishReason(
  stopReason: string | null | undefined,
  stopSequence: string | null | undefined,
): FinishReason {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      // Anthropic stopped because we hit a user-supplied stop sequence —
      // the contract treats that as a normal stop.
      void stopSequence;
      return "stop";
    case "tool_use":
      return "tool_call";
    default:
      return "unknown";
  }
}

function stripJsonFences(s: string): string {
  const trimmed = s.trim();
  // Anthropic sometimes wraps JSON in ```json ... ``` despite instructions
  // not to — be lenient on input but strict on output semantics.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const m = trimmed.match(fence);
  return m ? m[1].trim() : trimmed;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  if (err instanceof Error && err.name === "AbortError") return true;
  // Node 18+ fetch throws a TypeError with code === 'UND_ERR_ABORTED'
  // when the signal fires; newer versions throw DOMException. Handle both.
  if (
    err instanceof Error &&
    (err as { code?: string }).code === "UND_ERR_ABORTED"
  ) {
    return true;
  }
  return false;
}

function throwAbort(signal: AbortSignal | undefined): never {
  const reason = signal?.reason instanceof Error ? signal.reason.message : "aborted";
  throw new DOMException(reason, "AbortError");
}

/**
 * Never let raw upstream errors flow to logs — they may contain request
 * echoes. Strip to name/message only, dropping stacks, cause chains,
 * response bodies, and any headers we might have collected.
 */
function redactCause(err: unknown): { name?: string; message?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: safePreview(err.message) };
  }
  if (typeof err === "string") return { message: safePreview(err) };
  return {};
}

function safePreview(s: string | undefined | null): string {
  if (!s) return "";
  // Redact anything that looks like an Anthropic/OpenAI/Bearer key so
  // that even if a response body preview leaks, secrets don't.
  const redacted = String(s).replace(
    /(sk-[A-Za-z0-9_-]{16,}|x-api-key\s*[:=]\s*\S+|Bearer\s+\S+)/gi,
    "[REDACTED]",
  );
  return redacted.slice(0, SAFE_LOG_MAX);
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === "string") return safePreview(value);
      return value;
    });
  } catch {
    return "[unserializable]";
  }
}


