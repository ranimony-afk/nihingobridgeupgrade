/**
 * Phase 26A — XP deduplication isolation (cross-user `dedupe_key` collisions).
 *
 * VULNERABILITY UNDER TEST (re-verified in the live source and schema before
 * this file was written — commit 6d3266e):
 *
 *   `xp_events.dedupe_key` is UNIQUE **globally** (`src/db/schema.ts:618`,
 *   `CONSTRAINT "xp_events_dedupe_key_unique" UNIQUE("dedupe_key")`), and
 *   `XpService.award` runs its duplicate fast-path on the key alone
 *   (`xpService.ts:250-270`). Consequences:
 *
 *     (a) SUPPRESSION — whoever writes a key first wins it for everyone. A
 *         second learner using the same logical key is reported as a duplicate
 *         and silently earns 0 XP. This is not hypothetical: `POST /api/xp`
 *         derives `content.read:<sourceId>` and `knowledge:<cardId>` keys that
 *         are identical for every user studying the same item.
 *     (b) DISCLOSURE — the duplicate response returns `eventId: existing.id`
 *         for that global row, i.e. another user's event id.
 *     (c) PRE-CLAIM — an authenticated caller can write the key another user
 *         will later use (the row is attributed to the claimer), converting (a)
 *         into a deliberate denial of XP.
 *
 * Layers, stated honestly:
 *   - REAL: `XpService` (award/revoke/ownership), the real `POST`/`DELETE
 *     /api/xp` handlers, the Phase 25 authorization pipeline, and the real
 *     Drizzle adapter executing real SQL.
 *   - ENGINE: an in-memory **PGlite** instance with the production DDL from
 *     `drizzle/0000_absurd_emma_frost.sql` plus the Phase 26A migration when it
 *     exists. PGlite is an emulated PostgreSQL: SQL, constraints and index
 *     semantics are real, but it is NOT a PostgreSQL server, and its statement
 *     execution is serialised (the "race" tests exercise the conflict handler,
 *     not true parallelism).
 *   - GENUINE POSTGRESQL: the final `describe` block runs the same core
 *     scenarios against `process.env.DATABASE_URL` (the disposable CI database,
 *     provisioned with `drizzle-kit push` from `schema.ts`). It is skipped when
 *     no URL is configured, and says so in its title.
 *   - No production database, credentials or user data are used anywhere.
 */
import { readFileSync, readdirSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/* ------------------------------------------------------------------ *
 * The database boundary — swappable so the same routes/services can run
 * against PGlite (default) or the real PostgreSQL pool (opt-in block).
 * ------------------------------------------------------------------ */

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { current: null as unknown } }));

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

import { DELETE as xpDELETE, POST as xpPOST } from "@/app/api/xp/route";
import { resetActorResolver, setActorResolver } from "@/lib/auth";
import { XpService } from "@/services/gamification/xpService";

/* ------------------------------------------------------------------ *
 * DDL from the committed migrations (never hand-written)
 * ------------------------------------------------------------------ */

const MIGRATION_0000 = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

/** Extract the real `CREATE TABLE` statement for a table from the baseline. */
function tableDdl(migration: string, table: string): string {
  const start = migration.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table}`);
  const end = migration.indexOf(");", start);
  if (end === -1) throw new Error(`unterminated DDL for ${table}`);
  return migration.slice(start, end + 2);
}

/**
 * The Phase 26A migration, located by convention rather than by a hard-coded
 * name. Absent before the fix is implemented — that is itself part of the
 * vulnerable baseline (test 10 asserts its shape).
 */
function isolationMigration(): { name: string; sql: string } | null {
  const file = readdirSync("drizzle")
    .filter((n) => /^0004_.*\.sql$/.test(n))
    .sort()[0];
  if (!file) return null;
  return { name: file, sql: readFileSync(`drizzle/${file}`, "utf8") };
}

/** Split a Drizzle migration into executable statements. */
function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

/** Tables the real award path touches: ledger, day window, streak. */
const AWARD_PATH_TABLES = ["xp_events", "srs_user_settings", "srs_reviews"];

async function createAwardSchema(client: PGlite): Promise<void> {
  for (const table of AWARD_PATH_TABLES) {
    await client.exec(tableDdl(MIGRATION_0000, table));
  }
  const migration = isolationMigration();
  if (migration) {
    for (const statement of statements(migration.sql)) {
      await client.exec(statement);
    }
  }
}

/* ------------------------------------------------------------------ *
 * PGlite harness
 * ------------------------------------------------------------------ */

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  await createAwardSchema(client);
  dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
}, 60_000);

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`DELETE FROM "xp_events"; DELETE FROM "srs_reviews"; DELETE FROM "srs_user_settings";`);
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const USER_A = "p26a-user-a";
const USER_B = "p26a-user-b";

/** Award through the real service, as the analytics/POST paths do. */
function award(userId: string, dedupeKey: string, sourceId = "de-mizu") {
  return XpService.award({
    payload: {
      eventType: "content.read",
      userId,
      sourceType: "vocabulary",
      sourceId,
    },
    dedupeKey,
  });
}

interface LedgerRow {
  id: string;
  user_id: string;
  dedupe_key: string | null;
  revoked_at: Date | null;
}

async function ledger(): Promise<LedgerRow[]> {
  const result = await client.query<LedgerRow>(
    `SELECT id, user_id, dedupe_key, revoked_at FROM "xp_events" ORDER BY user_id`
  );
  return result.rows;
}

/** Verified actor for the route-level cases (the Phase 25 seam). */
function actAs(id: string) {
  setActorResolver(() => ({ id, role: "learner" }));
}

function postRequest(body: unknown): NextRequest {
  const url = new URL("/api/xp", "http://phase26a.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => body,
  }) as unknown as NextRequest;
}

function deleteRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase26a.invalid");
  return Object.assign(new Request(url, { method: "DELETE" }), {
    nextUrl: url,
  }) as unknown as NextRequest;
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

afterEach(() => {
  resetActorResolver();
});

/* ================================================================== *
 * 1-2, 5 — cross-user suppression, disclosure and legitimate sharing
 * ================================================================== */

describe("Phase 26A: a key owned by one user cannot suppress another user's award", () => {
  it("1. user A pre-claims the key user B will use; B is still awarded", async () => {
    const key = "content.read:de-mizu"; // exactly what POST /api/xp derives

    const first = await award(USER_A, key);
    expect(first.awarded).toBe(true);

    const second = await award(USER_B, key);

    // The vulnerable implementation answers awarded:false/duplicate:true here.
    expect(second.awarded).toBe(true);
    expect(second.duplicate).toBe(false);

    const rows = await ledger();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id).sort()).toEqual([USER_A, USER_B]);
    expect(rows.every((r) => r.dedupe_key === key)).toBe(true);
  });

  it("2. a duplicate response never discloses another user's event id", async () => {
    const key = "content.read:su-mizu";

    const owner = await award(USER_B, key);
    expect(owner.awarded).toBe(true);
    const ownerEventId = owner.eventId as string;
    expect(ownerEventId).toBeTypeOf("string");

    const other = await award(USER_A, key);

    // No field of A's result may carry B's identifiers.
    expect(JSON.stringify(other)).not.toContain(ownerEventId);
    expect(other.awarded).toBe(true);
    expect(other.eventId).not.toBe(ownerEventId);

    const rows = await ledger();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("3. equivalent logical keys for two users coexist without interference", async () => {
    // The analytics producer's key shape (`study:<type>:<user>:<item>`).
    const keyFor = (user: string) => `study:vocabulary:${user}:de-mizu`;

    const a = await award(USER_A, keyFor(USER_A));
    const b = await award(USER_B, keyFor(USER_B));

    expect(a.awarded).toBe(true);
    expect(b.awarded).toBe(true);
    expect(await ledger()).toHaveLength(2);

    // ...and a shared, user-agnostic key (the `knowledge:<cardId>` shape).
    const shared = "knowledge:card-77";
    expect((await award(USER_A, shared)).awarded).toBe(true);
    expect((await award(USER_B, shared)).awarded).toBe(true);
    expect(await ledger()).toHaveLength(4);
  });

  it("4. the route rejects a foreign claim but does not leak or suppress (POST /api/xp)", async () => {
    const key = "content.read:ki-mizu";
    const owner = await award(USER_B, key);
    const ownerEventId = owner.eventId as string;

    actAs(USER_A);
    const response = await xpPOST(
      postRequest({ eventType: "content.read", sourceId: "ki-mizu", dedupeKey: key, userId: USER_A })
    );
    expect(response.status).toBe(200);

    const body = await json(response);
    expect(body.success).toBe(true);
    expect(body.result.awarded).toBe(true);
    expect(JSON.stringify(body)).not.toContain(ownerEventId);
    expect(await ledger()).toHaveLength(2);

    // Same-user replay through the route stays idempotent.
    const replay = await xpPOST(
      postRequest({ eventType: "content.read", sourceId: "ki-mizu", dedupeKey: key, userId: USER_A })
    );
    const replayed = await json(replay);
    expect(replayed.result.awarded).toBe(false);
    expect(replayed.result.duplicate).toBe(true);
    expect(await ledger()).toHaveLength(2);
  });
});

/* ================================================================== *
 * 3 — same-user idempotency is preserved
 * ================================================================== */

describe("Phase 26A: same-user idempotency is unchanged", () => {
  it("5. repeating one user's award returns that user's own event and writes nothing", async () => {
    const key = "review:rev-9001";

    const first = await award(USER_A, key);
    expect(first.awarded).toBe(true);
    expect(first.points).toBeGreaterThan(0);

    const replay = await award(USER_A, key);
    expect(replay.awarded).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.points).toBe(0);
    expect(replay.eventId).toBe(first.eventId);

    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(USER_A);
  });
});

/* ================================================================== *
 * 6 — revoke isolation (the failure mode a composite key introduces)
 * ================================================================== */

describe("Phase 26A: revocation stays inside one user's ledger", () => {
  it("6. revoking a key revokes only the caller's own event", async () => {
    const key = "knowledge:card-88";
    const a = await award(USER_A, key);
    const b = await award(USER_B, key);
    expect(a.awarded).toBe(true);
    expect(b.awarded).toBe(true);
    expect(await ledger()).toHaveLength(2);

    actAs(USER_A);
    const response = await xpDELETE(deleteRequest(`/api/xp?dedupeKey=${encodeURIComponent(key)}`));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ success: true, revoked: true });

    const rows = await ledger();
    const rowA = rows.find((r) => r.user_id === USER_A)!;
    const rowB = rows.find((r) => r.user_id === USER_B)!;
    expect(rowA.revoked_at).not.toBeNull();
    expect(rowB.revoked_at).toBeNull(); // B's award is untouched
  });

  it("7. a key that only another user owns is refused, and their row is untouched", async () => {
    const key = "knowledge:card-89";
    await award(USER_B, key);

    actAs(USER_A);
    const response = await xpDELETE(deleteRequest(`/api/xp?dedupeKey=${encodeURIComponent(key)}`));
    expect(response.status).toBe(403);
    expect((await json(response)).code).toBe("FORBIDDEN");

    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revoked_at).toBeNull();
  });

  it("8. an unknown key keeps the revoked:false contract and creates nothing", async () => {
    actAs(USER_A);
    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=never-existed"));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ success: true, revoked: false, points: 0 });
    expect(await ledger()).toHaveLength(0);
  });
});

/* ================================================================== *
 * 6 — races and conflict classification
 * ================================================================== */

describe("Phase 26A: insert-time conflicts are classified precisely", () => {
  it("9. a lost race on the same (user, key) is a duplicate, not a second award", async () => {
    const key = "review:race-1";
    // The winner's row is already committed...
    await award(USER_A, key);

    // ...and the fast-path read misses it, exactly as two concurrent awards can.
    const real = dbHolder.current as Record<string | symbol, any>;
    let misses = 1;
    dbHolder.current = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "select" && misses > 0) {
          misses -= 1;
          return () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = await award(USER_A, key);
    dbHolder.current = real;

    expect(result.awarded).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(result.eventId).toBeUndefined(); // the conflict path returns no id at all
    expect(await ledger()).toHaveLength(1);
  });

  it("10. a non-dedupe unique violation is not swallowed as a duplicate", async () => {
    // A synthetic second uniqueness rule on the ledger: same user + same source.
    await client.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS p26a_source_unique ON "xp_events" ("user_id", "source_id")`
    );
    try {
      const first = await award(USER_A, "content.read:first", "shared-source");
      expect(first.awarded).toBe(true);

      // Different dedupe key, same source → the INSERT must fail on that index.
      // The vulnerable classifier matches the word "unique" in the driver
      // message and would report a harmless duplicate instead of a failure.
      await expect(award(USER_A, "content.read:second", "shared-source")).rejects.toBeTruthy();

      expect(await ledger()).toHaveLength(1);
    } finally {
      await client.exec(`DROP INDEX IF EXISTS p26a_source_unique`);
    }
  });
});

/* ================================================================== *
 * 10 — migration policy: existing rows, existing constraint
 * ================================================================== */

describe("Phase 26A: the dedupe constraint change is safe for historical rows", () => {
  it("11. a migration replaces the global unique key with a per-user one", () => {
    const migration = isolationMigration();
    expect(migration, "no drizzle/0004_*.sql migration exists").not.toBeNull();
    const sql = migration!.sql;

    // It must retire the global constraint and scope uniqueness to the user.
    expect(sql).toMatch(/DROP CONSTRAINT\s+"?xp_events_dedupe_key_unique"?/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(\s*"?user_id"?\s*,\s*"?dedupe_key"?\s*\)/i);
    // No destructive statements: historical ledger rows are never rewritten.
    expect(sql).not.toMatch(/\b(DELETE|TRUNCATE|DROP TABLE)\b/i);
  });

  it("18. the committed migration chain applies in order and ends with the per-user rule", async () => {
    const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
    expect(files.at(-1)).toMatch(/^0004_/);

    const chained = new PGlite();
    try {
      for (const file of files) {
        for (const statement of statements(readFileSync(`drizzle/${file}`, "utf8"))) {
          await chained.exec(statement);
        }
      }

      const indexes = await chained.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'xp_events'`
      );
      expect(indexes.rows.map((r) => r.indexdef).join("\n")).toMatch(
        /UNIQUE INDEX idx_xp_events_user_dedupe_key_unique[\s\S]*\(user_id, dedupe_key\)/
      );

      // The global rule is gone: no bare UNIQUE constraint remains on xp_events.
      const constraints = await chained.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'xp_events'::regclass AND contype = 'u'`
      );
      expect(constraints.rows).toEqual([]);
    } finally {
      await chained.close();
    }
  });

  it("12. applying the migration to a populated legacy table preserves every row", async () => {
    const migration = isolationMigration();
    expect(migration).not.toBeNull();

    const legacy = new PGlite();
    try {
      await legacy.exec(tableDdl(MIGRATION_0000, "xp_events"));

      // Historical rows as the global-unique era produced them: distinct keys,
      // attributed to whatever id the old anonymous fallback allowed, plus a
      // keyless row (dedupe_key IS NULL is legal and must stay legal).
      await legacy.exec(`
        INSERT INTO "xp_events" (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
        VALUES
          ('xp-hist-1', 'anonymous-user', 'content.read', 'content-read', '1.0.0', 5, 'vocabulary', 'content.read:de-mizu'),
          ('xp-hist-2', 'legacy-user-2', 'review.graded', 'review-graded', '1.0.0', 10, 'review', 'review:rev-1'),
          ('xp-hist-3', 'legacy-user-3', 'review.graded', 'review-graded', '1.0.0', 10, 'review', NULL)
      `);

      const before = await legacy.query(
        `SELECT id, user_id, dedupe_key, points, revoked_at FROM "xp_events" ORDER BY id`
      );

      for (const statement of statements(migration!.sql)) {
        await legacy.exec(statement);
      }

      const after = await legacy.query(
        `SELECT id, user_id, dedupe_key, points, revoked_at FROM "xp_events" ORDER BY id`
      );
      expect(after.rows).toEqual(before.rows); // identical rows, no rewrite
      expect(after.rows).toHaveLength(3);

      // The new rule is enforced...
      await expect(
        legacy.exec(`INSERT INTO "xp_events" (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
                     VALUES ('xp-dup', 'legacy-user-2', 'content.read', 'content-read', '1.0.0', 5, 'vocabulary', 'review:rev-1')`)
      ).rejects.toBeTruthy();

      // ...while a different user may now hold the same key.
      await legacy.exec(`INSERT INTO "xp_events" (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
                         VALUES ('xp-other', 'legacy-user-9', 'content.read', 'content-read', '1.0.0', 5, 'vocabulary', 'review:rev-1')`);

      // ...and a second keyless row is still accepted.
      await legacy.exec(`INSERT INTO "xp_events" (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
                         VALUES ('xp-null-2', 'legacy-user-9', 'review.graded', 'review-graded', '1.0.0', 1, 'review', NULL)`);

      const final = await legacy.query<{ count: number }>(`SELECT count(*)::int AS count FROM "xp_events"`);
      expect(final.rows[0]!.count).toBe(5);
    } finally {
      await legacy.close();
    }
  });
});

/* ================================================================== *
 * Phase 25 contract regression on real SQL
 * ================================================================== */

describe("Phase 26A: authorization contract still holds on the real ledger", () => {
  it("13. anonymous writes are refused and add no rows", async () => {
    resetActorResolver(); // no verified identity
    const response = await xpPOST(
      postRequest({ eventType: "content.read", sourceId: "de-mizu", dedupeKey: "content.read:de-mizu" })
    );
    expect(response.status).toBe(401);
    expect((await json(response)).code).toBe("UNAUTHENTICATED");
    expect(await ledger()).toHaveLength(0);
  });

  it("14. a foreign userId claim is refused and adds no rows", async () => {
    actAs(USER_A);
    const response = await xpPOST(
      postRequest({ eventType: "content.read", sourceId: "de-mizu", userId: USER_B })
    );
    expect(response.status).toBe(403);
    expect(await ledger()).toHaveLength(0);
  });
});

/* ================================================================== *
 * Genuine PostgreSQL (opt-in) — the same core guarantees on a real server
 * ================================================================== */

const PG_URL = process.env.DATABASE_URL;

describe.skipIf(!PG_URL)("Phase 26A: genuine PostgreSQL — core isolation guarantees", () => {
  const suffix = `p26a-${Date.now()}`;
  const a = `${suffix}-a`;
  const b = `${suffix}-b`;

  beforeAll(async () => {
    const actual = await import("@/db");
    dbHolder.current = actual.db; // the real node-postgres pool
  });

  afterEach(async () => {
    const actual = await import("@/db");
    const { xpEvents } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    // Only the synthetic fixtures this block created.
    await actual.db.delete(xpEvents).where(inArray(xpEvents.userId, [a, b]));
  });

  it("15. two users may hold the same key, and neither suppresses the other", async () => {
    const key = "content.read:de-mizu";
    const first = await award(a, key);
    const second = await award(b, key);

    expect(first.awarded).toBe(true);
    expect(second.awarded).toBe(true);
    expect(first.eventId).not.toBe(second.eventId);
  });

  it("16. same-user idempotency still holds on PostgreSQL", async () => {
    const key = "review:rev-pg-1";
    const first = await award(a, key);
    const replay = await award(a, key);

    expect(first.awarded).toBe(true);
    expect(replay.awarded).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.eventId).toBe(first.eventId);
  });

  it("17. revocation on PostgreSQL touches only the caller's row", async () => {
    const key = "knowledge:card-pg";
    await award(a, key);
    await award(b, key);

    actAs(a);
    const response = await xpDELETE(deleteRequest(`/api/xp?dedupeKey=${encodeURIComponent(key)}`));
    expect(response.status).toBe(200);

    const actual = await import("@/db");
    const { xpEvents } = await import("@/db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");
    const rows = await actual.db
      .select({ userId: xpEvents.userId, revokedAt: xpEvents.revokedAt })
      .from(xpEvents)
      .where(and(inArray(xpEvents.userId, [a, b]), eq(xpEvents.dedupeKey, key)));

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === a)!.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.userId === b)!.revokedAt).toBeNull();
  });
});
