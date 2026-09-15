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

// Snapshot env so we can restore after each test.
const ENV_SNAPSHOT: Record<string, string | undefined> = {
  AI_PROVIDER: undefined,
  ANTHROPIC_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  MOCK_AI_MODEL: undefined,
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
    }
  });

  it("registered ids include exactly the built-ins", () => {
    const ids = getRegisteredProviderIds();
    expect(ids).toContain("mock");
    // Future adapters will add their id here; the contract requires that
    // "anthropic"/"openai" ids only appear when the corresponding adapter
    // is actually implemented — neither is present yet in 13.3B.
    expect(ids).not.toContain("anthropic");
    expect(ids).not.toContain("openai");
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
    const indexSrc = fs.readFileSync("src/services/ai/index.ts", "utf8");
    for (const [name, src] of [
      ["provider.ts", providerSrc],
      ["factory.ts", factorySrc],
      ["providers/mock.ts", mockSrc],
      ["index.ts", indexSrc],
    ] as const) {
      expect(src, `${name} must import "server-only"`).toContain(
        'import "server-only"',
      );
    }
  });
});
