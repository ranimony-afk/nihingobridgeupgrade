/**
 * R1S follow-up — read paths must not write canonical Kanji tables.
 *
 * VULNERABILITY UNDER TEST (see reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md):
 * `KnowledgeService.ensureSeeded()` inserts into `kanji_radicals`,
 * `kanji_entries` and `kanji_composition`. Every read method in the service
 * called it before querying, and anonymous GET routes (`/api/ai/retrieve`,
 * `/api/kanji`, `/api/kanji/[character]`, `/api/kana`, `/api/knowledge/srs`,
 * `/api/jlpt/overview`, `/api/jlpt/progress`) reach those methods. The only
 * precondition was "`kana_entries` is empty" — database state, not authority.
 *
 * This suite proves the fix three ways, all database-free:
 *
 *   1. STATIC INVARIANT — no request path invokes the Kanji seeder, and the
 *      only remaining production caller is the explicit, target-classified
 *      bootstrap. Fails if anyone reintroduces a lazy call.
 *   2. BEHAVIOURAL — with `@/db` replaced by a recording proxy, every Kanji /
 *      kana / stats read method runs without touching `insert`, `update`,
 *      `delete`, `execute` or `transaction` on the shared client, and without
 *      invoking `ensureSeeded`.
 *   3. BOUNDARY — the bootstrap operation still refuses production and still
 *      requires an explicitly classified disposable database, so removing the
 *      lazy call did not leave a weaker bootstrap behind.
 *
 * Layering, stated honestly:
 *   - REAL: the real `KnowledgeService`, the real `JLPTKnowledgeService`, the
 *     real `/api/ai/retrieve` route module.
 *   - MOCKED: `@/db` only (a proxy that records every property access).
 *   - No PostgreSQL server, no DATABASE_URL, no production credentials, and no
 *     ingestion/seeding operation is executed.
 *
 * The assertions are deliberately about *absence of a write*, so they hold
 * even on an empty database.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------ *
 * The database boundary is the only module replaced.
 *
 * `insert` / `update` / `delete` / `execute` / `transaction` throw on access,
 * so a canonical write is not merely unasserted — it is impossible to perform
 * silently. `select` chains resolve to an empty result set, which is the state
 * of a database that was never bootstrapped.
 * ------------------------------------------------------------------ */

const writes: string[] = [];

function emptySelectChain(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolveWith: (value: unknown) => unknown) =>
            Promise.resolve([]).then(resolveWith);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

const dbProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      const name = String(prop);
      if (name === "select") return () => emptySelectChain();
      if (["insert", "update", "delete", "execute", "transaction", "query"].includes(name)) {
        writes.push(name);
        throw new Error(`canonical/read path attempted db.${name}()`);
      }
      writes.push(name);
      throw new Error(`unexpected db property access: ${name}`);
    },
  },
);

vi.mock("@/db", () => ({
  db: dbProxy,
  pool: new Proxy(
    {},
    {
      get(_target, prop) {
        writes.push(`pool.${String(prop)}`);
        throw new Error(`read path attempted pool.${String(prop)}`);
      },
    },
  ),
}));

/* ------------------------------------------------------------------ *
 * Static helpers
 * ------------------------------------------------------------------ */

const repoRoot = resolve(__dirname, "..");

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const KANJI_SEEDER_CALL = "KnowledgeService.ensureSeeded";
const LAZY_CALL = "await this.ensureSeeded()";

/** Every observed database write, shared by all suites (cleared per test). */
beforeEach(() => {
  writes.length = 0;
});

/* ------------------------------------------------------------------ *
 * 1. STATIC INVARIANT
 * ------------------------------------------------------------------ */

describe("R1S-follow-up: no request path invokes the canonical Kanji seeder", () => {
  it("KnowledgeService contains no lazy ensureSeeded() call in any method", () => {
    const code = stripComments(source("src/services/knowledge/knowledgeService.ts"));
    expect(code).not.toContain(LAZY_CALL);
    // The seeder itself must still exist — the fix removes callers, not the
    // explicit bootstrap operation.
    expect(code).toContain("static async ensureSeeded(");
  });

  it("no module under src/app invokes the canonical Kanji seeder", () => {
    const routeFiles = [
      "src/app/api/ai/retrieve/route.ts",
      "src/app/api/kanji/route.ts",
      "src/app/api/kanji/[character]/route.ts",
      "src/app/api/kana/route.ts",
      "src/app/api/knowledge/srs/route.ts",
      "src/app/api/jlpt/overview/route.ts",
      "src/app/api/jlpt/progress/route.ts",
      "src/services/jlpt/knowledge/jlptKnowledgeService.ts",
    ];
    for (const file of routeFiles) {
      const code = stripComments(source(file));
      expect(`${file}: ${code}`).not.toContain(KANJI_SEEDER_CALL);
    }
  });

  it("the only remaining production caller is the explicit classified bootstrap", () => {
    const callers = [
      "src/app/api/ai/retrieve/route.ts",
      "src/app/api/kanji/route.ts",
      "src/app/api/kanji/[character]/route.ts",
      "src/app/api/kana/route.ts",
      "src/app/api/knowledge/srs/route.ts",
      "src/app/api/jlpt/overview/route.ts",
      "src/app/api/jlpt/progress/route.ts",
      "src/services/jlpt/knowledge/jlptKnowledgeService.ts",
      "src/services/knowledge/knowledgeService.ts",
      "src/services/dictionary/fixtureSetup.ts",
    ].filter((file) => source(file).includes(KANJI_SEEDER_CALL));

    expect(callers).toEqual(["src/services/dictionary/fixtureSetup.ts"]);
  });

  it("canonical table writes appear only inside the bootstrap operation", () => {
    const code = source("src/services/knowledge/knowledgeService.ts");
    const start = code.indexOf("static async ensureSeeded(");
    const end = code.indexOf("static async getKanaChart(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const outsideBootstrap = code.slice(0, start) + code.slice(end);
    for (const token of [
      ".insert(radicalsTable)",
      ".insert(kanjiTable)",
      ".insert(compositionTable)",
    ]) {
      // Present in the file (the retained bootstrap body)…
      expect(code).toContain(token);
      // …and absent from every request-reachable method.
      expect(outsideBootstrap).not.toContain(token);
    }
  });

  it("/api/ai/retrieve no longer imports the Kanji knowledge service at all", () => {
    const code = stripComments(source("src/app/api/ai/retrieve/route.ts"));
    expect(code).not.toContain('from "@/services/knowledge/knowledgeService"');
    // Corpus bootstrap is intentionally retained (different, non-canonical tables).
    expect(code).toContain("KnowledgeCorpusService.ensureSeeded()");
  });
});

/* ------------------------------------------------------------------ *
 * 2. BEHAVIOURAL — real services, recording proxy, no database
 * ------------------------------------------------------------------ */

describe("R1S-follow-up: read methods never reach a canonical write", () => {
  beforeEach(() => {
    writes.length = 0;
    vi.restoreAllMocks();
  });

  it("KnowledgeService.ensureSeeded is never called by a read method", async () => {
    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const seed = vi.spyOn(KnowledgeService, "ensureSeeded");

    const reads: Array<[string, () => Promise<unknown>]> = [
      ["getKanaChart", () => KnowledgeService.getKanaChart({})],
      ["searchKana", () => KnowledgeService.searchKana("a")],
      ["getKanaById", () => KnowledgeService.getKanaById("hira-a")],
      ["listKanji", () => KnowledgeService.listKanji({})],
      ["listKanji+filter", () => KnowledgeService.listKanji({ level: "N5", keyword: "water" })],
      ["listElements", () => KnowledgeService.listElements()],
      ["listElements+facets", () => KnowledgeService.listElements("radical", { level: "N5" })],
      ["buildMindTree", () => KnowledgeService.buildMindTree("道")],
      ["getKanjiDetail", () => KnowledgeService.getKanjiDetail("道")],
      ["getKnowledgeStats", () => KnowledgeService.getKnowledgeStats()],
    ];

    for (const [name, read] of reads) {
      // Each read must complete against an unbootstrapped database…
      await expect(read(), `${name} must not throw on an empty database`).resolves.toBeDefined();
      // …without invoking the canonical writer…
      expect(seed, `${name} must not seed`).not.toHaveBeenCalled();
      // …and without touching any write verb on the shared client.
      expect(writes, `${name} performed a database write`).toEqual([]);
    }
  });

  it("SRS write routes cannot bootstrap canonical rows either", async () => {
    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const seed = vi.spyOn(KnowledgeService, "ensureSeeded");

    // On an unbootstrapped database these resolve to `null` (row not found).
    await expect(KnowledgeService.addKanjiToSrs({ character: "道" })).resolves.toBeNull();
    await expect(KnowledgeService.addKanaToSrs({ kanaId: "hira-a" })).resolves.toBeNull();

    expect(seed).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("JLPTKnowledgeService.ensureInitialized does not seed canonical Kanji", async () => {
    const { JLPTKnowledgeService } = await import(
      "@/services/jlpt/knowledge/jlptKnowledgeService"
    );
    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const seed = vi.spyOn(KnowledgeService, "ensureSeeded");

    // The corpus/question seeders still run; they are mocked out here so this
    // test measures only the canonical-Kanji boundary.
    const { KnowledgeCorpusService } = await import("@/services/knowledge/corpusService");
    vi.spyOn(KnowledgeCorpusService, "ensureSeeded").mockResolvedValue(undefined);
    const { TestService } = await import("@/services/jlpt/testService");
    vi.spyOn(TestService, "ensureSeeded").mockResolvedValue(undefined);

    await expect(JLPTKnowledgeService.ensureInitialized()).resolves.toBeUndefined();
    expect(seed).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("GET /api/ai/retrieve does not seed canonical Kanji", async () => {
    const { KnowledgeCorpusService } = await import("@/services/knowledge/corpusService");
    vi.spyOn(KnowledgeCorpusService, "ensureSeeded").mockResolvedValue(undefined);

    const { KnowledgeService } = await import("@/services/knowledge/knowledgeService");
    const seed = vi.spyOn(KnowledgeService, "ensureSeeded");

    const { GET } = await import("@/app/api/ai/retrieve/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://localhost/api/ai/retrieve?q=%E6%B0%B4"));

    // No query matched (empty database), so this is a normal miss, not an error.
    expect(response.status).toBe(200);
    expect(seed).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 3. BOUNDARY — the explicit bootstrap is still the guarded operation
 * ------------------------------------------------------------------ */

describe("R1S-follow-up: first-party bootstrap remains explicit and guarded", () => {
  it("is reachable only through a dedicated script, never a route", () => {
    const setup = source("src/services/dictionary/fixtureSetup.ts");
    expect(setup).toContain("KnowledgeService.ensureSeeded(tx)");
    expect(setup).toContain("classifyDatabaseTarget");
    expect(setup).toContain('process.env.NODE_ENV === "production"');
    expect(setup).toContain('target.classification !== "DISPOSABLE"');
    expect(setup).toContain('activeTarget.decision !== "ALLOW"');

    // The script entry point is a standalone operator command…
    const script = source("scripts/seed-dictionary-fixtures.ts");
    expect(script).toContain("seedDictionaryFixturesForDisposableDatabase");
    // …registered in package.json, not exposed as a route handler.
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["dictionary:seed-fixtures"]).toContain("seed-dictionary-fixtures.ts");
  });

  it("refuses to run without an explicitly classified disposable target", async () => {
    const { seedDictionaryFixturesForDisposableDatabase } = await import(
      "@/services/dictionary/fixtureSetup"
    );
    // No DATABASE_URL, no NIHONGO_DB_TARGET_CLASS: the operation must refuse
    // before it can reach the canonical writer.
    const saved = {
      url: process.env.DATABASE_URL,
      cls: process.env.NIHONGO_DB_TARGET_CLASS,
      name: process.env.NIHONGO_DB_EXPECTED_DATABASE,
    };
    delete process.env.DATABASE_URL;
    delete process.env.NIHONGO_DB_TARGET_CLASS;
    delete process.env.NIHONGO_DB_EXPECTED_DATABASE;
    try {
      await expect(seedDictionaryFixturesForDisposableDatabase()).rejects.toThrow(
        /disposable database target/i,
      );
    } finally {
      if (saved.url !== undefined) process.env.DATABASE_URL = saved.url;
      if (saved.cls !== undefined) process.env.NIHONGO_DB_TARGET_CLASS = saved.cls;
      if (saved.name !== undefined) process.env.NIHONGO_DB_EXPECTED_DATABASE = saved.name;
    }
    expect(writes).toEqual([]);
  });
});
