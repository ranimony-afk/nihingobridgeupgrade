/**
 * Phase 13.4A — GroundedAnswerService tests.
 *
 * These tests inject a stub AIProvider and a stub retriever so they
 * never touch the network or Postgres. We cannot easily mock the static
 * KnowledgeRetriever methods via import spying (static classes are
 * awkward with vitest), so tests for this service instead construct
 * the service's chat request against an in-memory fake provider and
 * verify behavior end-to-end. We exercise the retrieval path by
 * reaching into the real KnowledgeRetriever.formatContext helper via a
 * helper that constructs a realistic RetrievalResult shape directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AIErrors,
  AIProviderError,
  type ChatRequest,
  type ChatResponse,
} from "@/services/ai/provider";
import { GroundedAnswerService } from "@/services/ai/groundedAnswerService";
import type { AIProvider } from "@/services/ai/provider";
import { KnowledgeRetriever } from "@/services/ai/knowledgeRetriever";
import type {
  KnowledgeChunk,
  KnowledgeDomain,
  RetrievalResult,
} from "@/services/ai/knowledgeRetriever";

const ENV_SNAPSHOT: Record<string, string | undefined> = {
  AI_PROMPT_VERSION: undefined,
};

beforeEach(() => {
  for (const k of Object.keys(ENV_SNAPSHOT)) ENV_SNAPSHOT[k] = process.env[k];
  process.env.AI_PROMPT_VERSION = "hana-v1-test";
});

afterEach(() => {
  for (const [k, v] of Object.entries(ENV_SNAPSHOT)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

/* ---------- Fakes ---------- */

function makeChunk(partial: Partial<KnowledgeChunk> & { id: string; domain: KnowledgeDomain }): KnowledgeChunk {
  return {
    title: partial.title ?? partial.id,
    content: partial.content ?? `content for ${partial.id}`,
    relevance: partial.relevance ?? 0.9,
    matchedOn: partial.matchedOn ?? "stub",
    record: partial.record ?? ({} as KnowledgeChunk["record"]),
    sourceRef: partial.sourceRef ?? `src:${partial.id}`,
    jlptLevel: partial.jlptLevel ?? "N5",
    ...partial,
  };
}

function retrievalResult(
  overrides: Partial<RetrievalResult> & { chunks: KnowledgeChunk[] },
): RetrievalResult {
  const chunks = overrides.chunks;
  const domainCounts = { dictionary: 0, kanji: 0, grammar: 0, sentence: 0 } as Record<KnowledgeDomain, number>;
  for (const c of chunks) domainCounts[c.domain]++;
  const ctx = KnowledgeRetriever.formatContext(chunks);
  return {
    query: overrides.query ?? "stub query",
    queryType: overrides.queryType ?? "english",
    chunks,
    totalChunks: chunks.length,
    domainCounts,
    domainsSearched: overrides.domainsSearched ?? ["dictionary", "kanji", "grammar", "sentence"],
    sources: overrides.sources ?? chunks.map((c) => ({
      sourceRef: c.sourceRef,
      name: `Source for ${c.id}`,
      version: "1.0",
      license: "CC-BY",
      url: null,
      domain: c.domain,
    })),
    contextText: ctx,
    estimatedTokens: overrides.estimatedTokens ?? Math.ceil(ctx.length / 4),
  };
}

type StubProvider = AIProvider & {
  calls: ChatRequest[];
  responses: ChatResponse[];
  shouldThrow?: AIProviderError;
};

function stubProvider(responses: ChatResponse[] = [], shouldThrow?: AIProviderError): StubProvider {
  const p: StubProvider = {
    id: "mock" as const,
    model: "stub-model",
    calls: [],
    responses,
    shouldThrow,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      p.calls.push(req);
      if (p.shouldThrow) throw p.shouldThrow;
      const next = p.responses.shift();
      if (!next) {
        throw new Error("stub provider has no responses queued");
      }
      return next;
    },
  };
  return p;
}

function okResponse(text: string, overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    text,
    provider: "mock",
    model: "stub-model",
    finishReason: "stop",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    providerResponseId: "resp-stub-1",
    ...overrides,
  };
}

/* ---------- Helper that patches KnowledgeRetriever statically ----------
 *
 * We monkey-patch KnowledgeRetriever.retrieve/retrieveEntity for the
 * duration of each test. This keeps the service unit-testable without
 * adding an interface seam we would have to maintain. The real
 * retrieve/retrieveEntity methods are already covered by integration
 * tests (knowledge-retrieval.test.ts) against Postgres in CI.
 */

function stubRetrieval(result: RetrievalResult, entityResult?: RetrievalResult): void {
  vi.spyOn(KnowledgeRetriever, "retrieve").mockResolvedValue(result);
  vi.spyOn(KnowledgeRetriever, "retrieveEntity").mockResolvedValue(
    entityResult ?? result,
  );
}

/* ============================================================
 * Tests
 * ============================================================ */

describe("grounded answer service: validation", () => {
  it("rejects empty query", async () => {
    const p = stubProvider();
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "   " });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects excessively long queries", async () => {
    const p = stubProvider();
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "a".repeat(1001) });
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("INVALID_REQUEST");
      expect((err as AIProviderError).message).toMatch(/maximum length/);
    }
  });

  it("rejects invalid JLPT level", async () => {
    const p = stubProvider();
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "水", jlptLevel: "N0" });
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects invalid locale", async () => {
    const p = stubProvider();
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "水", locale: "fr" as "en" });
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("INVALID_REQUEST");
    }
  });

  it("rejects entityId without a domain", async () => {
    const p = stubProvider();
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "x", entityId: "abc" });
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("INVALID_REQUEST");
    }
  });

  it("requires AI_PROMPT_VERSION at construction", () => {
    delete process.env.AI_PROMPT_VERSION;
    const p = stubProvider();
    try {
      new GroundedAnswerService(p);
      expect.unreachable("should throw");
    } catch (err) {
      expect((err as AIProviderError).code).toBe("CONFIGURATION_ERROR");
    }
  });
});

describe("grounded answer service: prompt construction", () => {
  it("system prompt references the prompt version and does NOT contain user text", async () => {
    const p = stubProvider([okResponse("answer text")]);
    const chunk = makeChunk({ id: "w1", domain: "dictionary", sourceRef: "src:w1" });
    stubRetrieval(retrievalResult({ chunks: [chunk] }));
    const svc = new GroundedAnswerService(p);
    await svc.generateGroundedAnswer({ query: "What does 水 mean?", requestId: "r1" });
    expect(p.calls).toHaveLength(1);
    const req = p.calls[0];
    expect(req.system).toContain("hana-v1-test");
    expect(req.system).toContain("KNOWLEDGE CONTEXT");
    // User text must NOT be concatenated into system prompt.
    expect(req.system).not.toContain("水");
    expect(req.system).not.toContain("What does");
    // User message is a single user turn.
    expect(req.messages).toEqual([
      { role: "user", content: "What does 水 mean?" },
    ]);
    expect(req.promptVersion).toBe("hana-v1-test");
    expect(req.requestId).toBe("r1");
    expect(req.options?.temperature).toBeCloseTo(0.2);
  });

  it("Japanese locale produces a Japanese-language instruction", async () => {
    const p = stubProvider([okResponse("答え")]);
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    await svc.generateGroundedAnswer({ query: "水", locale: "ja" });
    expect(p.calls[0].system).toContain("日本語");
  });

  it("JLPT tailors the system instruction", async () => {
    const p = stubProvider([okResponse("答え")]);
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    await svc.generateGroundedAnswer({ query: "水", jlptLevel: "N5" });
    expect(p.calls[0].system).toContain("JLPT N5");
  });

  it("entityId+domain routes through retrieveEntity", async () => {
    const p = stubProvider([okResponse("answer")]);
    const chunk = makeChunk({ id: "k1", domain: "kanji", sourceRef: "src:k1" });
    stubRetrieval(
      retrievalResult({ chunks: [] }),
      retrievalResult({ chunks: [chunk], query: "kanji:k1", queryType: "japanese" }),
    );
    const svc = new GroundedAnswerService(p);
    await svc.generateGroundedAnswer({ query: "kanji info", domain: "kanji", entityId: "k1" });
    expect(KnowledgeRetriever.retrieveEntity).toHaveBeenCalledWith("kanji", "k1");
    expect(KnowledgeRetriever.retrieve).not.toHaveBeenCalled();
  });
});

describe("grounded answer service: response shaping", () => {
  it("returns answer, citations, sources, provider metadata, usage, promptVersion", async () => {
    const chunk = makeChunk({ id: "w1", domain: "dictionary", title: "水 (みず)", sourceRef: "dict:jmdict" });
    const chunks = [chunk];
    const p = stubProvider([okResponse(
      "水 means 'water' [dictionary:w1]. It is a common noun.",
    )]);
    stubRetrieval(retrievalResult({
      chunks,
      sources: [{ sourceRef: "dict:jmdict", name: "JMdict", version: "1.0", license: "CC-BY", url: null, domain: "dictionary" }],
    }));
    const svc = new GroundedAnswerService(p);
    const resp = await svc.generateGroundedAnswer({ query: "水" });
    expect(resp.answer).toContain("水 means 'water'");
    expect(resp.citations).toHaveLength(1);
    expect(resp.citations[0].chunkId).toBe("w1");
    expect(resp.citations[0].sourceRef).toBe("dict:jmdict");
    expect(resp.knowledgeRefs).toHaveLength(1);
    expect(resp.sources).toHaveLength(1);
    expect(resp.sources[0].name).toBe("JMdict");
    expect(resp.grounded).toBe(true);
    expect(resp.chunkCount).toBe(1);
    expect(resp.provider.id).toBe("mock");
    expect(resp.provider.model).toBe("stub-model");
    expect(resp.provider.responseId).toBe("resp-stub-1");
    expect(resp.usage?.totalTokens).toBe(150);
    expect(resp.promptVersion).toBe("hana-v1-test");
    expect(resp.locale).toBe("en");
    expect(resp.queryType).toBe("english");
  });

  it("drops fabricated citations that don't match grounding chunks", async () => {
    const chunk = makeChunk({ id: "w1", domain: "dictionary", sourceRef: "src:w1" });
    const p = stubProvider([okResponse(
      "Some answer citing [dictionary:w1] and a hallucinated [dictionary:fake99].",
    )]);
    stubRetrieval(retrievalResult({ chunks: [chunk] }));
    const svc = new GroundedAnswerService(p);
    const resp = await svc.generateGroundedAnswer({ query: "x" });
    expect(resp.citations.map((c) => c.chunkId)).toEqual(["w1"]);
  });

  it("no retrieval results → grounded=false, no citations, still returns answer", async () => {
    const p = stubProvider([okResponse(
      "I don't have a verified entry for that in my current knowledge base.",
    )]);
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    const resp = await svc.generateGroundedAnswer({ query: "unknown word" });
    expect(resp.grounded).toBe(false);
    expect(resp.chunkCount).toBe(0);
    expect(resp.citations).toHaveLength(0);
    expect(resp.knowledgeRefs).toHaveLength(0);
    expect(resp.sources).toHaveLength(0);
    expect(p.calls[0].context).toBeUndefined();
  });
});

describe("grounded answer service: bounded context", () => {
  it("caps grounding tokens by dropping lowest-relevance chunks", async () => {
    // Build chunks whose combined content definitely exceeds
    // MAX_CONTEXT_TOKENS=2000 even with the section header overhead.
    // Relevance is descending so the tail gets dropped first.
    const chunks: KnowledgeChunk[] = [];
    for (let i = 0; i < 20; i++) {
      chunks.push(makeChunk({
        id: `w${i}`,
        domain: "dictionary",
        title: `word ${i}`,
        // ~200 tokens worth of Japanese + latin text per chunk.
        content: `word${i} — ${"日本語".repeat(40)} ${ "explanation text. ".repeat(20)}`,
        relevance: 1 - i * 0.04,
        sourceRef: `src:w${i}`,
      }));
    }
    const p = stubProvider([okResponse("stub answer")]);
    stubRetrieval(retrievalResult({ chunks }));
    const svc = new GroundedAnswerService(p);
    await svc.generateGroundedAnswer({ query: "test" });
    const ctx = p.calls[0].context;
    expect(ctx).toBeDefined();
    expect(ctx!.chunkCount).toBeGreaterThan(0);
    expect(ctx!.chunkCount).toBeLessThan(20);
    expect((ctx!.estimatedTokens ?? 0)).toBeLessThanOrEqual(2100); // small slack for formatting overhead
  });
});

describe("grounded answer service: provider failure", () => {
  it("surfaces AIProviderError from provider unchanged", async () => {
    const err = AIErrors.rateLimited("upstream busy", { provider: "mock", status: 429 });
    const p = stubProvider([], err);
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "水" });
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBe(err);
      expect((e as AIProviderError).code).toBe("RATE_LIMITED");
    }
  });

  it("wraps unexpected errors as UNKNOWN_ERROR", async () => {
    const p = stubProvider();
    // Inject an unexpected throw from the provider that is NOT an AIProviderError.
    (p as any).chat = async () => { throw new TypeError("broken"); };
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    try {
      await svc.generateGroundedAnswer({ query: "水" });
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AIProviderError);
      expect((e as AIProviderError).code).toBe("UNKNOWN_ERROR");
    }
  });

  it("passes through AbortError from caller cancellation", async () => {
    const p = stubProvider();
    (p as any).chat = async (req: ChatRequest) => {
      // Mimic AbortError propagation from the real provider.
      throw new DOMException("aborted", "AbortError");
    };
    stubRetrieval(retrievalResult({ chunks: [] }));
    const svc = new GroundedAnswerService(p);
    const ctrl = new AbortController();
    ctrl.abort();
    try {
      await svc.generateGroundedAnswer({ query: "水", signal: ctrl.signal });
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException);
      expect((e as DOMException).name).toBe("AbortError");
    }
  });
});

describe("grounded answer service: deterministic mock provider", () => {
  it("works end-to-end with the real MockAIProvider (no network)", async () => {
    const { MockAIProvider } = await import("@/services/ai/providers/mock");
    const mock = new MockAIProvider({ latencyMs: 0 });
    const chunk = makeChunk({ id: "w1", domain: "dictionary", sourceRef: "src:w1" });
    stubRetrieval(retrievalResult({ chunks: [chunk] }));
    const svc = new GroundedAnswerService(mock);
    const resp = await svc.generateGroundedAnswer({ query: "What does 水 mean?" });
    expect(resp.provider.id).toBe("mock");
    expect(resp.answer).toContain("[mock]");
    expect(resp.promptVersion).toBe("hana-v1-test");
    // The mock returns deterministic text — make sure our prompt was
    // wired through (system + grounding + user).
    expect(resp.grounded).toBe(true);
    expect(resp.chunkCount).toBe(1);
  });
});
