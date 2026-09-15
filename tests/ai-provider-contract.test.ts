/**
 * Phase 13.3B — AI provider contract tests.
 *
 * These are PURE unit tests: they do not require PostgreSQL. They cover
 * the explicit-provider-selection contract, error taxonomy, factory
 * closed-fail behaviour, request/response shape, and abort/timeout
 * propagation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Import the contract types/errors from the provider module and the
// factory from its own module (barrel re-exports intentionally tested
// indirectly by exercising both paths).
import {
  AIErrors,
  AIProviderError,
  type AIErrorCode,
  type ChatRequest,
} from "@/services/ai/provider";
import {
  createAIProvider,
  getRegisteredProviderIds,
} from "@/services/ai/factory";
import { MockAIProvider } from "@/services/ai/providers/mock";

// Snapshot env so we can restore after each test.
const ENV_SNAPSHOT: Record<string, string | undefined> = {
  AI_PROVIDER: undefined,
  AI_REQUEST_TIMEOUT_MS: undefined,
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: undefined,
  ANTHROPIC_API_URL: undefined,
  OPENAI_API_KEY: undefined,
  MOCK_AI_MODEL: undefined,
  MOCK_AI_SCENARIO: undefined,
  MOCK_AI_LATENCY_MS: undefined,
  AI_DEBUG_LOGS: undefined,
  NODE_ENV: undefined,
};

beforeEach(() => {
  for (const key of Object.keys(ENV_SNAPSHOT)) {
    ENV_SNAPSHOT[key] = process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(ENV_SNAPSHOT)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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
    requestId: "req-test-1",
    ...partial,
  };
}

/* ============================================================
 * 1. Explicit mock provider selection
 * ============================================================ */
describe("provider selection: explicit mock", () => {
  it("creates a MockAIProvider when AI_PROVIDER=mock", () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    expect(provider.id).toBe("mock");
    expect(provider.model).toBeTruthy();
  });

  it("mock selection does NOT require any API key env var", async () => {
    setEnv("AI_PROVIDER", "mock");
    setEnv("ANTHROPIC_API_KEY", undefined);
    setEnv("OPENAI_API_KEY", undefined);
    const provider = createAIProvider();
    const response = await provider.chat(baseRequest());
    expect(response.provider).toBe("mock");
    expect(response.text).toContain("[mock]");
  });
});

/* ============================================================
 * 2. Unsupported provider fails CLOSED
 * ============================================================ */
describe("provider selection: unsupported id fails closed", () => {
  it("throws CONFIGURATION_ERROR on unknown provider", () => {
    setEnv("AI_PROVIDER", "acme-llm");
    try {
      createAIProvider();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      const e = err as AIProviderError;
      expect(e.code).toBe("CONFIGURATION_ERROR");
      expect(e.retryable).toBe(false);
      // "anthropic" and "mock" should be listed as supported values.
      expect(e.message).toMatch(/mock/);
      expect(e.message).toMatch(/anthropic/);
    }
  });

  it("registered ids include exactly the built-ins", () => {
    const ids = getRegisteredProviderIds();
    expect(ids).toContain("mock");
    expect(ids).toContain("anthropic");
    // Future adapters will add their id here.
    expect(ids).not.toContain("openai");
  });
});

/* ============================================================
 * 2b. Anthropic provider selection (13.3D)
 * ============================================================ */
describe("provider selection: anthropic adapter", () => {
  it("AI_PROVIDER=anthropic without ANTHROPIC_API_KEY fails closed with AUTHENTICATION_ERROR", () => {
    setEnv("AI_PROVIDER", "anthropic");
    setEnv("ANTHROPIC_API_KEY", "");
    setEnv("ANTHROPIC_MODEL", "claude-test");
    try {
      createAIProvider();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      const e = err as AIProviderError;
      // Missing key is an authentication/credential failure, not a
      // silent fallback to mock.
      expect(e.code).toBe("AUTHENTICATION_ERROR");
      expect(e.provider).toBe("anthropic");
      expect(e.retryable).toBe(false);
    }
  });

  it("AI_PROVIDER=anthropic with a key creates an AnthropicProvider instance", () => {
    setEnv("AI_PROVIDER", "anthropic");
    setEnv("ANTHROPIC_API_KEY", "sk-test-not-a-real-key");
    setEnv("ANTHROPIC_MODEL", "claude-test-model");
    const p = createAIProvider();
    expect(p.id).toBe("anthropic");
    expect(p.model).toBe("claude-test-model");
  });

  it("anthropic is in the registered provider ids list", () => {
    expect(getRegisteredProviderIds()).toContain("anthropic");
  });
});

/* ============================================================
 * 3. Missing production configuration fails closed
 * ============================================================ */
describe("provider selection: missing configuration fails closed", () => {
  it("throws CONFIGURATION_ERROR when AI_PROVIDER is unset", () => {
    setEnv("AI_PROVIDER", undefined);
    try {
      createAIProvider();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("CONFIGURATION_ERROR");
      expect((err as AIProviderError).retryable).toBe(false);
    }
  });

  it("throws CONFIGURATION_ERROR when AI_PROVIDER is empty", () => {
    setEnv("AI_PROVIDER", "");
    try {
      createAIProvider();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("CONFIGURATION_ERROR");
    }
  });
});

/* ============================================================
 * 4. No automatic fallback to mock
 * ============================================================ */
describe("provider selection: NO silent fallback", () => {
  it("does not fall back to mock for unsupported provider id", () => {
    setEnv("AI_PROVIDER", "nonexistent");
    // Even though a "mock" provider exists, factory must NOT fall back.
    expect(() => createAIProvider()).toThrow(AIProviderError);
  });

  it("does not fall back to mock when provider id is unset", () => {
    setEnv("AI_PROVIDER", undefined);
    setEnv("ANTHROPIC_API_KEY", "");
    expect(() => createAIProvider()).toThrow(AIProviderError);
  });
});

/* ============================================================
 * 5. Provider-neutral request construction
 * ============================================================ */
describe("request/response: neutral shape", () => {
  it("accepts system, messages, context, options, promptVersion, requestId, signal", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const controller = new AbortController();
    const req: ChatRequest = {
      system: "sys",
      messages: [
        { role: "system", content: "sys-priming" },
        { role: "user", content: "hello" },
      ],
      context: {
        text: "grounded knowledge here",
        estimatedTokens: 7,
        chunkCount: 2,
      },
      options: { maxTokens: 128, temperature: 0.2, topP: 0.9 },
      promptVersion: "hana-v1",
      requestId: "corr-1",
      signal: controller.signal,
    };
    const response = await provider.chat(req);
    expect(response.provider).toBe("mock");
    expect(response.model).toBeTruthy();
    expect(response.finishReason).toBe("stop");
    expect(response.requestId).toBe("corr-1");
    expect(response.providerResponseId).toMatch(/^mock_hana-v1_/);
    expect(typeof response.text).toBe("string");
    expect(response.usage).toBeDefined();
    expect(typeof response.usage!.inputTokens).toBe("number");
    expect(typeof response.usage!.outputTokens).toBe("number");
    expect(response.text).toContain("grounding:2chunks");
    expect(response.text).toContain("q:hello");
  });

  it("gracefully handles missing context (no grounding segment)", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const response = await provider.chat(baseRequest({ context: undefined }));
    expect(response.text).toContain("grounding:none");
  });

  it("responseFormat=json is accepted at the type level (tested directly via 13.3C scenarios)", async () => {
    // 13.3C adds full JSON-mode support in MockAIProvider; the contract
    // test here just confirms the option is accepted without a type
    // error when passed on a text-mode call (default responseFormat is
    // text when omitted). The JSON-output behaviour itself is covered
    // in the 13.3C scenario tests.
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const response = await provider.chat(
      baseRequest({ options: { responseFormat: { type: "text" } } }),
    );
    expect(response.text).toBeTruthy();
    expect(response.json).toBeUndefined();
  });
});

/* ============================================================
 * 6. Provider-neutral response handling
 * ============================================================ */
describe("response: neutral fields populated", () => {
  it("echoes provider and model identifiers and promptVersion-derived response id", async () => {
    setEnv("AI_PROVIDER", "mock");
    setEnv("MOCK_AI_MODEL", "mock-specific-model");
    const provider = createAIProvider();
    const response = await provider.chat(
      baseRequest({ promptVersion: "hana-v1", requestId: "rid-42" }),
    );
    expect(response.provider).toBe("mock");
    expect(response.model).toBe("mock-specific-model");
    expect(response.requestId).toBe("rid-42");
    expect(response.providerResponseId).toMatch(/^mock_hana-v1_/);
  });

  it("is deterministic for identical inputs", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const a = await provider.chat(baseRequest());
    const b = await provider.chat(baseRequest());
    expect(a.text).toBe(b.text);
    expect(a.providerResponseId).toBe(b.providerResponseId);
  });
});

/* ============================================================
 * 7. Error classification
 * ============================================================ */
describe("error taxonomy", () => {
  const cases: Array<{
    name: string;
    build: () => AIProviderError;
    code: AIErrorCode;
    retryable: boolean;
  }> = [
    {
      name: "configuration",
      build: () => AIErrors.configuration("missing key"),
      code: "CONFIGURATION_ERROR",
      retryable: false,
    },
    {
      name: "authentication",
      build: () => AIErrors.authentication("bad key"),
      code: "AUTHENTICATION_ERROR",
      retryable: false,
    },
    {
      name: "rateLimited",
      build: () => AIErrors.rateLimited("429"),
      code: "RATE_LIMITED",
      retryable: true,
    },
    {
      name: "timeout",
      build: () => AIErrors.timeout("upstream hung"),
      code: "TIMEOUT",
      retryable: true,
    },
    {
      name: "unavailable",
      build: () => AIErrors.unavailable("503"),
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    },
    {
      name: "upstream",
      build: () => AIErrors.upstream("500"),
      code: "UPSTREAM_ERROR",
      retryable: true,
    },
    {
      name: "invalidRequest",
      build: () => AIErrors.invalidRequest("400"),
      code: "INVALID_REQUEST",
      retryable: false,
    },
    {
      name: "unknown",
      build: () => AIErrors.unknown("???"),
      code: "UNKNOWN_ERROR",
      retryable: false,
    },
  ];

  for (const c of cases) {
    it(`AIErrors.${c.name} produces ${c.code} retryable=${c.retryable}`, () => {
      const e = c.build();
      expect(e).toBeInstanceOf(AIProviderError);
      expect(e.code).toBe(c.code);
      expect(e.retryable).toBe(c.retryable);
      expect(e.name).toBe("AIProviderError");
    });
  }

  it("toJSON() omits secrets/cause", () => {
    const e = AIErrors.authentication("bad key", {
      provider: "mock",
      status: 401,
      cause: new Error("Authorization: Bearer sk-super-secret"),
    });
    const j = e.toJSON();
    expect(j).not.toHaveProperty("cause");
    expect(JSON.stringify(j)).not.toContain("sk-super-secret");
    expect(JSON.stringify(j)).not.toContain("Authorization");
    expect(j.code).toBe("AUTHENTICATION_ERROR");
    expect(j.provider).toBe("mock");
    expect(j.status).toBe(401);
  });
});

/* ============================================================
 * 8. Timeout/abort propagation
 * ============================================================ */
describe("abort signal / timeout propagation", () => {
  it("rejects with AbortError when the signal is already aborted", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const controller = new AbortController();
    controller.abort(new Error("deadline exceeded"));
    await expect(
      provider.chat(baseRequest({ signal: controller.signal })),
    ).rejects.toThrow(/deadline exceeded/);
  });

  it("rejects when signalled between call and resolution (AbortSignal.timeout pattern)", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    // Real-world pattern: AbortSignal.timeout(N) races the call. Use a
    // 1ms timeout — empirically fires before the mock's 0ms deferral and
    // represents exactly how orchestration will wire per-request timeouts.
    const signal = AbortSignal.timeout(1);
    const promise = provider.chat(baseRequest({ signal }));
    await expect(promise).rejects.toThrow(DOMException);
  });
});

/* ============================================================
 * 9. Factory behaviour / registry invariants
 * ============================================================ */
describe("factory invariants", () => {
  it("returns a provider implementing the AIProvider interface (id + model + chat)", () => {
    setEnv("AI_PROVIDER", "mock");
    const p = createAIProvider();
    expect(typeof p.id).toBe("string");
    expect(typeof p.model).toBe("string");
    expect(typeof p.chat).toBe("function");
  });

  it("is case-insensitive on AI_PROVIDER", () => {
    setEnv("AI_PROVIDER", "MOCK");
    const p = createAIProvider();
    expect(p.id).toBe("mock");
  });

  it("trims whitespace from AI_PROVIDER", () => {
    setEnv("AI_PROVIDER", "  mock  ");
    const p = createAIProvider();
    expect(p.id).toBe("mock");
  });
});

/* ============================================================
 * 11. Mock provider: 13.3C scenarios
 * ============================================================ */
describe("mock provider (13.3C): behaviour", () => {
  it("totalTokens equals inputTokens + outputTokens", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const response = await provider.chat(baseRequest());
    expect(response.usage).toBeDefined();
    expect(response.usage!.totalTokens).toBe(
      (response.usage!.inputTokens ?? 0) + (response.usage!.outputTokens ?? 0),
    );
    expect(response.usage!.inputTokens).toBeGreaterThan(0);
    expect(response.usage!.outputTokens).toBeGreaterThan(0);
  });

  it("returns stable providerResponseId across calls (deterministic)", async () => {
    setEnv("AI_PROVIDER", "mock");
    const provider = createAIProvider();
    const a = await provider.chat(baseRequest());
    const b = await provider.chat(baseRequest());
    expect(a.providerResponseId).toBe(b.providerResponseId);
    expect(a.text).toBe(b.text);
    expect(a.usage).toEqual(b.usage);
  });

  it("honours a custom model passed via constructor", async () => {
    const p = new MockAIProvider({ model: "mock-custom-v42" });
    const r = await p.chat(baseRequest());
    expect(r.model).toBe("mock-custom-v42");
    expect(r.provider).toBe("mock");
  });

  it("back-compat: constructor accepts a plain model string", async () => {
    const p = new MockAIProvider("legacy-model");
    expect(p.model).toBe("legacy-model");
  });

  it("supports structured JSON output when responseFormat=json is requested", async () => {
    const p = new MockAIProvider();
    const r = await p.chat(
      baseRequest({
        context: { text: "grounded", chunkCount: 3, estimatedTokens: 20 },
        options: { responseFormat: { type: "json" } },
      }),
    );
    expect(r.text).toContain("format:json");
    expect(r.json).toBeDefined();
    const j = r.json as Record<string, unknown>;
    expect(j.answer).toBe(r.text);
    expect(j.grounded).toBe(true);
    expect(j.chunkCount).toBe(3);
    expect(j.provider).toBe("mock");
    expect(j.model).toBe(p.model);
    expect(j.promptVersion).toBe("hana-v1");
  });

  it("json field is undefined for plain-text requests", async () => {
    const p = new MockAIProvider();
    const r = await p.chat(baseRequest());
    expect(r.json).toBeUndefined();
  });

  it("MOCK_AI_MODEL env selects model when constructed via factory", async () => {
    setEnv("AI_PROVIDER", "mock");
    setEnv("MOCK_AI_MODEL", "env-model-via-factory");
    const provider = createAIProvider();
    const r = await provider.chat(baseRequest());
    expect(r.model).toBe("env-model-via-factory");
  });
});

describe("mock provider (13.3C): error simulation via constructor", () => {
  const scenarios: Array<{
    name: string;
    scenario:
      | "invalid_request"
      | "auth_error"
      | "rate_limited"
      | "timeout"
      | "unavailable"
      | "upstream_error"
      | "unknown_error";
    code: AIErrorCode;
    retryable: boolean;
    status?: number;
  }> = [
    { name: "invalid_request", scenario: "invalid_request", code: "INVALID_REQUEST", retryable: false, status: 400 },
    { name: "auth_error", scenario: "auth_error", code: "AUTHENTICATION_ERROR", retryable: false, status: 401 },
    { name: "rate_limited", scenario: "rate_limited", code: "RATE_LIMITED", retryable: true, status: 429 },
    { name: "timeout", scenario: "timeout", code: "TIMEOUT", retryable: true },
    { name: "unavailable", scenario: "unavailable", code: "PROVIDER_UNAVAILABLE", retryable: true, status: 503 },
    { name: "upstream_error", scenario: "upstream_error", code: "UPSTREAM_ERROR", retryable: true, status: 500 },
    { name: "unknown_error", scenario: "unknown_error", code: "UNKNOWN_ERROR", retryable: false },
  ];
  for (const s of scenarios) {
    it(`scenario "${s.name}" throws ${s.code} (retryable=${s.retryable})`, async () => {
      const p = new MockAIProvider({ scenario: s.scenario, latencyMs: 0 });
      try {
        await p.chat(baseRequest());
        expect.unreachable("should throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AIProviderError);
        const e = err as AIProviderError;
        expect(e.code).toBe(s.code);
        expect(e.retryable).toBe(s.retryable);
        expect(e.provider).toBe("mock");
        if (s.status !== undefined) {
          expect(e.status).toBe(s.status);
        } else {
          expect(e.status).toBeUndefined();
        }
      }
    });
  }
});

describe("mock provider (13.3C): error simulation via environment (integration path)", () => {
  it("MOCK_AI_SCENARIO=rate_limited causes factory-built mock to throw", async () => {
    setEnv("AI_PROVIDER", "mock");
    setEnv("MOCK_AI_SCENARIO", "rate_limited");
    const provider = createAIProvider();
    try {
      await provider.chat(baseRequest());
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("RATE_LIMITED");
      expect((err as AIProviderError).provider).toBe("mock");
    }
  });

  it("MOCK_AI_SCENARIO=invalid value is ignored (falls back to success)", async () => {
    setEnv("AI_PROVIDER", "mock");
    setEnv("MOCK_AI_SCENARIO", "garbage");
    const provider = createAIProvider();
    const r = await provider.chat(baseRequest());
    expect(r.provider).toBe("mock");
    expect(r.text).toContain("[mock]");
  });
});

describe("mock provider (13.3C): latency + abort/timeout", () => {
  it("MOCK_AI_LATENCY_MS cooperates with AbortSignal.timeout", async () => {
    setEnv("AI_PROVIDER", "mock");
    // 50ms artificial latency; AbortSignal.timeout(10) fires well before.
    setEnv("MOCK_AI_LATENCY_MS", "50");
    const provider = createAIProvider();
    const signal = AbortSignal.timeout(10);
    await expect(
      provider.chat(baseRequest({ signal })),
    ).rejects.toThrow(DOMException);
  });

  it("constructor latencyMs={0} and no signal resolves successfully", async () => {
    const p = new MockAIProvider({ latencyMs: 0 });
    const r = await p.chat(baseRequest());
    expect(r.provider).toBe("mock");
    expect(r.finishReason).toBe("stop");
  });

  it("constructor latencyMs allows sufficient time to complete when not aborted", async () => {
    const p = new MockAIProvider({ latencyMs: 5 });
    const controller = new AbortController();
    const r = await p.chat(baseRequest({ signal: controller.signal }));
    expect(r.text).toContain("[mock]");
  });
});

describe("mock provider (13.3C): server-only / no-network / no-secret invariants", () => {
  it("mock module source contains no fetch/http/SDK imports", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/services/ai/providers/mock.ts", "utf8");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/require\(["']http["']\)/);
    expect(src).not.toMatch(/@anthropic|@openai|from ["']anthropic["']|from ["']openai["']/);
    expect(src).not.toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/);
    expect(src).toContain('import "server-only"');
  });
});

/* ============================================================
 * 10. Server-only boundary
 * ============================================================ */
describe("server-only boundary", () => {
  it("provider module statically imports 'server-only'", async () => {
    // A trivial static check: the source text must include the server-only
    // import so Next.js client bundles fail to include it.
    const fs = await import("node:fs");
    const providerSrc = fs.readFileSync("src/services/ai/provider.ts", "utf8");
    const factorySrc = fs.readFileSync("src/services/ai/factory.ts", "utf8");
    const mockSrc = fs.readFileSync("src/services/ai/providers/mock.ts", "utf8");
    const anthropicSrc = fs.readFileSync(
      "src/services/ai/providers/anthropic.ts",
      "utf8",
    );
    const indexSrc = fs.readFileSync("src/services/ai/index.ts", "utf8");
    for (const [name, src] of [
      ["provider.ts", providerSrc],
      ["factory.ts", factorySrc],
      ["providers/mock.ts", mockSrc],
      ["providers/anthropic.ts", anthropicSrc],
      ["index.ts", indexSrc],
    ] as const) {
      expect(src, `${name} must import "server-only"`).toContain(
        'import "server-only"',
      );
    }
  });
});
