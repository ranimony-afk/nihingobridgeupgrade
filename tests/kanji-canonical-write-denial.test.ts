/**
 * R1S — canonical Kanji ETL write-denial tests (database-free).
 *
 * These tests prove, at runtime, that the shared canonical Kanji write
 * boundary refuses unconditionally:
 *
 *   - every guarded loader (`ensureKanjiSource`, `loadKanjiRadicals`,
 *     `loadKanjiEntries`, `loadKanjiComposition`, `loadTransformedKanji`),
 *     through BOTH the direct module and the `@/etl/kanji` barrel;
 *   - non-dry-run pipeline execution, before transformation or loader
 *     invocation;
 *   - the aggregate loader independently of any subordinate loader guard.
 *
 * They also pin the ordering guarantee: denial happens before the database
 * client is touched, before any query/transaction, before the caller's input
 * is traversed, and before the caller's result object is mutated.
 *
 * `@/db` is replaced by a recording proxy that throws on ANY property access,
 * so any real Drizzle call (select / insert / update / delete / transaction)
 * fails the test loudly instead of reaching a database.
 *
 * Scope note — what these tests do NOT prove:
 *   Mocking the shared Drizzle client detects accesses through that client.
 *   It does not prove that no other code path opens a raw `pg` connection or
 *   speaks to the network directly; such paths are outside the five guarded
 *   exports and outside this PR's scope. Static source checks (the
 *   "static guard placement" block at the end) are clearly separated from the
 *   runtime evidence above: they are regex/order assertions over the committed
 *   source, not execution evidence.
 *
 * No database, no DATABASE_URL and no network access are required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Recording database double. Hoisted so `vi.mock` can reference it.
 * Every property read is recorded and then refused.
 */
const database = vi.hoisted(() => {
  const access: string[] = [];
  const refuse = (surface: string, property: PropertyKey): never => {
    access.push(`${surface}.${String(property)}`);
    throw new Error(`canonical-write denial failed: ${surface}.${String(property)} was touched`);
  };
  const db = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get: (_target, property) => refuse("db", property),
    set: (_target, property) => refuse("db", property),
  });
  const pool = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get: (_target, property) => refuse("pool", property),
    set: (_target, property) => refuse("pool", property),
  });
  return { access, db, pool };
});

vi.mock("@/db", () => ({ db: database.db, pool: database.pool }));

import {
  CANONICAL_KANJI_WRITE_DENIED,
  CanonicalKanjiWriteDeniedError,
} from "@/etl/kanji/canonicalWriteGate";
import * as directLoader from "@/etl/kanji/loader";
import * as kanjiBarrel from "@/etl/kanji";
import { runKanjiETLPipeline } from "@/etl/kanji/pipeline";

/** Assert a denial with the expected code and the expected boundary label. */
async function expectDenied(
  run: () => Promise<unknown>,
  operation: string,
): Promise<void> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(CanonicalKanjiWriteDeniedError);
  const denial = caught as CanonicalKanjiWriteDeniedError;
  expect(denial.code).toBe(CANONICAL_KANJI_WRITE_DENIED);
  // Sensitivity to guard removal/relocation: a guard missing from this export
  // surfaces a DIFFERENT operation label (or no denial at all), failing here.
  expect(denial.operation).toBe(operation);
  expect(denial.message).toContain("Canonical Kanji ETL write denied");
}

/** An input that records and fails if anything iterates it. */
function hostileIterable(label: string): { value: unknown; touches: () => number } {
  let touches = 0;
  const value = {
    [Symbol.iterator](): never {
      touches += 1;
      throw new Error(`hostile input traversed: ${label}`);
    },
  };
  return { value, touches: () => touches };
}

/** An input object that records and fails on ANY property access. */
function hostileRecord(label: string): { value: unknown; touches: () => number } {
  let touches = 0;
  const value = new Proxy(Object.create(null) as Record<PropertyKey, unknown>, {
    get: (_target, property): never => {
      touches += 1;
      throw new Error(`hostile input read: ${label}.${String(property)}`);
    },
  });
  return { value, touches: () => touches };
}

/** A result/accumulator object that records and fails on read OR write. */
function guardedResult(): {
  value: Record<string, number>;
  accesses: () => string[];
} {
  const accesses: string[] = [];
  const value = new Proxy({} as Record<string, number>, {
    get: (_target, property): never => {
      accesses.push(`get:${String(property)}`);
      throw new Error(`result was read: ${String(property)}`);
    },
    set: (_target, property): never => {
      accesses.push(`set:${String(property)}`);
      throw new Error(`result was mutated: ${String(property)}`);
    },
  });
  return { value, accesses: () => accesses };
}

const APPROVAL_LIKE_ENV = [
  "NIHONGO_CANONICAL_WRITE_APPROVAL",
  "NIHONGO_KANJI_ETL_ALLOW",
  "ALLOW_CANONICAL_KANJI_WRITE",
  "CANONICAL_WRITE_AUTHORIZED",
  "KANJI_ETL_AUTHORIZATION",
] as const;

beforeEach(() => {
  database.access.length = 0;
  for (const key of APPROVAL_LIKE_ENV) delete process.env[key];
});

describe("guarded loader denial — direct module imports", () => {
  it("ensureKanjiSource denies before database access", async () => {
    await expectDenied(() => directLoader.ensureKanjiSource(), "ensureKanjiSource");
    expect(database.access).toEqual([]);
  });

  it("loadKanjiRadicals denies with nonempty input before traversal or mutation", async () => {
    const radicals = hostileIterable("radicals");
    const result = guardedResult();

    await expectDenied(
      () => directLoader.loadKanjiRadicals(radicals.value as never, result.value as never),
      "loadKanjiRadicals",
    );

    expect(radicals.touches()).toBe(0);
    expect(result.accesses()).toEqual([]);
    expect(database.access).toEqual([]);
  });

  it("loadKanjiEntries denies with nonempty input before traversal or mutation", async () => {
    const entries = hostileIterable("entries");
    const result = guardedResult();

    await expectDenied(
      () => directLoader.loadKanjiEntries(entries.value as never, result.value as never),
      "loadKanjiEntries",
    );

    expect(entries.touches()).toBe(0);
    expect(result.accesses()).toEqual([]);
    expect(database.access).toEqual([]);
  });

  it("loadKanjiComposition denies with nonempty input before traversal or mutation", async () => {
    const compositions = hostileIterable("compositions");
    const result = guardedResult();

    await expectDenied(
      () => directLoader.loadKanjiComposition(compositions.value as never, result.value as never),
      "loadKanjiComposition",
    );

    expect(compositions.touches()).toBe(0);
    expect(result.accesses()).toEqual([]);
    expect(database.access).toEqual([]);
  });

  it("loadTransformedKanji denies before reading its aggregate payload", async () => {
    const data = hostileRecord("data");

    await expectDenied(
      () => directLoader.loadTransformedKanji(data.value as never),
      "loadTransformedKanji",
    );

    expect(data.touches()).toBe(0);
    expect(database.access).toEqual([]);
  });
});

describe("guarded loader denial — barrel imports stay consistent", () => {
  it("barrel re-exports are the same denied functions as the direct module", () => {
    // Consistency check: the barrel is not a second, unguarded surface.
    expect(kanjiBarrel.ensureKanjiSource).toBe(directLoader.ensureKanjiSource);
    expect(kanjiBarrel.loadKanjiRadicals).toBe(directLoader.loadKanjiRadicals);
    expect(kanjiBarrel.loadKanjiEntries).toBe(directLoader.loadKanjiEntries);
    expect(kanjiBarrel.loadKanjiComposition).toBe(directLoader.loadKanjiComposition);
    expect(kanjiBarrel.loadTransformedKanji).toBe(directLoader.loadTransformedKanji);
  });

  it("every barrel-imported loader denies independently", async () => {
    const entries = hostileIterable("entries");
    const radicals = hostileIterable("radicals");
    const compositions = hostileIterable("compositions");
    const data = hostileRecord("data");
    const result = guardedResult();

    await expectDenied(() => kanjiBarrel.ensureKanjiSource(), "ensureKanjiSource");
    await expectDenied(
      () => kanjiBarrel.loadKanjiRadicals(radicals.value as never, result.value as never),
      "loadKanjiRadicals",
    );
    await expectDenied(
      () => kanjiBarrel.loadKanjiEntries(entries.value as never, result.value as never),
      "loadKanjiEntries",
    );
    await expectDenied(
      () => kanjiBarrel.loadKanjiComposition(compositions.value as never, result.value as never),
      "loadKanjiComposition",
    );
    await expectDenied(
      () => kanjiBarrel.loadTransformedKanji(data.value as never),
      "loadTransformedKanji",
    );

    expect([entries.touches(), radicals.touches(), compositions.touches(), data.touches()]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(result.accesses()).toEqual([]);
    expect(database.access).toEqual([]);
  });
});

describe("aggregate loader denial is independent of subordinate guards", () => {
  it("denies at its own boundary even when subordinate loaders are unguarded", async () => {
    // `loadTransformedKanji` delegates to ensureKanjiSource/loadKanjiRadicals/
    // loadKanjiEntries/loadKanjiComposition. If its own guard were removed (or
    // relocated below the first subordinate call), this call would either
    // surface a subordinate operation label or touch `data` / the database.
    const data = hostileRecord("aggregate-data");
    await expectDenied(
      () => directLoader.loadTransformedKanji(data.value as never),
      "loadTransformedKanji",
    );
    expect(data.touches()).toBe(0);
    expect(database.access).toEqual([]);
  });
});

describe("pipeline denial — non-dry-run is refused before any work", () => {
  it("denies a default invocation (no options) before transformation or loader use", async () => {
    await expectDenied(() => runKanjiETLPipeline(), "runKanjiETLPipeline");
    expect(database.access).toEqual([]);
  });

  it("denies explicit dryRun: false / undefined / null-like options", async () => {
    await expectDenied(() => runKanjiETLPipeline({ dryRun: false }), "runKanjiETLPipeline");
    await expectDenied(() => runKanjiETLPipeline({ dryRun: undefined }), "runKanjiETLPipeline");
    await expectDenied(
      () => runKanjiETLPipeline(null as never),
      "runKanjiETLPipeline",
    );
    expect(database.access).toEqual([]);
  });

  it("denies before traversing supplied kanji/radicals inputs", async () => {
    const kanji = hostileRecord("options.kanji");
    const radicals = hostileRecord("options.radicals");

    await expectDenied(
      () =>
        runKanjiETLPipeline({
          get kanji() {
            return (kanji.value as never[]);
          },
          get radicals() {
            return (radicals.value as never[]);
          },
          dryRun: false,
        }),
      "runKanjiETLPipeline",
    );

    expect(kanji.touches()).toBe(0);
    expect(radicals.touches()).toBe(0);
    expect(database.access).toEqual([]);
  });

  it("denies before invoking the transformer (malformed payload never reaches it)", async () => {
    // `validateAndTransformKanjiData` would throw on these records. Receiving
    // the denial instead proves transformation did not run.
    await expectDenied(
      () =>
        runKanjiETLPipeline({
          kanji: [null, undefined, { character: 42 }] as never[],
          radicals: [null] as never[],
        }),
      "runKanjiETLPipeline",
    );
    expect(database.access).toEqual([]);
  });

  it("ignores forged approval-like option fields", async () => {
    const forged = {
      dryRun: false,
      approved: true,
      authorized: true,
      authorization: { approvedBy: "caller", scope: "canonical-kanji" },
      approvalToken: "synthetic-token",
      allowCanonicalWrites: true,
      canonicalWriteApproved: true,
    };

    await expectDenied(
      () => runKanjiETLPipeline(forged as never),
      "runKanjiETLPipeline",
    );
    expect(database.access).toEqual([]);
  });

  it("requires the literal boolean true — truthy lookalikes do not open the gate", async () => {
    for (const dryRun of ["true", 1, {}, [], { approved: true }] as unknown[]) {
      await expectDenied(
        () => runKanjiETLPipeline({ dryRun } as never),
        "runKanjiETLPipeline",
      );
    }
    expect(database.access).toEqual([]);
  });

  it("ignores approval-like environment variables and a configured DATABASE_URL", async () => {
    const savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:5432/nihongo_test";
    for (const key of APPROVAL_LIKE_ENV) process.env[key] = "1";

    try {
      await expectDenied(
        () => runKanjiETLPipeline({ dryRun: false } as never),
        "runKanjiETLPipeline",
      );
      expect(database.access).toEqual([]);
    } finally {
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabaseUrl;
    }
  });
});

describe("explicit dry run remains available and performs no writes", () => {
  it("transforms and reports the pilot corpus without database access", async () => {
    const result = await runKanjiETLPipeline({ dryRun: true });

    expect(result.kanjiProcessed).toBe(12);
    expect(result.kanjiInserted).toBe(0);
    expect(result.kanjiUpdated).toBe(0);
    expect(result.kanjiSkipped).toBe(12);
    expect(result.radicalsProcessed).toBeGreaterThanOrEqual(5);
    expect(result.radicalsInserted).toBe(0);
    expect(result.compositionProcessed).toBeGreaterThanOrEqual(12);
    expect(result.compositionInserted).toBe(0);
    expect(result.errors).toEqual([]);
    expect(database.access).toEqual([]);
  });

  it("stays write-free even with forged approval fields attached", async () => {
    const result = await runKanjiETLPipeline({
      dryRun: true,
      approved: true,
      approvalToken: "synthetic-token",
    } as never);

    expect(result.kanjiInserted).toBe(0);
    expect(result.kanjiUpdated).toBe(0);
    expect(result.errors).toEqual([]);
    expect(database.access).toEqual([]);
  });
});

/*
 * ---------------------------------------------------------------------------
 * STATIC source checks — clearly separated from the runtime evidence above.
 *
 * These read the committed source text and assert guard placement/order. They
 * are a review aid (they would catch a guard moved below a database call even
 * if the runtime double were also bypassed), NOT runtime proof.
 * ---------------------------------------------------------------------------
 */
describe("static guard placement (source checks, not runtime evidence)", () => {
  const loaderSource = readFileSync(
    fileURLToPath(new URL("../src/etl/kanji/loader.ts", import.meta.url)),
    "utf8",
  );
  const pipelineSource = readFileSync(
    fileURLToPath(new URL("../src/etl/kanji/pipeline.ts", import.meta.url)),
    "utf8",
  );
  const gateSource = readFileSync(
    fileURLToPath(new URL("../src/etl/kanji/canonicalWriteGate.ts", import.meta.url)),
    "utf8",
  );

  /**
   * Text of an exported async function body, starting right after its opening
   * `{`. Parameters are skipped with paren balancing so a default value such
   * as `options = {}` is not mistaken for the body.
   */
  function exportedBody(source: string, name: string): string {
    const marker = `export async function ${name}(`;
    const start = source.indexOf(marker);
    expect(start, `missing export ${name}`).toBeGreaterThanOrEqual(0);

    const paramsOpen = source.indexOf("(", start);
    expect(paramsOpen, `missing parameters for ${name}`).toBeGreaterThan(start);

    let depth = 0;
    let paramsClose = -1;
    for (let i = paramsOpen; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          paramsClose = i;
          break;
        }
      }
    }
    expect(paramsClose, `unbalanced parameters for ${name}`).toBeGreaterThan(paramsOpen);

    const openBrace = source.indexOf("{", paramsClose);
    expect(openBrace, `missing body for ${name}`).toBeGreaterThan(paramsClose);
    return source.slice(openBrace + 1);
  }

  /** Remove comments so ordering assertions examine code, not prose. */
  function stripComments(body: string): string {
    return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  /** Remove leading line/block comments so the first statement can be compared. */
  function firstStatement(body: string): string {
    let rest = body.trimStart();
    for (;;) {
      if (rest.startsWith("//")) {
        const newline = rest.indexOf("\n");
        rest = newline === -1 ? "" : rest.slice(newline + 1).trimStart();
        continue;
      }
      if (rest.startsWith("/*")) {
        const end = rest.indexOf("*/");
        rest = end === -1 ? "" : rest.slice(end + 2).trimStart();
        continue;
      }
      return rest;
    }
  }

  it("each guarded loader's first statement is its own denial", () => {
    for (const name of [
      "ensureKanjiSource",
      "loadKanjiRadicals",
      "loadKanjiEntries",
      "loadKanjiComposition",
      "loadTransformedKanji",
    ]) {
      const statement = firstStatement(exportedBody(loaderSource, name));
      expect(
        statement.startsWith(`denyCanonicalKanjiWrite("${name}");`),
        `${name} guard placement`,
      ).toBe(true);
    }
  });

  it("the pipeline denial precedes transformation, input reads and loader invocation", () => {
    const body = stripComments(exportedBody(pipelineSource, "runKanjiETLPipeline"));
    const denial = body.indexOf('denyCanonicalKanjiWrite("runKanjiETLPipeline")');
    const transform = body.indexOf("validateAndTransformKanjiData(");
    const loader = body.indexOf("loadTransformedKanji(");
    const inputRead = body.indexOf("options.kanji");

    expect(denial).toBeGreaterThanOrEqual(0);
    expect(transform).toBeGreaterThan(denial);
    expect(loader).toBeGreaterThan(denial);
    expect(inputRead).toBeGreaterThan(denial);
  });

  it("the guard module exposes no environment override or approval input", () => {
    expect(gateSource).toContain("export function denyCanonicalKanjiWrite(");
    expect(gateSource).not.toContain("process.env");
    expect(loaderSource).not.toContain("process.env");
    // The gate takes only a diagnostic label; it has no approval parameter.
    expect(gateSource).toMatch(/denyCanonicalKanjiWrite\(operation: string\): void/);
    // ...and it still always throws rather than returning a decision.
    expect(gateSource).toContain("throw new CanonicalKanjiWriteDeniedError(operation);");
  });
});
