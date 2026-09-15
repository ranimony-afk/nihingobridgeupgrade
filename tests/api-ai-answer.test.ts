/**
 * Phase 13.4B — API route tests for POST /api/ai/answer.
 *
 * These tests instantiate the Next.js route handler directly with a
 * mocked Request (NextRequest extends Request, which is global in Node
 * 22). We do NOT spin up an HTTP server and we do NOT require a real
 * API key or Postgres. The GroundedAnswerService is invoked by the
 * handler, so we patch the service factory to return a stub service.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// The route module imports the service factory; hoist the mock first.
vi.mock("@/services/ai/serviceFactory", () => ({
  createGroundedAnswerService: vi.fn(),
}));

import { POST, GET } from "@/app/api/ai/answer/route";
import { createGroundedAnswerService } from "@/services/ai/serviceFactory";
import { AIErrors, AIProviderError } from "@/services/ai/provider";
import type { GroundedAnswerResponse } from "@/services/ai/groundedAnswerService";

const mockedCreate = vi.mocked(createGroundedAnswerService);

const ENV_SNAPSHOT: Record<string, string | undefined> = {
  AI_PROVIDER: undefined,
  AI_PROMPT_VERSION: undefined,
  ANTHROPIC_API_KEY: undefined,
  NODE_ENV: undefined,
};

beforeEach(() => {
  for (const k of Object.keys(ENV_SNAPSHOT)) ENV_SNAPSHOT[k] = process.env[k];
  process.env.AI_PROVIDER = "mock";
  process.env.AI_PROMPT_VERSION = "hana-v1-test";
});

afterEach(() => {
  for (const [k, v] of Object.entries(ENV_SNAPSHOT)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

function makeRequest(body: unknown): NextRequest {
  const payload =
    body === undefined
      ? undefined
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return nextReq({
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });
}

function okResponse(
  overrides: Partial<GroundedAnswerResponse> = {},
): GroundedAnswerResponse {
  return {
    answer: "水 means water.",
    citations: [
      {
        chunkId: "w1",
        domain: "dictionary",
        title: "水 (みず)",
        sourceRef: "dict:w1",
        relevance: 0.95,
      },
    ],
    knowledgeRefs: [
      {
        chunkId: "w1",
        domain: "dictionary",
        title: "水 (みず)",
        sourceRef: "dict:w1",
        relevance: 0.95,
      },
    ],
    sources: [
      {
        sourceRef: "dict:w1",
        name: "JMdict",
        version: "1.0",
        license: "CC-BY",
        url: null,
        domain: "dictionary",
      },
    ],
    grounded: true,
    chunkCount: 1,
    provider: {
      id: "mock",
      model: "mock-deterministic-v1",
      responseId: "resp-1",
      finishReason: "stop",
    },
    usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    promptVersion: "hana-v1-test",
    requestId: "req-client-supplied",
    locale: "en",
    queryType: "english",
    ...overrides,
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

/* ============================================================
 * Tests
 * ============================================================ */

/**
 * Build a minimal NextRequest-shaped object for the route handler.
 * NextRequest is a subclass of Request; we satisfy the extra properties
 * with stubs since the route only reads method/json/headers/cookies
 * (cookies are not touched by this handler).
 */
function nextReq(init: {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
}): NextRequest {
  const req = new Request("http://localhost/api/ai/answer", {
    method: init.method ?? "POST",
    body: init.body ?? null,
    headers: init.headers,
  });
  // Cast through unknown — we only exercise method/json/headers/cookies in
  // this handler, so a partial stub is sufficient for route tests.
  return req as unknown as NextRequest;
}

describe("POST /api/ai/answer — HTTP method & content handling", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const res = await GET(nextReq({ method: "GET" }));
    expect(res.status).toBe(405);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("rejects non-JSON bodies with 400", async () => {
    const plainReq = nextReq({ method: "POST", body: "not-json", headers: { "Content-Type": "text/plain" } });
    const res = await POST(plainReq);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/JSON/i);
  });

  it("rejects malformed JSON (syntax error) with 400", async () => {
    const req = nextReq({
      method: "POST",
      body: "{bad json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/ai/answer — validation", () => {
  it("empty query returns 400", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: "   " }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/empty/i);
  });

  it("missing query returns 400", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("oversized query returns 400", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: "a".repeat(1001) }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/1000/);
  });

  it("rejects invalid JLPT level", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: "水", jlptLevel: "N0" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid domain", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: "水", domain: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("rejects entityId without domain", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(
      makeRequest({ query: "x", entityId: "abc" }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toMatch(/domain/);
  });

  it("rejects invalid locale", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: "水", locale: "fr" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-string query", async () => {
    mockedCreate.mockReturnValue({
      generateGroundedAnswer: vi.fn(),
    } as any);
    const res = await POST(makeRequest({ query: 42 }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/ai/answer — success", () => {
  it("returns 200 with normalized response, provenance, promptVersion, usage", async () => {
    const stub = {
      generateGroundedAnswer: vi.fn().mockResolvedValue(
        okResponse({ requestId: "req-client-supplied" }),
      ),
    };
    mockedCreate.mockReturnValue(stub as any);

    const res = await POST(
      makeRequest({
        query: "What does 水 mean?",
        jlptLevel: "N5",
        locale: "en",
        requestId: "req-client-supplied",
        // userId is deliberately sent to prove it is ignored.
        userId: "should-be-ignored",
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.answer).toBe("水 means water.");
    expect(body.data.citations).toHaveLength(1);
    expect(body.data.knowledgeRefs).toHaveLength(1);
    expect(body.data.sources).toHaveLength(1);
    expect(body.data.sources[0].name).toBe("JMdict");
    expect(body.data.grounded).toBe(true);
    expect(body.data.chunkCount).toBe(1);
    expect(body.data.provider).toEqual({
      id: "mock",
      model: "mock-deterministic-v1",
      responseId: "resp-1",
      finishReason: "stop",
    });
    // Safe usage metadata only (no raw/breakdown).
    expect(body.data.usage).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
    });
    expect(body.data.promptVersion).toBe("hana-v1-test");
    expect(body.data.requestId).toBe("req-client-supplied");
    expect(body.data.locale).toBe("en");
    expect(body.data.queryType).toBe("english");

    // Verify service was called with validated inputs.
    expect(stub.generateGroundedAnswer).toHaveBeenCalledTimes(1);
    const callArg = stub.generateGroundedAnswer.mock.calls[0][0];
    expect(callArg.query).toBe("What does 水 mean?");
    expect(callArg.jlptLevel).toBe("N5");
    expect(callArg.locale).toBe("en");
    // userId must NOT be forwarded.
    expect(callArg.userId).toBeUndefined();
  });

  it("generates a server-side requestId when client omits it", async () => {
    let capturedId: string | undefined;
    const stub = {
      generateGroundedAnswer: vi.fn(async (req: any) => {
        capturedId = req.requestId;
        return okResponse({ requestId: req.requestId });
      }),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.data.requestId).toBe("string");
    expect(body.data.requestId.length).toBeGreaterThan(5);
    expect(capturedId).toMatch(/^ai_/);
    expect(body.data.requestId).toBe(capturedId);
  });

  it("accepts a valid entity lookup", async () => {
    const stub = {
      generateGroundedAnswer: vi.fn().mockResolvedValue(okResponse()),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(
      makeRequest({ query: "kanji info", domain: "kanji", entityId: "水" }),
    );
    expect(res.status).toBe(200);
    const callArg = stub.generateGroundedAnswer.mock.calls[0][0];
    expect(callArg.domain).toBe("kanji");
    expect(callArg.entityId).toBe("水");
  });
});

describe("POST /api/ai/answer — provider failure mapping", () => {
  it("maps RATE_LIMITED to 429 with retryable=true and generic message", async () => {
    const stub = {
      generateGroundedAnswer: vi
        .fn()
        .mockRejectedValue(
          AIErrors.rateLimited("upstream said something secret", {
            provider: "mock",
            status: 429,
          }),
        ),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AI_PROVIDER_ERROR");
    expect(body.error.retryable).toBe(true);
    expect(body.error.provider).toBe("mock");
    // Raw upstream message must NOT be echoed.
    expect(body.error.message).not.toMatch(/secret/);
    expect(body.error.message).toMatch(/busy|try again/i);
  });

  it("maps TIMEOUT to 504", async () => {
    const stub = {
      generateGroundedAnswer: vi
        .fn()
        .mockRejectedValue(
          AIErrors.timeout("timed out after 45000ms", { provider: "mock" }),
        ),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(504);
    const body = await json(res);
    expect(body.error.code).toBe("AI_PROVIDER_ERROR");
    expect(body.error.retryable).toBe(true);
  });

  it("maps PROVIDER_UNAVAILABLE/UPSTREAM to 503/502", async () => {
    const cases: Array<{ err: AIProviderError; status: number }> = [
      { err: AIErrors.unavailable("x", { provider: "mock", status: 503 }), status: 503 },
      { err: AIErrors.upstream("x", { provider: "mock", status: 500 }), status: 502 },
    ];
    for (const c of cases) {
      const stub = { generateGroundedAnswer: vi.fn().mockRejectedValue(c.err) };
      mockedCreate.mockReturnValue(stub as any);
      const res = await POST(makeRequest({ query: "水" }));
      expect(res.status).toBe(c.status);
      expect((await json(res)).error.retryable).toBe(true);
    }
  });

  it("wraps unexpected errors as 500 INTERNAL_ERROR (no leak)", async () => {
    const stub = {
      generateGroundedAnswer: vi
        .fn()
        .mockRejectedValue(new Error("secret internal detail: sk-xyz")),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // The raw message must NOT be forwarded.
    expect(body.error.message).not.toMatch(/sk-xyz/);
    expect(body.error.message).not.toMatch(/secret internal/);
  });

  it("configuration failure during service construction returns 500", async () => {
    // Temporarily break prompt version.
    delete process.env.AI_PROMPT_VERSION;
    mockedCreate.mockImplementation(() => {
      throw AIErrors.configuration(
        "AI_PROMPT_VERSION must be set.",
      );
    });
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error.code).toBe("AI_PROVIDER_ERROR");
  });
});

describe("POST /api/ai/answer — retrieval failure surfaces as INTERNAL_ERROR", () => {
  it("database/retrieval errors become sanitized 500s", async () => {
    const stub = {
      generateGroundedAnswer: vi
        .fn()
        .mockRejectedValue(new Error("database connection refused")),
    };
    mockedCreate.mockReturnValue(stub as any);
    const res = await POST(makeRequest({ query: "水" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toMatch(/connection refused/);
  });
});
