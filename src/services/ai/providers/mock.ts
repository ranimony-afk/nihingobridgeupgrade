/**
 * MockAIProvider — deterministic, explicit-local-test provider.
 *
 * Phase 13.3B. Used ONLY when AI_PROVIDER=mock is explicitly configured.
 * Never auto-selected. Returns a canned, content-grounded response so the
 * orchestration layer, route, and tests can exercise the full contract
 * without a network call or credentials.
 *
 * Non-determinism is intentionally absent: given the same request, this
 * provider always returns the same text. That keeps snapshot-style
 * assertions and contract tests reliable.
 */

import "server-only";

import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
} from "@/services/ai/provider";

export class MockAIProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly model: string;

  constructor(model: string = "mock-deterministic-v1") {
    this.model = model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Respect abort signals for timeout-propagation contract tests.
    if (request.signal?.aborted) {
      const reason = request.signal.reason instanceof Error
        ? request.signal.reason.message
        : "aborted";
      throw new DOMException(reason, "AbortError");
    }

    // Listen for abort mid-flight. The promise settles when either the
    // (trivially fast) mock work completes after one macrotask deferral —
    // which gives any caller-side AbortSignal.timeout / setTimeout-abort a
    // fair chance to fire — OR the signal aborts, whichever comes first.
    if (request.signal) {
      const signal = request.signal;
      return new Promise<ChatResponse>((resolve, reject) => {
        if (signal.aborted) {
          reject(
            new DOMException(
              signal.reason instanceof Error ? signal.reason.message : "aborted",
              "AbortError",
            ),
          );
          return;
        }
        let settled = false;
        const onAbort = () => {
          if (settled) return;
          settled = true;
          reject(
            new DOMException(
              signal.reason instanceof Error ? signal.reason.message : "aborted",
              "AbortError",
            ),
          );
        };
        signal.addEventListener("abort", onAbort, { once: true });
        // One macrotask deferral models the asynchronous boundary a real
        // HTTP round trip presents and allows AbortSignal.timeout(N) to
        // race the call even for N=0.
        setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          if (settled) return;
          if (signal.aborted) {
            onAbort();
            return;
          }
          settled = true;
          resolve(this.buildResponse(request));
        }, 0);
      });
    }

    return this.buildResponse(request);
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

    return {
      text,
      provider: this.id,
      model: this.model,
      finishReason: "stop",
      usage: {
        inputTokens: estimateTokens(
          request.system + request.messages.map((m) => m.content).join(""),
        ),
        outputTokens: estimateTokens(text),
        totalTokens: 0,
      },
      requestId: request.requestId,
      providerResponseId: `mock_${request.promptVersion}_${Math.abs(stableHash(userText)).toString(36)}`,
    };
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/** Coarse token estimate for the mock's usage fields. Not for prompt budget enforcement. */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const jp = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
  return Math.max(1, Math.ceil(jp / 2 + (text.length - jp) / 4));
}

/** Stable non-cryptographic hash so providerResponseId is deterministic for an input. */
function stableHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}
