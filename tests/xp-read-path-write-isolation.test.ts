/**
 * Phase 22B-5 — read paths must not write.
 *
 * `GET /api/xp` and `GET /api/analytics` both reach `XpService.syncRegistry`,
 * which mirrors the code rule registry into `xp_rules`. The mirror is a
 * legitimate requirement (audit + admin joins), so the initialisation must
 * still happen. What must not happen is an upsert on every single read: it
 * rewrites all rule rows, refreshes every `synced_at`, and produces write
 * amplification from an unauthenticated GET.
 *
 * These tests run the real route handlers against a real PostgreSQL engine
 * (PGlite over the wire protocol, via the application's own `@/db` pool). They
 * assert on **observed database state**, not on mock call counts: a full
 * schema/row snapshot before and after, plus the exact `synced_at` values, plus
 * the statements the pool actually issued.
 *
 * Nothing here touches a production database: the server is an in-memory
 * PGlite instance created by this file and torn down in `afterAll`.
 */
import { execFileSync } from "node:child_process";
import type { AddressInfo, Server } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import type { Pool } from "pg";
import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fingerprint, snapshotDatabase, type DatabaseSnapshot } from "./helpers/pglite-full-snapshot";

type RuleRow = {
  key: string;
  version: string;
  event_type: string;
  name: string;
  description: string;
  base_points: number;
  daily_cap: number;
  default_params: unknown;
  is_active: boolean;
  synced_at: string;
};

let database: PGlite;
let server: Server;
let backingPool: Pool;
let poolClosed = false;
let previousPool: Pool | undefined;
let xpGET: typeof import("@/app/api/xp/route").GET;
let analyticsGET: typeof import("@/app/api/analytics/route").GET;
let listRules: typeof import("@/services/gamification/xpRegistry").listRules;
let XP_RULE_COUNT: number;
const poolCache = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };

function request(path: string): NextRequest {
  const nextUrl = new URL(path, "http://xp-write-isolation.invalid");
  return { nextUrl, url: nextUrl.toString(), method: "GET" } as NextRequest;
}

/** Every rule row as the database actually stores it. */
async function ruleRows(): Promise<RuleRow[]> {
  return (
    await database.query<RuleRow>(
      `SELECT key, version, event_type, name, description, base_points, daily_cap,
              default_params, is_active, synced_at::text AS synced_at
       FROM xp_rules ORDER BY key`
    )
  ).rows;
}

async function countRows(table: string): Promise<number> {
  const result = await database.query<{ count: string }>(
    `SELECT cast(count(*) as text) AS count FROM ${table}`
  );
  return Number(result.rows[0]?.count ?? "0");
}

/** Statements the application's pool actually issued, as SQL text. */
function issuedStatements(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map(([query]) => {
    if (typeof query === "string") return query;
    return ((query as { text?: string })?.text ?? "") as string;
  });
}

const WRITE = /^\s*(?:insert\s+into|update\s|delete\s+from)\b/i;

function writesIn(statements: string[]): string[] {
  return statements.filter((statement) => WRITE.test(statement));
}

beforeAll(async () => {
  // Export DDL offline; no inherited database URL and no application credentials.
  const schema = execFileSync(
    process.execPath,
    [
      "node_modules/drizzle-kit/bin.cjs",
      "export",
      "--dialect",
      "postgresql",
      "--schema",
      "./src/db/schema.ts",
    ],
    {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    }
  );

  database = new PGlite();
  await database.waitReady;
  await database.exec(schema);

  server = createServer(database);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const disposableUrl = `postgresql://postgres:disposable@127.0.0.1:${port}/postgres`;

  // This is our own in-memory server, not an arbitrary loopback URL.
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

  xpGET = (await import("@/app/api/xp/route")).GET;
  analyticsGET = (await import("@/app/api/analytics/route")).GET;
  const registry = await import("@/services/gamification/xpRegistry");
  listRules = registry.listRules;
  XP_RULE_COUNT = registry.XP_RULE_COUNT;
}, 120_000);

afterAll(async () => {
  if (backingPool && !poolClosed) await backingPool.end();
  poolClosed = true;
  if (server?.listening)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  if (database) await database.close();
  delete poolCache.__arenaNextJsPostgresqlPool;
  if (previousPool) poolCache.__arenaNextJsPostgresqlPool = previousPool;
  vi.unstubAllEnvs();
  vi.resetModules();
}, 120_000);

/* ============================================================
 * A. Required initialisation semantics are preserved
 * ============================================================ */
describe("A. an empty disposable database still initialises on first read", () => {
  it("GET /api/xp populates the rule mirror exactly once and keeps its response contract", async () => {
    expect(await countRows("xp_rules")).toBe(0);

    const response = await xpGET(request("/api/xp"));
    expect(response.status).toBe(200);
    const body = await response.json();

    // Response contract: unchanged.
    expect(body.success).toBe(true);
    expect(body.registry.ruleCount).toBe(XP_RULE_COUNT);
    expect(body.rules).toHaveLength(XP_RULE_COUNT);
    expect(body.summary.userId).toBe("anonymous-user");
    expect(body.summary.totalXp).toBe(0);
    expect(body.summary.level.level).toBeGreaterThanOrEqual(1);
    expect(body.summary.bySource).toEqual([]);
    // One cap-usage row per rule that declares a daily cap.
    expect(body.summary.capUsage.length).toBe(listRules().filter((rule) => rule.dailyCap > 0).length);

    // Required initialisation: the audit mirror is populated, with every
    // registry key present and active.
    const rows = await ruleRows();
    expect(rows).toHaveLength(XP_RULE_COUNT);
    expect(rows.map((row) => row.key).sort()).toEqual(listRules().map((rule) => rule.key).sort());
    expect(rows.every((row) => row.is_active)).toBe(true);
  }, 120_000);

  it("GET /api/analytics seeds the learning tables it depends on", async () => {
    expect(await countRows("questions")).toBe(0);

    const response = await analyticsGET(request("/api/analytics"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("anonymous-user");
    expect(body.data.xp.totalPoints).toBe(0);
    expect(body.data.studyMetrics.srsReviewsCompleted).toBe(0);

    // The seeding that makes the summary meaningful still happens.
    expect(await countRows("questions")).toBeGreaterThan(0);
    expect(await countRows("xp_rules")).toBe(XP_RULE_COUNT);
  }, 120_000);
});

/* ============================================================
 * B. Repeated reads on a populated database perform no writes
 * ============================================================ */
describe("B. repeated reads never write to a populated database", () => {
  it("GET /api/xp x3 issues no INSERT/UPDATE/DELETE and changes no row", async () => {
    const before: DatabaseSnapshot = await snapshotDatabase(database);
    const beforeRules = await ruleRows();
    expect(beforeRules.length).toBe(XP_RULE_COUNT);

    const queries = vi.spyOn(backingPool, "query");
    const bodies: unknown[] = [];
    try {
      for (let i = 0; i < 3; i += 1) {
        const response = await xpGET(request("/api/xp"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        bodies.push(body.summary);
      }

      const statements = issuedStatements(queries);
      // The read path did reach the database …
      expect(statements.length).toBeGreaterThan(0);
      // … and it issued no writes at all.
      expect(writesIn(statements)).toEqual([]);
    } finally {
      queries.mockRestore();
    }

    // Same summary on every call: the reads are genuinely idempotent.
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);

    // The database is byte-identical: no row rewritten, no `synced_at` bumped.
    const after = await snapshotDatabase(database);
    expect(after).toEqual(before);
    expect(fingerprint(after)).toBe(fingerprint(before));
    expect(await ruleRows()).toEqual(beforeRules);

    console.log(
      `[xp-write-isolation] GET /api/xp x3: 0 writes, unchanged SHA-256 ${fingerprint(after)}`
    );
  }, 120_000);

  it("GET /api/analytics x3 issues no INSERT/UPDATE/DELETE and changes no row", async () => {
    const before = await snapshotDatabase(database);
    const beforeRules = await ruleRows();

    const queries = vi.spyOn(backingPool, "query");
    const bodies: unknown[] = [];
    try {
      for (let i = 0; i < 3; i += 1) {
        const response = await analyticsGET(request("/api/analytics"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        bodies.push(body.data);
      }

      const statements = issuedStatements(queries);
      expect(statements.length).toBeGreaterThan(0);
      expect(writesIn(statements)).toEqual([]);
    } finally {
      queries.mockRestore();
    }

    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);

    const after = await snapshotDatabase(database);
    expect(after).toEqual(before);
    expect(fingerprint(after)).toBe(fingerprint(before));
    expect(await ruleRows()).toEqual(beforeRules);

    console.log(
      `[xp-write-isolation] GET /api/analytics x3: 0 writes, unchanged SHA-256 ${fingerprint(after)}`
    );
  }, 120_000);
});

/* ============================================================
 * C. The mirror still self-heals — the *required* writes still happen
 * ============================================================ */
describe("C. repair semantics are preserved", () => {
  it("repairs a drifted rule row, and rewrites only that row", async () => {
    const rules = listRules();
    const target = rules[0];
    const before = await ruleRows();
    const untouchedBefore = before.filter((row) => row.key !== target.key);

    // Simulate drift: wrong points, stale sync marker.
    await database.query(
      `UPDATE xp_rules SET base_points = base_points + 100, synced_at = '2000-01-01T00:00:00Z'
       WHERE key = $1`,
      [target.key]
    );

    const response = await xpGET(request("/api/xp"));
    expect(response.status).toBe(200);

    const after = await ruleRows();
    const repaired = after.find((row) => row.key === target.key)!;
    expect(repaired.base_points).toBe(target.basePoints);
    expect(new Date(repaired.synced_at).getTime()).toBeGreaterThan(
      new Date("2000-01-01T00:00:00Z").getTime()
    );

    // Only the drifted row was rewritten — no blanket upsert of all rules.
    expect(after.filter((row) => row.key !== target.key)).toEqual(untouchedBefore);
  }, 120_000);

  it("recreates a deleted rule row", async () => {
    const target = listRules()[1];
    await database.query(`DELETE FROM xp_rules WHERE key = $1`, [target.key]);
    expect((await ruleRows()).some((row) => row.key === target.key)).toBe(false);

    const response = await xpGET(request("/api/xp"));
    expect(response.status).toBe(200);

    const rows = await ruleRows();
    expect(rows).toHaveLength(XP_RULE_COUNT);
    const restored = rows.find((row) => row.key === target.key)!;
    expect(restored.version).toBe(target.version);
    expect(restored.base_points).toBe(target.basePoints);
    expect(restored.is_active).toBe(true);
  }, 120_000);
});
