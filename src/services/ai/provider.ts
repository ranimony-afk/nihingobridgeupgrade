/**
 * AIProvider — provider-neutral contract for text generation.
 *
 * Phase 13.3B foundation. This file defines the ONLY canonical port between
 * the NihongoBridge AI orchestration layer and downstream model providers.
 *
 * Rules:
 *   - NO provider SDK is imported anywhere in this file or in orchestration.
 *   - All request/response/error types are provider-neutral.
 *   - Provider selection is EXPLICIT via `AI_PROVIDER` env var; there is no
 *     "if key exists use X else fall back" logic anywhere.
 *   - Provider adapters live in `src/services/ai/providers/<name>.ts` and
 *     are the only modules permitted to import vendor SDKs.
 *   - This module is server-only. It must never be imported by a Client
 *     Component; the "server-only" import enforces that at build time.
 */

import "server-only";

/* ============================================================
 * Provider identification
 * ============================================================ */

/**
 * Canonical provider identifiers. Adding a real vendor means adding an
 * entry here AND creating an adapter in src/services/ai/providers/. The
 * "mock" provider is always available but must be explicitly selected.
 *
 * Phase 13.3B ships with the mock adapter only. "anthropic" is a
 * recognized, designed-for id; selecting it fails CLOSED with a clear
 * CONFIGURATION_ERROR until the Anthropic adapter lands in a subsequent
 * phase. Additional providers (e.g. openai) will add their id here when
 * their adapter is introduced.
 */
export const AI_PROVIDERS = ["mock", "anthropic"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

/* ============================================================
 * Request
 * ============================================================ */

/** One turn of a conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Desired response shape. Adapters that cannot honour a requested format
 * MUST throw INVALID_REQUEST rather than silently return plain text.
 * Phase 13.3B only guarantees text mode; "json" is a forward-compatible
 * hook for structured generation in a subsequent phase.
 */
export type ResponseFormat =
  | { type: "text" }
  | { type: "json"; schema?: unknown };

/** Provider-neutral generation knobs. Adapters map these to vendor params. */
export interface GenerationOptions {
  /** Upper bound on generated tokens. Provider default when omitted. */
  maxTokens?: number;
  /** Sampling temperature, 0–2 range. Provider default when omitted. */
  temperature?: number;
  /** Nucleus sampling, 0–1 range. Provider default when omitted. */
  topP?: number;
  /** Response-format hint for structured generation. Defaults to text. */
  responseFormat?: ResponseFormat;
}

/**
 * A single grounded context block produced by KnowledgeRetriever. The
 * orchestration layer passes these through verbatim; adapters may format
 * them but must not drop them when grounding is requested.
 */
export interface GroundedContext {
  /** Pre-formatted citation-tagged text (KnowledgeChunk.contextText). */
  text: string;
  /** Estimated tokens, useful for adapter budget checks. */
  estimatedTokens?: number;
  /** Number of chunks backing the context block. */
  chunkCount?: number;
}

/** Provider-neutral chat request assembled by the orchestration layer. */
export interface ChatRequest {
  /** System-level instruction (persona + task framing). */
  system: string;
  /** Conversation messages. The final `user` turn is the learner's input. */
  messages: ChatMessage[];
  /** Grounded knowledge retrieved by KnowledgeRetriever, if any. */
  context?: GroundedContext;
  /** Provider-neutral generation knobs. */
  options?: GenerationOptions;
  /**
   * Prompt-version tag (from AI_PROMPT_VERSION). Adapters MUST forward this
   * to upstream metadata/logging when supported; they MUST NOT branch on it.
   */
  promptVersion: string;
  /** Correlation id for observability (e.g. request id from the route). */
  requestId?: string;
  /** Abort signal for timeout/cancellation propagation. */
  signal?: AbortSignal;
}

/* ============================================================
 * Response
 * ============================================================ */

export type FinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "tool_call"
  | "unknown";

/** Token usage telemetry. All fields optional — providers differ. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Provider-specific breakdown (e.g. cache read/write) when present. */
  breakdown?: Record<string, number>;
}

/** Provider-neutral chat response. */
export interface ChatResponse {
  /** The generated text, ready for downstream presentation. */
  text: string;
  /**
   * Structured payload when the request asked for responseFormat.type="json"
   * AND the adapter supports JSON mode. Adapters MUST set this to a parsed
   * JSON value (not a string) when available, so orchestration can rely on
   * it without reparsing. Phase 13.3B mock leaves this undefined.
   */
  json?: unknown;
  /** Provider identifier (matches the adapter that produced this). */
  provider: AIProviderId;
  /** Model identifier the adapter resolved for this request. */
  model: string;
  /** Why generation stopped, when the provider reports one. */
  finishReason?: FinishReason;
  /** Usage telemetry, when available. */
  usage?: TokenUsage;
  /** Echoed correlation id. */
  requestId?: string;
  /** Provider-generated response id, when available (e.g. Anthropic msg id). */
  providerResponseId?: string;
}

/* ============================================================
 * Error taxonomy
 * ============================================================ */

export type AIErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export interface AIErrorOptions {
  code: AIErrorCode;
  message: string;
  /** Whether the caller may safely retry the same request. */
  retryable: boolean;
  /** Provider identifier, if known at error time. */
  provider?: AIProviderId;
  /** HTTP status received from upstream, if any. */
  status?: number;
  /** Cause chain (redacted — never raw upstream payloads with secrets). */
  cause?: unknown;
}

/**
 * Canonical error type for all provider failures. Classifies failures so
 * orchestration can decide retry/circuit-break logic without knowing which
 * vendor produced them.
 */
export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly provider?: AIProviderId;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(options: AIErrorOptions) {
    super(options.message);
    this.name = "AIProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.provider = options.provider;
    this.status = options.status;
    this.cause = options.cause;
  }

  /** Sanitized JSON for logging — never includes Authorization headers or keys. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      provider: this.provider,
      status: this.status,
    };
  }
}

/** Convenience classifiers for adapters. */
export const AIErrors = {
  configuration(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({
      code: "CONFIGURATION_ERROR",
      message,
      retryable: false,
      ...opts,
    });
  },
  authentication(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({
      code: "AUTHENTICATION_ERROR",
      message,
      retryable: false,
      ...opts,
    });
  },
  rateLimited(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({
      code: "RATE_LIMITED",
      message,
      retryable: true,
      ...opts,
    });
  },
  timeout(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({ code: "TIMEOUT", message, retryable: true, ...opts });
  },
  unavailable(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({
      code: "PROVIDER_UNAVAILABLE",
      message,
      retryable: true,
      ...opts,
    });
  },
  upstream(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({ code: "UPSTREAM_ERROR", message, retryable: true, ...opts });
  },
  invalidRequest(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({
      code: "INVALID_REQUEST",
      message,
      retryable: false,
      ...opts,
    });
  },
  unknown(message: string, opts?: Partial<AIErrorOptions>): AIProviderError {
    return new AIProviderError({ code: "UNKNOWN_ERROR", message, retryable: false, ...opts });
  },
};

/* ============================================================
 * Provider port
 * ============================================================ */

/**
 * The one canonical port. All model providers implement this interface.
 *
 * Imports of this interface are permitted from orchestration/services/routes.
 * Imports of concrete provider modules outside of `createAIProvider` are NOT
 * permitted.
 */
export interface AIProvider {
  /** Stable identifier, matching AIProviderId. */
  readonly id: AIProviderId;
  /** Resolved model identifier used by default for requests. */
  readonly model: string;
  /** Execute a single chat completion. */
  chat(request: ChatRequest): Promise<ChatResponse>;
}
