/**
 * MockAIProvider — deterministic, explicit-local-test provider.
 *
 * Phase 13.3C. Used ONLY when AI_PROVIDER=mock is explicitly configured.
 * Never auto-selected. Returns canned, deterministic responses and can
 * simulate every error classification in the contract so orchestration
 * and route tests can exercise failure paths without a network call or
 * credentials.
 *
 * Determinism guarantees:
 *   - Same (system, messages, context, options, promptVersion) → same
 *     text, same providerResponseId, same usage counts.
 *   - No Math.random, no Date.now, no network, no filesystem access.
 *   - Errors thrown for simulated scenarios are deterministic by scenario.
 *
 * Error simulation:
 *   - Construct with `new MockAIProvider({ model, scenario, latencyMs })`
 *     to force a specific behavior for one test subject.
 *   - Or set MOCK_AI_SCENARIO / MOCK_AI_LATENCY_MS env vars for integration
 *     tests that reach the provider via `createAIProvider()`.
 *   - Supported scenarios: "success" (default), "invalid_request",
 *     "auth_error", "rate_limited", "timeout", "unavailable",
 *     "upstream_error", "unknown_error".
 *
 * Streaming is NOT part of the 13.3B/13.3C contract; the port exposes a
 * single `chat()` method. Streaming will be added as an additional method
 * when a real adapter and a streaming UI require it.
 */

import "server-only";

import { AIErrors } from "@/services/ai/provider";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
} from "@/services/ai/provider";

export type MockScenario =
  | "success"
  | "invalid_request"
  | "auth_error"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "upstream_error"
  | "unknown_error";

export interface MockAIProviderOptions {
  /** Model identifier returned in every response. Default "mock-deterministic-v1". */
  model?: string;
  /** Force a specific behaviour (error class). Default "success". */
  scenario?: MockScenario;
  /**
   * Artificial latency in ms. Useful for exercising AbortSignal.timeout
   * races in tests. Defaults to 0 (one setTimeout(0) macrotask).
   */
  latencyMs?: number;
}

function readEnv(): { scenario: MockScenario; latencyMs: number; model?: string } {
  const rawScenario = (process.env.MOCK_AI_SCENARIO ?? "").trim().toLowerCase();
  const scenario =
    rawScenario === "invalid_request" ||
    rawScenario === "auth_error" ||
    rawScenario === "rate_limited" ||
    rawScenario === "timeout" ||
    rawScenario === "unavailable" ||
    rawScenario === "upstream_error" ||
    rawScenario === "unknown_error"
      ? rawScenario
      : "success";
  const rawLatency = Number(process.env.MOCK_AI_LATENCY_MS);
  const latencyMs = Number.isFinite(rawLatency) && rawLatency >= 0 ? rawLatency : 0;
  const model = process.env.MOCK_AI_MODEL || undefined;
  return { scenario, latencyMs, model };
}

function throwScenario(scenario: Exclude<MockScenario, "success">): never {
  switch (scenario) {
    case "invalid_request":
      throw AIErrors.invalidRequest("mock: simulated invalid request", {
        provider: "mock",
        status: 400,
      });
    case "auth_error":
      throw AIErrors.authentication("mock: simulated authentication error", {
        provider: "mock",
        status: 401,
      });
    case "rate_limited":
      throw AIErrors.rateLimited("mock: simulated rate limit", {
        provider: "mock",
        status: 429,
      });
    case "timeout":
      throw AIErrors.timeout("mock: simulated timeout", {
        provider: "mock",
      });
    case "unavailable":
      throw AIErrors.unavailable("mock: simulated provider unavailable", {
        provider: "mock",
        status: 503,
      });
    case "upstream_error":
      throw AIErrors.upstream("mock: simulated upstream error", {
        provider: "mock",
        status: 500,
      });
    case "unknown_error":
      throw AIErrors.unknown("mock: simulated unknown error", {
        provider: "mock",
      });
    default: {
      const _exhaustive: never = scenario;
      throw AIErrors.unknown(`mock: unhandled scenario "${_exhaustive}"`, {
        provider: "mock",
      });
    }
  }
}

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model: string;
  private readonly scenario: MockScenario;
  private readonly latencyMs: number;

  constructor(opts: MockAIProviderOptions | string = {}) {
    // Back-compat: accept a plain model string.
    const normalized: MockAIProviderOptions =
      typeof opts === "string" ? { model: opts } : opts;
    const env = readEnv();
    this.model = normalized.model ?? env.model ?? "mock-deterministic-v1";
    this.scenario = normalized.scenario ?? env.scenario;
    this.latencyMs = normalized.latencyMs ?? env.latencyMs;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Pre-abort fast path: caller already cancelled.
    if (request.signal?.aborted) {
      const s = request.signal;
      const reason = s.reason instanceof Error ? s.reason.message : "aborted";
      throw new DOMException(reason, "AbortError");
    }

    return new Promise<ChatResponse>((resolve, reject) => {
      const signal = request.signal;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finishResolve = (value: ChatResponse) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        if (timer) clearTimeout(timer);
        resolve(value);
      };
      const finishReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        if (timer) clearTimeout(timer);
        reject(err);
      };

      const onAbort = () => {
        const reason = signal && signal.reason instanceof Error
          ? signal.reason.message
          : "aborted";
        finishReject(new DOMException(reason, "AbortError"));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const delay = Math.max(0, this.latencyMs);
      timer = setTimeout(() => {
        try {
          if (this.scenario !== "success") {
            throwScenario(this.scenario as Exclude<MockScenario, "success">);
          }
          finishResolve(this.buildResponse(request));
        } catch (err) {
          finishReject(err);
        }
      }, delay);
    });
  }

  private buildResponse(request: ChatRequest): ChatResponse {
    const lastUser = [...request.messages].reverse().find(
      (m) => m.role === "user",
    );
    const userText = lastUser?.content?.trim() ?? "";
    const chunkCount = request.context?.chunkCount ?? 0;
    const grounding = request.context
      ? `grounding:${chunkCount}chunks/${request.context.estimatedTokens ?? 0}tok`
      : "grounding:none";

    const text = [
      "[mock]",
      request.system ? "system:set" : "system:none",
      grounding,
      userText ? `q:${truncate(userText, 80)}` : "q:(empty)",
    ].join(" | ");

    const promptInput =
      request.system + request.messages.map((m) => m.content).join("");
    const inputTokens = estimateTokens(promptInput);
    const outputTokens = estimateTokens(text);

    const base: ChatResponse = {
      text,
      provider: this.id,
      model: this.model,
      finishReason: "stop",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      requestId: request.requestId,
      providerResponseId: `mock_${request.promptVersion}_${Math.abs(
        stableHash(userText + "|" + grounding + "|" + (request.options?.responseFormat?.type ?? "text")),
      ).toString(36)}`,
    };

    if (request.options?.responseFormat?.type === "json") {
      const jsonText = `${text} | format:json`;
      // Deterministic JSON object whose shape echoes the request. Adapters
      // producing real JSON mode will emit the vendor-specific schema here;
      // the mock returns a stable, inspectable shape useful for tests.
      // `answer` always equals the final response text so callers can
      // compare j.answer === r.text without duplicating the string.
      base.json = {
        answer: jsonText,
        grounded: chunkCount > 0,
        chunkCount,
        provider: this.id,
        model: this.model,
        promptVersion: request.promptVersion,
      };
      base.text = jsonText;
      base.finishReason = "stop";
      // Update output tokens to reflect the (slightly longer) text.
      base.usage = {
        ...base.usage,
        outputTokens: estimateTokens(jsonText),
      };
      base.usage.totalTokens =
        (base.usage.inputTokens ?? 0) + (base.usage.outputTokens ?? 0);
    }

    return base;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/**
 * Coarse token estimate for the mock's usage fields. Not for prompt-budget
 * enforcement in real providers. Mirrors the estimator used by
 * KnowledgeRetriever so counts are comparable across the retrieval path.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const jp = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
  return Math.max(1, Math.ceil(jp / 2 + (text.length - jp) / 4));
}

/** Stable non-cryptographic hash so providerResponseId is deterministic. */
function stableHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}
