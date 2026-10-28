/** General search regressions on a fresh test-owned, in-memory database. */
import { execFileSync } from "node:child_process";
import type { AddressInfo, Server } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import type { Pool } from "pg";
import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { detectSearchScript, sanitizeSearchQuery } from "@/services/search/matcher";
import { fingerprint, snapshotDatabase, type DatabaseSnapshot } from "./helpers/pglite-full-snapshot";

let database: PGlite;
let server: Server;
let backingPool: Pool;
let poolClosed = false;
let previousPool: Pool | undefined;
let disposableUrl: string;
let seededBaseline: DatabaseSnapshot;
let UnifiedSearchService: typeof import("@/services/search/unifiedSearchService").UnifiedSearchService;
let searchGET: typeof import("@/app/api/search/route").GET;
const poolCache = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };

function request(path: string): NextRequest {
  const nextUrl = new URL(path, "http://unified-search-test.invalid");
  return { nextUrl, url: nextUrl.toString(), method: "GET" } as NextRequest;
}

async function seedFirstPartyFixtures() {
  // This guarded operation verifies the pool, actual client and server identity.
  const { seedDictionaryFixturesForDisposableDatabase } = await import("@/services/dictionary/fixtureSetup");
  await seedDictionaryFixturesForDisposableDatabase();

  // A synthetic first-party test record, not an official exam question. It is
  // inserted directly into this test-owned database, not an external target.
  await database.query(`
    INSERT INTO questions (id, jlpt_level, section, category, mondai_number, mondai_title,
      question_type, prompt, prompt_translation, options, correct_answer, explanation, difficulty, tags)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14::jsonb)
  `, ["test-unified-question", "N5", "vocab", "contextual_use", 1, "Synthetic test",
    "multiple_choice", "テストの問題", "Synthetic practice question for testing",
    JSON.stringify([{ id: "1", text: "test answer" }]), "1", "Synthetic test explanation", 1, "[]"]);
}

beforeAll(async () => {
  // Export DDL offline, with no inherited database URL or application credentials.
  const schema = execFileSync(process.execPath, [
    "node_modules/drizzle-kit/bin.cjs", "export",
    "--dialect", "postgresql", "--schema", "./src/db/schema.ts",
  ], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 30_000,
  });
  database = new PGlite();
  await database.waitReady;
  await database.exec(schema);
  server = createServer(database);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  disposableUrl = `postgresql://postgres:disposable@127.0.0.1:${port}/postgres`;

  // This is our own in-memory server, not just an arbitrary loopback URL.
  previousPool = poolCache.__arenaNextJsPostgresqlPool;
  delete poolCache.__arenaNextJsPostgresqlPool;
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PGOPTIONS", undefined);
  vi.stubEnv("PGPASSWORD", undefined);
  vi.stubEnv("DATABASE_URL", disposableUrl);
  vi.stubEnv("NIHONGO_DB_TARGET_CLASS", "disposable");
  vi.stubEnv("NIHONGO_DB_EXPECTED_DATABASE", "postgres");
  const { pool } = await import("@/db");
  expect(pool.options.connectionString).toBe(disposableUrl);
  backingPool = poolCache.__arenaNextJsPostgresqlPool!;
  UnifiedSearchService = (await import("@/services/search/unifiedSearchService")).UnifiedSearchService;
  searchGET = (await import("@/app/api/search/route")).GET;
}, 120_000);

afterAll(async () => {
  if (backingPool && !poolClosed) await backingPool.end();
  if (server?.listening) await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  if (database) await database.close();
  delete poolCache.__arenaNextJsPostgresqlPool;
  if (previousPool) poolCache.__arenaNextJsPostgresqlPool = previousPool;
  vi.unstubAllEnvs();
  vi.resetModules();
}, 120_000);

describe("general search on an empty database", () => {
  it("does not seed, initialize, or change any schema, sequence, or row", async () => {
    const before = await snapshotDatabase(database);
    expect(Object.keys(before.rows)).toHaveLength(30);
    expect(Object.values(before.rows).every((rows) => rows.length === 0)).toBe(true);
    const { KnowledgeCorpusService } = await import("@/services/knowledge/corpusService");
    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const { TestService } = await import("@/services/jlpt/testService");
    const spies = [
      vi.spyOn(KnowledgeCorpusService, "ensureSeeded"),
      vi.spyOn(KnowledgeService, "ensureSeeded"),
      vi.spyOn(TestService, "ensureSeeded"),
    ];
    const queries = vi.spyOn(backingPool, "query");
    try {
      for (const path of ["/api/search?q=%E6%B0%B4", "/api/search?q=no-such-entry",
        "/api/search?level=N5", "/api/search", "/api/search?q=x&targets=jlpt"]) {
        const response = await searchGET(request(path));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ success: true, data: { results: [], totalResults: 0 } });
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      const statements = queries.mock.calls.map(([query]) =>
        typeof query === "string" ? query : (query as { text?: string }).text ?? "");
      expect(statements.length).toBeGreaterThan(0);
      expect(statements.every((statement) => /^\s*select\b/i.test(statement))).toBe(true);
    } finally {
      queries.mockRestore();
      spies.forEach((spy) => spy.mockRestore());
    }
    const after = await snapshotDatabase(database);
    expect(after).toEqual(before);
    console.log(`[unified-search] empty: 30 tables, 0 rows; unchanged SHA-256 ${fingerprint(after)}`);
  }, 120_000);
});

describe("Phase 7: Unified Search Engine", () => {
  beforeAll(async () => {
    // Only this suite's freshly created in-memory database is seeded.
    await seedFirstPartyFixtures();
    seededBaseline = await snapshotDatabase(database);
  }, 120_000);

  describe("Query Script Detection & Sanitization", () => {
    it("detects Japanese, kana, kanji, romaji, and empty correctly", () => {
      expect(detectSearchScript("")).toBe("empty");
      expect(detectSearchScript("   ")).toBe("empty");
      expect(detectSearchScript("日")).toBe("kanji");
      expect(detectSearchScript("みず")).toBe("kana");
      expect(detectSearchScript("食べる")).toBe("japanese");
      expect(detectSearchScript("taberu")).toBe("romaji");
      expect(detectSearchScript("water")).toBe("romaji");
    });

    it("sanitizes malformed inputs safely", () => {
      expect(sanitizeSearchQuery("   test\0with\0nulls   ")).toBe("testwithnulls");
      expect(sanitizeSearchQuery(null as any)).toBe("");
      expect(sanitizeSearchQuery(undefined as any)).toBe("");
    });
  });

  describe("Search Targets and Modes", () => {
    it("should perform exact Japanese search", async () => {
      const result = await UnifiedSearchService.search("水");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("kanji");

      // Should find kanji, radicals, and dictionary entries
      const entityTypes = new Set(result.results.map((r) => r.entityType));
      expect(entityTypes.has("kanji") || entityTypes.has("dictionary")).toBe(true);

      const topResult = result.results[0];
      expect(topResult.displayText).toContain("水");
      expect(topResult.relevance).toBeGreaterThanOrEqual(0.9);
      expect(topResult.source).toBeTruthy();
    });

    it("should perform partial Japanese search", async () => {
      const result = await UnifiedSearchService.search("勉強");
      expect(result.results.length).toBeGreaterThan(0);
      const matches = result.results.filter(
        (r) => r.displayText.includes("勉強") || (r.meaning && r.meaning.includes("study"))
      );
      expect(matches.length).toBeGreaterThan(0);
    });

    it("should search by reading (kana)", async () => {
      const result = await UnifiedSearchService.search("みず");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("kana");

      const match = result.results.find(
        (r) => r.reading?.includes("みず") || r.displayText === "水"
      );
      expect(match).toBeDefined();
    });

    it("should search by romaji", async () => {
      const result = await UnifiedSearchService.search("mizu");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("romaji");

      const match = result.results.find(
        (r) => r.displayText === "水" || r.reading === "みず" || r.meaning.toLowerCase().includes("water")
      );
      expect(match).toBeDefined();
    });

    it("should search by English meaning", async () => {
      const result = await UnifiedSearchService.search("water");
      expect(result.results.length).toBeGreaterThan(0);

      const match = result.results.find((r) => r.meaning.toLowerCase().includes("water"));
      expect(match).toBeDefined();
    });

    it("should search kanji specifically and include radicals", async () => {
      const result = await UnifiedSearchService.search("木", {
        targets: ["kanji", "radicals"],
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.targetsSearched).toEqual(["kanji", "radicals"]);

      const hasKanji = result.results.some((r) => r.entityType === "kanji");
      const hasRadical = result.results.some((r) => r.entityType === "radicals");
      expect(hasKanji || hasRadical).toBe(true);
    });

    it("should filter by JLPT level", async () => {
      const result = await UnifiedSearchService.search("", {
        jlptLevel: "N5",
        limit: 10,
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.appliedJlptLevel).toBe("N5");

      for (const item of result.results) {
        if (item.jlptLevel) {
          expect(item.jlptLevel).toBe("N5");
        }
      }
    });

    it("should handle empty search gracefully", async () => {
      const result = await UnifiedSearchService.search("");
      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.detectedScript).toBe("empty");
    });

    it("should handle malformed / special characters without crashing", async () => {
      const weirdQueries = [
        "%' OR 1=1 --",
        "\\'; DROP TABLE dictionary_entries; --",
        "!@#$%^&*()_+{}[]|\":;<>?,./~`",
        "   \t\n   ",
      ];

      for (const q of weirdQueries) {
        const result = await UnifiedSearchService.search(q);
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Performance Benchmarking", () => {
    it("should measure and log query performance across all targets", async () => {
      const queries = ["水", "taberu", "teacher", "N5", "私"];

      console.log("\n=== Unified Search Engine Benchmark ===");
      for (const q of queries) {
        const res = await UnifiedSearchService.search(q, { limit: 20 });
        console.log(
          `Query "${q}": ${res.results.length} results in ${res.metrics.durationMs}ms (Breakdown: ${JSON.stringify(
            res.metrics.targetDurationsMs
          )})`
        );
        // Wall-clock thresholds are environment-dependent; this checks the metric contract.
        expect(Number.isFinite(res.metrics.durationMs)).toBe(true);
        expect(res.metrics.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe("general search route on first-party fixtures", () => {
  it("preserves the existing envelope and searches every supported category", async () => {
    const cases = [
      ["dictionary", "水", "de-mizu"],
      ["kanji", "明", "kj-mei"],
      ["radicals", "水", "el-mizu"],
      ["grammar", "topic", "gp-wa"],
      ["sentences", "water", "es-001"],
      ["jlpt", "Synthetic practice", "test-unified-question"],
    ] as const;
    for (const [target, query, id] of cases) {
      const params = new URLSearchParams({ q: query, targets: target });
      const response = await searchGET(request(`/api/search?${params}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({ query, targetsSearched: [target] });
      expect(body.data.metrics).toEqual(expect.objectContaining({
        durationMs: expect.any(Number), targetDurationsMs: expect.any(Object), totalFound: expect.any(Number),
      }));
      expect(body.data.results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          entityType: target, id, displayText: expect.any(String), meaning: expect.any(String),
          source: expect.any(String), relevance: expect.any(Number), matchedOn: expect.any(String),
        }),
      ]));
      expect(body.data.totalResults).toBe(body.data.metrics.totalFound);
    }

    const none = await searchGET(request("/api/search?q=__no_matching_fixture__"));
    expect(await none.json()).toMatchObject({ success: true, data: { results: [], totalResults: 0 } });
  }, 120_000);

  it("retains relevance/length ranking and prevents repeated targets multiplying results", async () => {
    const params = new URLSearchParams({ q: "水", targets: "dictionary,kanji,radicals,dictionary,kanji" });
    const response = await searchGET(request(`/api/search?${params}`));
    const body = await response.json();
    expect(body.data.targetsSearched).toEqual(["dictionary", "kanji", "radicals"]);
    const results = body.data.results as Array<{ id: string; relevance: number; displayText: string }>;
    expect(results.slice(0, 2).map((item) => item.id)).toEqual(["de-mizu", "el-mizu"]);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance);
      if (results[i - 1].relevance === results[i].relevance) {
        expect(results[i - 1].displayText.length).toBeLessThanOrEqual(results[i].displayText.length);
      }
    }
    expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
  });

  it("bounds query, targets, level, pagination and direct service calls", async () => {
    const searchSpy = vi.spyOn(UnifiedSearchService, "search");
    try {
      const invalid = [
        new URLSearchParams({ q: "x".repeat(1001) }),
        new URLSearchParams({ q: "😀".repeat(1001) }),
        new URLSearchParams({ q: "x", targets: "dictionary,".repeat(24) }),
        new URLSearchParams({ q: "x", level: "N".repeat(17) }),
        new URLSearchParams({ q: "x", limit: "10garbage" }),
        new URLSearchParams({ q: "x", limit: "0" }),
        new URLSearchParams({ q: "x", offset: "-1" }),
        new URLSearchParams({ q: "x", limit: "9".repeat(11) }),
      ];
      for (const params of invalid) {
        const response = await searchGET(request(`/api/search?${params}`));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ success: false, error: { code: expect.any(String) } });
      }
      expect(searchSpy).not.toHaveBeenCalled();
    } finally {
      searchSpy.mockRestore();
    }

    const maxUnicode = new URLSearchParams({ q: "😀".repeat(1000), targets: "dictionary" });
    expect((await searchGET(request(`/api/search?${maxUnicode}`))).status).toBe(200);
    const limitClamped = await searchGET(request("/api/search?level=N5&limit=9999999999"));
    expect(limitClamped.status).toBe(200);
    const limited = (await limitClamped.json()).data;
    expect(limited.results.length).toBeGreaterThan(0);
    expect(limited.results.length).toBeLessThanOrEqual(100);
    expect(limited.totalResults).toBeLessThanOrEqual(1200); // six targets, at most 200 candidates each
    const clamped = await searchGET(request("/api/search?level=N5&limit=9999999999&offset=9999999999"));
    expect(clamped.status).toBe(200);
    expect((await clamped.json()).data.results).toEqual([]);
    const result = await UnifiedSearchService.search("水", {
      targets: ["dictionary", "dictionary"], limit: Infinity, offset: NaN,
    });
    expect(result.targetsSearched).toEqual(["dictionary"]);
    expect(result.results.length).toBeLessThanOrEqual(20);
    await expect(UnifiedSearchService.search("x".repeat(1001))).rejects.toThrow(RangeError);
  }, 120_000);

  it("sanitizes service and database failures and optional overlay warnings", async () => {
    const sentinel = "SECRET_SQL postgresql://fake:secret@private.invalid/db SELECT * FROM private";
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failure = vi.spyOn(UnifiedSearchService, "search").mockRejectedValueOnce(new Error(sentinel));
      const response = await searchGET(request("/api/search?q=water"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ success: false, error: { code: "INTERNAL_ERROR", message: "Search failed" } });
      failure.mockRestore();

      // Force the real pool's SELECT to fail; no error details may reach the response or logs.
      const queryFailure = vi.spyOn(backingPool, "query").mockImplementation(() => Promise.reject(new Error(sentinel)) as never);
      try {
        const dbResponse = await searchGET(request("/api/search?q=water&targets=kanji"));
        expect(dbResponse.status).toBe(500);
        expect(await dbResponse.json()).toEqual({ success: false, error: { code: "INTERNAL_ERROR", message: "Search failed" } });
      } finally {
        queryFailure.mockRestore();
      }

      const { defaultPublicationStore } = await import("@/services/publication");
      const overlayFailure = vi.spyOn(defaultPublicationStore, "findPublishedDictionaryOverrides")
        .mockRejectedValueOnce(new Error(sentinel));
      try {
        const canonical = await searchGET(request("/api/search?q=%E6%B0%B4&targets=dictionary"));
        expect(canonical.status).toBe(200);
        expect((await canonical.json()).data.results[0].id).toBe("de-mizu");
      } finally {
        overlayFailure.mockRestore();
      }
      expect(JSON.stringify([...errorLog.mock.calls, ...warnLog.mock.calls])).not.toContain(sentinel);
      expect(JSON.stringify([...errorLog.mock.calls, ...warnLog.mock.calls])).not.toContain("SECRET_SQL");
      expect(errorLog).toHaveBeenCalledWith("GET /api/search failed");
      expect(warnLog).toHaveBeenCalledWith("Dictionary publication overlay unavailable; serving canonical.");
    } finally {
      errorLog.mockRestore();
      warnLog.mockRestore();
    }
  });

  it("uses only SELECTs and no seeders on the seeded GET path", async () => {
    const { KnowledgeCorpusService } = await import("@/services/knowledge/corpusService");
    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const { TestService } = await import("@/services/jlpt/testService");
    const spies = [
      vi.spyOn(KnowledgeCorpusService, "ensureSeeded"),
      vi.spyOn(KnowledgeService, "ensureSeeded"),
      vi.spyOn(TestService, "ensureSeeded"),
    ];
    const queries = vi.spyOn(backingPool, "query");
    try {
      for (const path of ["/api/search?q=%E6%B0%B4", "/api/search?level=N5", "/api/search?q=Synthetic+practice&target=jlpt"]) {
        expect((await searchGET(request(path))).status).toBe(200);
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      const statements = queries.mock.calls.map(([query]) =>
        typeof query === "string" ? query : (query as { text?: string }).text ?? "");
      expect(statements.length).toBeGreaterThan(0);
      expect(statements.every((statement) => /^\s*select\b/i.test(statement))).toBe(true);
    } finally {
      queries.mockRestore();
      spies.forEach((spy) => spy.mockRestore());
    }
    const after = await snapshotDatabase(database);
    expect(after).toEqual(seededBaseline);
    const rowCount = Object.values(after.rows).reduce((sum, rows) => sum + rows.length, 0);
    console.log(`[unified-search] seeded: ${Object.keys(after.rows).length} tables, ${rowCount} rows; unchanged SHA-256 ${fingerprint(after)}`);
  }, 120_000);

  it("returns a safe error when the actual application pool is unavailable without changing state", async () => {
    await backingPool.end();
    poolClosed = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await searchGET(request("/api/search?q=water&targets=kanji"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ success: false, error: { code: "INTERNAL_ERROR", message: "Search failed" } });
      expect(errorLog).toHaveBeenCalledWith("GET /api/search failed");
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain("pool");
    } finally {
      errorLog.mockRestore();
    }
    const after = await snapshotDatabase(database);
    expect(after).toEqual(seededBaseline);
    console.log(`[unified-search] unavailable database: unchanged SHA-256 ${fingerprint(after)}`);
  }, 120_000);
});
