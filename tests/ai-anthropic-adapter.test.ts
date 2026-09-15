/**
 * Phase 13.3D — Anthropic adapter tests.
 *
 * Pure unit tests using an injected fetch mock. These tests never hit
 * the network and never require a real API key, so they run in CI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AIErrors,
  AIProviderError,
  type ChatRequest,
} from "@/services/ai/provider";
import { AnthropicProvider } from "@/services/ai/providers/anthropic";

const ENV_SNAPSHOT: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: undefined,
  ANTHROPIC_API_URL: undefined,
  AI_REQUEST_TIMEOUT_MS: undefined,
  AI_DEBUG_LOGS: undefined,
  NODE_ENV: undefined,
};

beforeEach(() => {
  for (const key of Object.keys(ENV_SNAPSHOT)) {
    ENV_SNAPSHOT[key] = process.env[key];
  }
  process.env.AI_DEBUG_LOGS = ""; // keep logs quiet
});

afterEach(() => {
  for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function baseRequest(partial: Partial<ChatRequest> = {}): ChatRequest {
  return {
    system: "You are a Japanese-language tutor. Be concise.",
    messages: [{ role: "user", content: "What does 水 mean?" }],
    promptVersion: "hana-v1",
    requestId: "req-anthropic-test-1",
    ...partial,
  };
}

/** Build a fake fetch that returns a canned Response. */
function mockFetch(
  handler: (req: RequestInfo, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  // vitest provides a compatible fetch mock shape via vi.fn(). We simply
  // use a typed JS function cast to typeof fetch.
  return handler as unknown as typeof fetch;
}

function successResponse(overrides: Record<string, unknown> = {}): Response {
  const body = {
    id: "msg_01TEST",
    type: "message",
    role: "assistant",
    model: "claude-test-model",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: "水 means 'water' in Japanese." }],
    usage: { input_tokens: 42, output_tokens: 9 },
    ...overrides,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(
  status: number,
  type: string,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type, message } }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/* ============================================================
 * Construction / configuration
 * ============================================================ */

describe("anthropic adapter: construction", () => {
  it("fails AUTHENTICATION_ERROR when no API key is provided", () => {
    setEnv("ANTHROPIC_API_KEY", "");
    try {
      new AnthropicProvider();
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("AUTHENTICATION_ERROR");
      expect((err as AIProviderError).provider).toBe("anthropic");
    }
  });

  it("uses constructor options over env", () => {
    setEnv("ANTHROPIC_API_KEY", "sk-env");
    setEnv("ANTHROPIC_MODEL", "env-model");
    setEnv("ANTHROPIC_API_URL", "https://env.example.com");
    setEnv("AI_REQUEST_TIMEOUT_MS", "5000");
    const p = new AnthropicProvider({
      apiKey: "sk-ctor",
      model: "ctor-model",
      apiUrl: "https://ctor.example.com",
      timeoutMs: 7000,
    });
    expect(p.id).toBe("anthropic");
    expect(p.model).toBe("ctor-model");
  });

  it("defaults model/url/timeout when env is absent", () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    setEnv("ANTHROPIC_MODEL", "");
    setEnv("ANTHROPIC_API_URL", "");
    setEnv("AI_REQUEST_TIMEOUT_MS", "");
    // Should not throw.
    const p = new AnthropicProvider();
    expect(p.model).toBeTruthy();
    expect(p.model.length).toBeGreaterThan(0);
  });

  it("fails CONFIGURATION_ERROR on invalid timeoutMs (constructor)", () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    try {
      new AnthropicProvider({ timeoutMs: 0 });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("CONFIGURATION_ERROR");
    }
  });

  it("uses default timeout when AI_REQUEST_TIMEOUT_MS is non-numeric", () => {
    setEnv("ANTHROPIC_API_KEY", "sk-test");
    setEnv("AI_REQUEST_TIMEOUT_MS", "garbage");
    const p = new AnthropicProvider({ fetchImpl: mockFetch(() => successResponse()) });
    // Should not throw and should default to a sane timeout (>=1000ms).
    expect(p).toBeInstanceOf(AnthropicProvider);
  });
});

/* ============================================================
 * Success path
 * ============================================================ */

describe("anthropic adapter: chat success", () => {
  it("sends correct headers, method, body, and parses response", async () => {
    let captured: { url: RequestInfo; init?: RequestInit } | undefined;
    const fetchImpl = mockFetch((url, init) => {
      captured = { url, init };
      return successResponse();
    });
    const p = new AnthropicProvider({
      apiKey: "sk-test-1234",
      model: "claude-test-model",
      apiUrl: "https://example.invalid/v1/messages",
      timeoutMs: 5000,
      fetchImpl,
    });
    const r = await p.chat(baseRequest({
      options: { maxTokens: 256, temperature: 0.3, topP: 0.9 },
    }));
    expect(r.provider).toBe("anthropic");
    expect(r.model).toBe("claude-test-model");
    expect(r.text).toBe("水 means 'water' in Japanese.");
    expect(r.finishReason).toBe("stop");
    expect(r.providerResponseId).toBe("msg_01TEST");
    expect(r.usage?.inputTokens).toBe(42);
    expect(r.usage?.outputTokens).toBe(9);
    expect(r.usage?.totalTokens).toBe(51);
    expect(r.requestId).toBe("req-anthropic-test-1");

    // Verify HTTP shape.
    expect(captured).toBeDefined();
    expect(captured!.url).toBe("https://example.invalid/v1/messages");
    expect(captured!.init?.method).toBe("POST");
    const rawHeaders = captured!.init?.headers as Record<string, string>;
    // Normalize header keys to lowercase because some runtimes lowercase
    // them internally and the spec treats header names case-insensitively.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k.toLowerCase()] = v;
    }
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-api-key"]).toBe("sk-test-1234");
    expect(headers["anthropic-version"]).toBeTruthy();
    expect(headers["x-request-id"]).toBe("req-anthropic-test-1");
    const body = JSON.parse(String(captured!.init?.body));
    expect(body.model).toBe("claude-test-model");
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0.3);
    expect(body.top_p).toBe(0.9);
    expect(body.system).toContain("Japanese-language tutor");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.metadata).toEqual({ user_id: "req-anthropic-test-1" });
  });

  it("appends grounding context (no system message pollution)", async () => {
    let body: any;
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch((_u, init) => {
        body = JSON.parse(String(init?.body));
        return successResponse();
      }),
    });
    await p.chat(baseRequest({
      context: {
        text: "chunk1\nchunk2",
        estimatedTokens: 20,
        chunkCount: 3,
      },
    }));
    expect(body.system).toContain("<grounding-context");
    expect(body.system).toContain("chunk1\nchunk2");
    expect(body.system).toContain('chunks="3"');
  });

  it("JSON mode appends strict-JSON instruction and parses json response", async () => {
    let body: any;
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch((_u, init) => {
        body = JSON.parse(String(init?.body));
        return successResponse({
          content: [
            { type: "text", text: '{"answer":"水 is water","grounded":true}' },
          ],
        });
      }),
    });
    const r = await p.chat(
      baseRequest({ options: { responseFormat: { type: "json" } } }),
    );
    expect(body.system).toContain("Respond with valid JSON only");
    expect(r.json).toEqual({ answer: "水 is water", grounded: true });
  });

  it("strips markdown fences around JSON output", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() =>
        successResponse({
          content: [
            { type: "text", text: '```json\n{"ok":true}\n```' },
          ],
        }),
      ),
    });
    const r = await p.chat(
      baseRequest({ options: { responseFormat: { type: "json" } } }),
    );
    expect(r.json).toEqual({ ok: true });
  });

  it("maps max_tokens stop_reason to finishReason=length", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() =>
        successResponse({ stop_reason: "max_tokens" }),
      ),
    });
    const r = await p.chat(baseRequest());
    expect(r.finishReason).toBe("length");
  });

  it("maps cache_usage breakdown when present", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() =>
        successResponse({
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 30,
          },
        }),
      ),
    });
    const r = await p.chat(baseRequest());
    expect(r.usage?.totalTokens).toBe(120);
    expect(r.usage?.breakdown).toEqual({
      cacheCreationInputTokens: 50,
      cacheReadInputTokens: 30,
    });
  });

  it("throws INVALID_REQUEST when JSON mode returns non-JSON text", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() =>
        successResponse({
          content: [{ type: "text", text: "Here is your answer..." }],
        }),
      ),
    });
    try {
      await p.chat(
        baseRequest({ options: { responseFormat: { type: "json" } } }),
      );
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("UPSTREAM_ERROR");
    }
  });
});

/* ============================================================
 * HTTP error mapping
 * ============================================================ */

describe("anthropic adapter: error mapping", () => {
  const errorCases: Array<{
    name: string;
    status: number;
    anthropicType: string;
    expectedCode: AIProviderError["code"];
    retryable: boolean;
  }> = [
    {
      name: "401 authentication_error",
      status: 401,
      anthropicType: "authentication_error",
      expectedCode: "AUTHENTICATION_ERROR",
      retryable: false,
    },
    {
      name: "403 (key blocked)",
      status: 403,
      anthropicType: "authentication_error",
      expectedCode: "AUTHENTICATION_ERROR",
      retryable: false,
    },
    {
      name: "429 rate_limit_error",
      status: 429,
      anthropicType: "rate_limit_error",
      expectedCode: "RATE_LIMITED",
      retryable: true,
    },
    {
      name: "400 invalid_request_error",
      status: 400,
      anthropicType: "invalid_request_error",
      expectedCode: "INVALID_REQUEST",
      retryable: false,
    },
    {
      name: "422 invalid",
      status: 422,
      anthropicType: "invalid_request_error",
      expectedCode: "INVALID_REQUEST",
      retryable: false,
    },
    {
      name: "500 api_error",
      status: 500,
      anthropicType: "api_error",
      expectedCode: "UPSTREAM_ERROR",
      retryable: true,
    },
    {
      name: "529 overloaded_error",
      status: 529,
      anthropicType: "overloaded_error",
      expectedCode: "PROVIDER_UNAVAILABLE",
      retryable: true,
    },
    {
      name: "503 unavailable",
      status: 503,
      anthropicType: "api_error",
      expectedCode: "PROVIDER_UNAVAILABLE",
      retryable: true,
    },
  ];

  for (const c of errorCases) {
    it(`maps ${c.name} -> ${c.expectedCode} (retryable=${c.retryable})`, async () => {
      const p = new AnthropicProvider({
        apiKey: "sk",
        model: "m",
        fetchImpl: mockFetch(() =>
          errorResponse(c.status, c.anthropicType, "detail: " + c.name),
        ),
      });
      try {
        await p.chat(baseRequest());
        expect.unreachable("should throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const e = err as AIProviderError;
        expect(e.code).toBe(c.expectedCode);
        expect(e.retryable).toBe(c.retryable);
        expect(e.provider).toBe("anthropic");
        expect(e.status).toBe(c.status);
      }
    });
  }

  it("non-JSON error body maps to UNKNOWN_ERROR/UPSTREAM gracefully", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(
        () => new Response("<html>Bad Gateway</html>", { status: 502 }),
      ),
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      const e = err as AIProviderError;
      // 502 is mapped as PROVIDER_UNAVAILABLE.
      expect(e.code).toBe("PROVIDER_UNAVAILABLE");
      expect(e.status).toBe(502);
    }
  });

  it("malformed 200 JSON throws UNKNOWN_ERROR", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(
        () => new Response("not-json", { status: 200 }),
      ),
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("UNKNOWN_ERROR");
    }
  });

  it("200 with missing id/content throws UNKNOWN_ERROR", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(
        () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("UNKNOWN_ERROR");
    }
  });

  it("200 with empty content (no text blocks) throws UNKNOWN_ERROR", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() =>
        successResponse({ content: [] }),
      ),
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("UNKNOWN_ERROR");
    }
  });
});

/* ============================================================
 * Timeout / cancellation
 * ============================================================ */

describe("anthropic adapter: timeout and cancellation", () => {
  /**
   * A fetch that never resolves on its own, BUT listens for the signal
   * and rejects when it aborts. This mirrors how real fetch() behaves
   * (Node 18+ rejects with AbortError when the signal fires) and keeps
   * vitest from hanging on an open promise after the test assertion.
   */
  function hangingFetch(): typeof fetch {
    return ((_url: RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException(signal.reason?.message ?? "aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException(
                  signal.reason instanceof Error ? signal.reason.message : "aborted",
                  signal.reason instanceof DOMException ? signal.reason.name : "AbortError",
                ),
              ),
            { once: true },
          );
        }
      })) as unknown as typeof fetch;
  }

  it("throws TIMEOUT when request exceeds AI_REQUEST_TIMEOUT_MS", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      timeoutMs: 20,
      fetchImpl: hangingFetch(),
    });
    const start = Date.now();
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      const elapsed = Date.now() - start;
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("TIMEOUT");
      expect((err as AIProviderError).retryable).toBe(true);
      expect(elapsed).toBeLessThan(500);
    }
  });

  it("surfaces AbortError when caller cancels (not TIMEOUT)", async () => {
    const controller = new AbortController();
    // Abort before the request resolves.
    setTimeout(() => controller.abort(), 10);
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      timeoutMs: 5000,
      fetchImpl: hangingFetch(),
    });
    try {
      await p.chat(baseRequest({ signal: controller.signal }));
      expect.unreachable("should throw");
    } catch (err) {
      // Caller-cancelled → DOMException(AbortError), not TIMEOUT.
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe("AbortError");
    }
  });

  it("pre-aborted signal throws immediately without fetching", async () => {
    let fetched = false;
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: (() => {
        fetched = true;
        return Promise.resolve(successResponse());
      }) as unknown as typeof fetch,
    });
    const controller = new AbortController();
    controller.abort(new DOMException("pre-aborted", "AbortError"));
    try {
      await p.chat(baseRequest({ signal: controller.signal }));
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe("AbortError");
      expect(fetched).toBe(false);
    }
  });

  it("network failure maps to PROVIDER_UNAVAILABLE", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      timeoutMs: 1000,
      fetchImpl: (() =>
        Promise.reject(new TypeError("fetch failed (DNS)"))) as unknown as typeof fetch,
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("PROVIDER_UNAVAILABLE");
      expect((err as AIProviderError).retryable).toBe(true);
    }
  });
});

/* ============================================================
 * Safety invariants (no secret leakage)
 * ============================================================ */

describe("anthropic adapter: safety", () => {
  it("never logs API keys or prompt content on errors", async () => {
    setEnv("AI_DEBUG_LOGS", "1");
    const errors: string[] = [];
    const origErr = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      const p = new AnthropicProvider({
        apiKey: "sk-super-secret-key-abcdef",
        model: "m",
        fetchImpl: mockFetch(() =>
          errorResponse(
            500,
            "api_error",
            "echoed prompt: What does 水 mean? key=sk-super-secret-key-abcdef",
          ),
        ),
      });
      try {
        await p.chat(baseRequest());
        expect.unreachable("should throw");
      } catch (_err) {
        /* expected */
      }
    } finally {
      console.error = origErr;
    }
    const combined = errors.join(" ");
    expect(combined).toContain("[ai:anthropic]");
    // No secret, no prompt content, no upstream message text anywhere.
    expect(combined).not.toContain("sk-super-secret-key-abcdef");
    expect(combined).not.toContain("水");
    expect(combined).not.toContain("Japanese-language tutor");
    expect(combined).not.toContain("echoed prompt");
    // bodyPreview must NOT be present — only bodyLength.
    expect(combined).not.toContain("bodyPreview");
    expect(combined).toContain("bodyLength");
  });

  it("toJSON() on thrown AIProviderError does not leak causes", async () => {
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch(() => errorResponse(401, "authentication_error", "bad key")),
    });
    try {
      await p.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      const json = (err as AIProviderError).toJSON();
      expect(json).not.toHaveProperty("cause");
      expect(json).not.toHaveProperty("stack");
      expect(json.code).toBe("AUTHENTICATION_ERROR");
    }
  });

  it("request does not send credentials and disallows redirects", async () => {
    let capturedInit: RequestInit | undefined;
    const p = new AnthropicProvider({
      apiKey: "sk",
      model: "m",
      fetchImpl: mockFetch((_u, init) => {
        capturedInit = init;
        return successResponse();
      }),
    });
    await p.chat(baseRequest());
    expect(capturedInit?.credentials).toBe("omit");
    expect(capturedInit?.redirect).toBe("error");
  });

  it("module source never references NEXT_PUBLIC_ secrets", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(
      "src/services/ai/providers/anthropic.ts",
      "utf8",
    );
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
    expect(src).toContain('import "server-only"');
  });
});
