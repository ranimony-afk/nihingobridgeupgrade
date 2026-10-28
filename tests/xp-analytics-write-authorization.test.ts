/**
 * Phase 25 — XP and analytics WRITE-path authorization.
 *
 * VULNERABILITY UNDER TEST (re-verified in the live source before this file
 * was written — commit 16e5aca):
 *
 *   POST   /api/xp          builds its ledger payload from
 *                           `(body.userId as string) || "anonymous-user"`, so
 *                           any caller can award XP to ANY user id, or none.
 *   POST   /api/analytics   forwards `body.userId` into
 *                           `AnalyticsService.trackStudyEvent`, identical
 *                           caller-controlled identity.
 *   DELETE /api/xp          revokes by `dedupeKey` alone: no identity at all,
 *                           so any caller can revoke ANY user's award.
 *
 *   `src/lib/auth` (the Phase 13.3A–13.4D boundary reused by `POST
 *   /api/questions` in PR #20) exists but none of the three routes import it.
 *
 * Layering, and what is real:
 *   - REAL: all three route handlers, the whole `@/lib/auth` pipeline
 *     (verified claims → application user row → CmsActor → role), the pure
 *     role/permission model, `XpService`, `AnalyticsService`.
 *   - FAKE: only the `@/db` boundary — first a chainable, awaitable recording
 *     stub (statement counting + outcome control), then, in the final block, a
 *     disposable in-memory PGlite database reached through the REAL Drizzle
 *     adapter and REAL schema DDL, so "no mutation happened" is a row count,
 *     not a mock assertion.
 *   - PGlite is NOT PostgreSQL: emulated-engine SQL evidence only. No real
 *     PostgreSQL server, no production database, no production credentials.
 *
 * Requirement map (Phase 25 acceptance criteria):
 *   (1) anonymous cannot perform protected writes ............ group A
 *   (2) authenticated users cannot spoof another userId ....... group B
 *   (3) unauthorized roles get the correct response .......... group B/F
 *   (4) authorized owners succeed ............................ group C/G
 *   (5) legitimate cross-user operations require permission ... group B
 *   (6) rejected requests perform zero mutations ............. every case
 *   (7) validation distinguishable from authorization ........ group D
 *   (8) DB failures remain sanitized ......................... group E
 *   (9) XP/analytics success contracts compatible ............ group C/G
 *  (10) Phase 24 sanitization still passes ................... tests/xp-analytics-write-route-sanitization.test.ts
 *  (11) XP write-isolation + question authz regressions ...... run alongside
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/* ------------------------------------------------------------------ *
 * Sentinels — synthetic, never real credentials or production data
 * ------------------------------------------------------------------ */

const SENTINEL_SQL = "INSERT_SENTINEL_a17c INTO xp_events_sentinel_93be VALUES ($1, $2)";
const SENTINEL_DSN =
  "postgresql://sentinel_actor:SENTINEL_PASSWORD_77ab@sentinel-authz-db.invalid:5432/sentinel_authz";
const SENTINEL_PASSWORD = "SENTINEL_PASSWORD_77ab";

const ALL_SENTINELS = [
  SENTINEL_SQL,
  SENTINEL_DSN,
  SENTINEL_PASSWORD,
  "INSERT_SENTINEL_a17c",
  "xp_events_sentinel_93be",
  "sentinel_actor",
  "sentinel-authz-db.invalid",
];

/**
 * A realistic Drizzle failure. Deliberately avoids the words "unique" and
 * "duplicate": `XpService.award` treats a message containing either as a
 * dedupe collision and would convert the failure into a success shape.
 */
function sentinelError(): Error {
  const error = new Error(
    `Failed query: ${SENTINEL_SQL}\nparams: PARAM_SENTINEL_31ce\ndsn=${SENTINEL_DSN}`
  );
  (error as { cause?: unknown }).cause = Object.assign(
    new Error(`password authentication failed for user "sentinel_actor" (${SENTINEL_DSN})`),
    { code: "28P01" }
  );
  return error;
}

/* ------------------------------------------------------------------ *
 * The database boundary is the ONLY module replaced.
 *
 * The holder is swappable per test so the same suite can run the routes
 * against (a) a recording stub and (b) a disposable PGlite database.
 * ------------------------------------------------------------------ */

const { NO_FAILURE, state, dbHolder } = vi.hoisted(() => {
  const NO_FAILURE = Symbol("no-failure");
  return {
    NO_FAILURE,
    dbHolder: { current: null as unknown },
    state: {
      select: NO_FAILURE as unknown,
      insert: NO_FAILURE as unknown,
      update: NO_FAILURE as unknown,
      selectRows: [] as unknown[],
      updateRows: [] as unknown[],
      /** Every mutating statement the routes/services issue, in order. */
      mutations: [] as Array<{ kind: string; table: string; values?: unknown }>,
    },
  };
});

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

import { DELETE as xpDELETE, POST as xpPOST } from "@/app/api/xp/route";
import { POST as analyticsPOST } from "@/app/api/analytics/route";
import type { ApplicationUserRecord, ApplicationUserStore, CmsRole } from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setActorResolver,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
/** Type of the production `db` export; the module itself is mocked at runtime. */
type Database = typeof import("@/db").db;

/* ------------------------------------------------------------------ *
 * Recording Drizzle stub
 * ------------------------------------------------------------------ */

function tableName(table: unknown): string {
  if (typeof table !== "object" || table === null) return "";
  const name = (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
  return typeof name === "string" ? name : "";
}

/**
 * Chainable and awaitable: every property access returns another queryable, so
 * `db.select({...}).from(t).where(...).limit(1)` works at any depth and settles
 * only when awaited. Mutating entry points are recorded before they run.
 */
type MutationEntry = { kind: string; table: string; values?: unknown };

/**
 * Chainable and awaitable: every property access returns another queryable, so
 * `db.select({...}).from(t).where(...).limit(1)` works at any depth and settles
 * only when awaited. `entry` (set for mutating statements) captures the payload
 * handed to `.values()` / `.set()`.
 */
function chain(
  failure: unknown,
  rows: unknown[],
  entry: MutationEntry | null = null
): unknown {
  const target = {
    then(onFulfilled: unknown, onRejected: unknown) {
      const settled =
        failure === NO_FAILURE ? Promise.resolve(rows) : Promise.reject(failure);
      return settled.then(onFulfilled as never, onRejected as never);
    },
  };
  return new Proxy(target, {
    get(inner, prop) {
      if (prop in inner) return (inner as Record<string | symbol, unknown>)[prop];
      return (...args: unknown[]) => {
        if (entry !== null && (prop === "values" || prop === "set")) {
          entry.values = args[0];
        }
        return chain(failure, rows, entry);
      };
    },
  });
}

function record(kind: string, table: string): MutationEntry {
  const entry: MutationEntry = { kind, table };
  state.mutations.push(entry);
  return entry;
}

function installStub(): void {
  dbHolder.current = {
    select: () => chain(state.select, state.selectRows),
    insert: (table: unknown) =>
      chain(state.insert, [], record("insert", tableName(table))),
    update: (table: unknown) =>
      chain(state.update, state.updateRows, record("update", tableName(table))),
    delete: (table: unknown) =>
      chain(NO_FAILURE, [], record("delete", tableName(table))),
  };
}

/** Mutating statements only — the "zero writes" oracle. */
function mutations(): Array<{ kind: string; table: string; values?: unknown }> {
  return state.mutations;
}

/* ------------------------------------------------------------------ *
 * Auth doubles — the users table, and verified provider claims
 * ------------------------------------------------------------------ */

/** In-memory users table (mirrors the unique (provider, subject) index). */
class FakeUserStore implements ApplicationUserStore {
  private readonly rows = new Map<string, ApplicationUserRecord>();
  /** When set, the next lookup rejects. */
  failure: unknown = null;

  get size(): number {
    return this.rows.size;
  }

  seed(provider: string, subject: string, row: ApplicationUserRecord): void {
    this.rows.set(`${provider}:${subject}`, row);
  }

  async findByProviderIdentity(
    provider: string,
    subject: string
  ): Promise<ApplicationUserRecord | null> {
    if (this.failure !== null) {
      const failure = this.failure;
      this.failure = null;
      throw failure;
    }
    return this.rows.get(`${provider}:${subject}`) ?? null;
  }

  async insertUserIfAbsent(row: {
    id: string;
    name: string;
    authProvider: string;
    authSubject: string;
    role: "learner";
  }): Promise<ApplicationUserRecord | null> {
    const key = `${row.authProvider}:${row.authSubject}`;
    if (this.rows.has(key)) return null;
    const created: ApplicationUserRecord = {
      id: row.id,
      name: row.name,
      role: row.role,
    };
    this.rows.set(key, created);
    return created;
  }
}

let users: FakeUserStore;

/** Verified-claims client: `null` means "no session". */
function authenticateAs(
  claims: Record<string, unknown> | null,
  options: { fail?: boolean } = {}
) {
  setSupabaseClientFactory(() => ({
    auth: {
      getClaims: async () => {
        if (options.fail) throw new Error("identity provider unreachable");
        return claims === null
          ? { data: null, error: { message: "Auth session missing!" } }
          : { data: { claims }, error: null };
      },
    },
  }));
}

/** Seed + verify an application user with a stored role. */
function actAs(role: CmsRole, id = `${role}-1`) {
  const subject = `sub-${id}`;
  users.seed("supabase", subject, { id, name: role, role });
  authenticateAs({ sub: subject, email: `${id}@example.com` });
  return id;
}

const ANONYMOUS = () => authenticateAs(null);

/* ------------------------------------------------------------------ *
 * Request builders
 * ------------------------------------------------------------------ */

function postRequest(path: string, body: unknown): NextRequest {
  const url = new URL(path, "http://phase25.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => body,
  }) as unknown as NextRequest;
}

function malformedJsonRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase25.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => {
      throw new SyntaxError(`Unexpected token < in JSON at position 0 near ${SENTINEL_SQL}`);
    },
  }) as unknown as NextRequest;
}

function deleteRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase25.invalid");
  return Object.assign(new Request(url, { method: "DELETE" }), { nextUrl: url }) as NextRequest;
}

async function body(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

/** No internals, no identifier material, no policy vocabulary may leak. */
function expectSanitized(responseBody: Record<string, any>): void {
  const text = JSON.stringify(responseBody).toLowerCase();
  for (const leak of ALL_SENTINELS) {
    expect(text).not.toContain(leak.toLowerCase());
  }
  for (const leak of ["insert into", "sql", "password", "postgres", "drizzle", "stack"]) {
    expect(text).not.toContain(leak);
  }
}

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  users = new FakeUserStore();
  setApplicationUserStore(users);
  state.select = NO_FAILURE;
  state.insert = NO_FAILURE;
  state.update = NO_FAILURE;
  state.selectRows = [];
  state.updateRows = [];
  state.mutations = [];
  installStub();
});

afterEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  vi.restoreAllMocks();
});

/* ================================================================== *
 * (1) Anonymous callers cannot perform any protected write
 * ================================================================== */

describe("Phase 25 (1): anonymous write attempts fail closed", () => {
  it("1. POST /api/xp is rejected with 401 and writes nothing", async () => {
    ANONYMOUS();
    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );

    expect(response.status).toBe(401);
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.code).toBe("UNAUTHENTICATED");
    expectSanitized(json);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mutations()).toHaveLength(0);
  });

  it("2. POST /api/analytics is rejected with 401 and writes nothing", async () => {
    ANONYMOUS();
    const response = await analyticsPOST(
      postRequest("/api/analytics", { itemType: "vocabulary", itemId: "de-mizu" })
    );

    expect(response.status).toBe(401);
    expect((await body(response)).code).toBe("UNAUTHENTICATED");
    expect(mutations()).toHaveLength(0);
  });

  it("3. DELETE /api/xp is rejected with 401 and writes nothing", async () => {
    ANONYMOUS();
    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"));

    expect(response.status).toBe(401);
    expect((await body(response)).code).toBe("UNAUTHENTICATED");
    expect(mutations()).toHaveLength(0);
  });

  it("4. a caller-supplied userId confers no identity to an anonymous request", async () => {
    ANONYMOUS();
    for (const claimed of ["victim-1", "admin-1", "learner-1"]) {
      const xp = await xpPOST(
        postRequest("/api/xp", {
          eventType: "content.read",
          sourceId: "de-mizu",
          userId: claimed,
        })
      );
      expect(xp.status).toBe(401);

      const analytics = await analyticsPOST(
        postRequest("/api/analytics", {
          itemType: "vocabulary",
          itemId: "de-mizu",
          userId: claimed,
        })
      );
      expect(analytics.status).toBe(401);
    }
    expect(mutations()).toHaveLength(0);
  });

  it("5. no identity configuration at all still fails closed (default resolver)", async () => {
    // No supabase factory, no actor resolver, no users store override.
    resetSupabaseClientFactory();
    resetActorResolver();
    resetApplicationUserStore();

    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );
    expect(response.status).toBe(401);
    expect((await body(response)).code).toBe("UNAUTHENTICATED");
    expect(mutations()).toHaveLength(0);
  });

  it("6. a broken identity provider resolves to anonymous, not to a trusted actor", async () => {
    authenticateAs(null, { fail: true });
    const response = await analyticsPOST(
      postRequest("/api/analytics", { itemType: "kanji", itemId: "水" })
    );
    expect(response.status).toBe(401);
    expect(mutations()).toHaveLength(0);
  });
});

/* ================================================================== *
 * (2)(3)(5) Spoofed identity and cross-user access
 * ================================================================== */

describe("Phase 25 (2): authenticated callers cannot act as another user", () => {
  it("7. POST /api/xp with a foreign userId is 403 and writes nothing", async () => {
    actAs("learner", "learner-1");
    const response = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        userId: "victim-1",
      })
    );

    expect(response.status).toBe(403);
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.code).toBe("FORBIDDEN");
    expectSanitized(json);
    // The rejected request must not have written a ledger row for the victim
    // or for the caller.
    expect(mutations()).toHaveLength(0);
  });

  it("8. POST /api/analytics with a foreign userId is 403 and writes nothing", async () => {
    actAs("learner", "learner-1");
    const response = await analyticsPOST(
      postRequest("/api/analytics", {
        itemType: "vocabulary",
        itemId: "de-mizu",
        userId: "victim-1",
      })
    );

    expect(response.status).toBe(403);
    expect((await body(response)).code).toBe("FORBIDDEN");
    expect(mutations()).toHaveLength(0);
  });

  it("9. DELETE /api/xp on another user's event is 403 and rewrites nothing", async () => {
    actAs("learner", "learner-1");
    state.selectRows = [{ userId: "victim-1" }];

    const response = await xpDELETE(
      deleteRequest("/api/xp?dedupeKey=review:rev-victim")
    );

    expect(response.status).toBe(403);
    expect((await body(response)).code).toBe("FORBIDDEN");
    expect(mutations()).toHaveLength(0);
  });

  it("10. DELETE /api/xp ignores a userId query parameter (query is never identity)", async () => {
    const me = actAs("learner", "learner-1");
    // Own key: allowed. The foreign userId in the query changes nothing.
    state.selectRows = [{ userId: me }];
    state.updateRows = [{ points: 5 }];
    const own = await xpDELETE(
      deleteRequest("/api/xp?dedupeKey=review:rev-1&userId=victim-1")
    );
    expect(own.status).toBe(200);
    expect(await body(own)).toEqual({ success: true, revoked: true, points: 5 });

    // Victim's key: still refused.
    state.selectRows = [{ userId: "victim-1" }];
    const foreign = await xpDELETE(
      deleteRequest("/api/xp?dedupeKey=review:rev-victim&userId=learner-1")
    );
    expect(foreign.status).toBe(403);
  });

  it("11. no CMS role confers a cross-user XP bypass (no invented admin authority)", async () => {
    for (const role of ["admin", "editor", "reviewer", "learner"] as const) {
      state.mutations = [];
      actAs(role, `${role}-actor`);

      const award = await xpPOST(
        postRequest("/api/xp", {
          eventType: "content.read",
          sourceId: "de-mizu",
          userId: "victim-1",
        })
      );
      expect(award.status).toBe(403);
      expect(mutations()).toHaveLength(0);

      const analytics = await analyticsPOST(
        postRequest("/api/analytics", {
          itemType: "vocabulary",
          itemId: "de-mizu",
          userId: "victim-1",
        })
      );
      expect(analytics.status).toBe(403);

      state.selectRows = [{ userId: "victim-1" }];
      const revoke = await xpDELETE(deleteRequest("/api/xp?dedupeKey=review:rev-victim"));
      expect(revoke.status).toBe(403);

      expect(mutations()).toHaveLength(0);
    }
  });

  it("12. an unknown stored role degrades to learner and still cannot spoof", async () => {
    users.seed("supabase", "sub-u-9", { id: "u-9", name: "root", role: "superuser" });
    authenticateAs({ sub: "sub-u-9" });

    const spoof = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        userId: "victim-1",
      })
    );
    expect(spoof.status).toBe(403);
    // ...and self-award still works, proving the role degraded rather than
    // the actor vanishing.
    state.mutations = [];
    const self = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );
    expect(self.status).toBe(200);
  });

  it("13. malformed identity claims never resolve to an actor (401, no writes)", async () => {
    for (const claims of [
      { email: "ghost@example.com" },
      { sub: "" },
      { sub: 12345 },
      { sub: ["sub-attacker"] },
      null,
    ]) {
      authenticateAs(claims as Record<string, unknown> | null);
      const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=review:rev-1"));
      expect(response.status).toBe(401);
    }
    expect(mutations()).toHaveLength(0);
  });
});

/* ================================================================== *
 * (4)(9) Authorized owners succeed; success contracts preserved
 * ================================================================== */

describe("Phase 25 (4)(9): the authenticated owner keeps the documented contracts", () => {
  it("14. POST /api/xp awards to the verified actor id, not to a fallback", async () => {
    const me = actAs("learner", "learner-1");
    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );

    expect(response.status).toBe(200);
    const json = await body(response);
    expect(json.success).toBe(true);
    expect(json.result).toMatchObject({
      awarded: true,
      duplicate: false,
      skipped: false,
      points: expect.any(Number),
      ruleKey: "content-read",
    });
    expect(json.code).toBeUndefined();

    const ledgerWrite = mutations().find(
      (entry) => entry.kind === "insert" && entry.table === "xp_events"
    );
    expect(ledgerWrite).toBeDefined();
    expect((ledgerWrite?.values as { userId?: string }).userId).toBe(me);
  });

  it("15. POST /api/xp accepts an explicit self userId", async () => {
    const me = actAs("learner", "learner-1");
    const response = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        userId: me,
      })
    );
    expect(response.status).toBe(200);
    const ledgerWrite = mutations().find(
      (entry) => entry.kind === "insert" && entry.table === "xp_events"
    );
    expect((ledgerWrite?.values as { userId?: string }).userId).toBe(me);
  });

  it("16. POST /api/analytics tracks the verified actor and keeps its envelope", async () => {
    const me = actAs("learner", "learner-1");
    const response = await analyticsPOST(
      postRequest("/api/analytics", {
        itemType: "vocabulary",
        itemId: "de-mizu",
        jlptLevel: "N5",
      })
    );

    expect(response.status).toBe(200);
    const json = await body(response);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ awarded: true, points: expect.any(Number) });
    expect(json.code).toBeUndefined();

    const ledgerWrite = mutations().find(
      (entry) => entry.kind === "insert" && entry.table === "xp_events"
    );
    expect((ledgerWrite?.values as { userId?: string }).userId).toBe(me);
    expect((ledgerWrite?.values as { dedupeKey?: string }).dedupeKey).toContain(me);
  });

  it("17. every role may act on its own XP and analytics records", async () => {
    for (const role of ["learner", "reviewer", "editor", "admin"] as const) {
      const me = actAs(role, `${role}-self`);
      state.mutations = [];

      const xp = await xpPOST(
        postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
      );
      expect(xp.status).toBe(200);

      const analytics = await analyticsPOST(
        postRequest("/api/analytics", { itemType: "kanji", itemId: "水" })
      );
      expect(analytics.status).toBe(200);

      const writes = mutations().filter(
        (entry) => entry.kind === "insert" && entry.table === "xp_events"
      );
      expect(writes).not.toHaveLength(0);
      for (const write of writes) {
        expect((write.values as { userId?: string }).userId).toBe(me);
      }
    }
  });

  it("18. DELETE /api/xp revokes the caller's own event and reports the points", async () => {
    const me = actAs("learner", "learner-1");
    state.selectRows = [{ userId: me }];
    state.updateRows = [{ points: 7 }];

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, revoked: true, points: 7 });
    expect(mutations().some((entry) => entry.kind === "update")).toBe(true);
  });

  it("19. DELETE /api/xp keeps the revoked:false envelope for an unknown key", async () => {
    actAs("learner", "learner-1");
    state.selectRows = [];
    state.updateRows = [];

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=nothing-here"));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, revoked: false, points: 0 });
  });

  it("20. duplicate reporting stays idempotent for the owner", async () => {
    actAs("learner", "learner-1");
    state.selectRows = [{ id: "xp-existing-1", points: 5 }];

    const response = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        dedupeKey: "content.read:de-mizu",
      })
    );
    expect(response.status).toBe(200);
    expect((await body(response)).result).toMatchObject({
      awarded: false,
      duplicate: true,
      eventId: "xp-existing-1",
    });
  });
});

/* ================================================================== *
 * (7) Validation stays distinguishable from authorization
 * ================================================================== */

describe("Phase 25 (7): validation errors are not authorization errors", () => {
  it("21. an unknown eventType is 400 with the documented message and no code", async () => {
    actAs("learner", "learner-1");
    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "not.a.real.event" })
    );
    expect(response.status).toBe(400);
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.error).toContain("eventType must be one of:");
    expect(json.code).toBeUndefined();
    expect(mutations()).toHaveLength(0);
  });

  it("22. a malformed JSON body is 400 for an authenticated caller", async () => {
    actAs("learner", "learner-1");
    const response = await xpPOST(malformedJsonRequest("/api/xp"));
    expect(response.status).toBe(400);
    const json = await body(response);
    expect(json).toEqual({ success: false, error: "Request body must be valid JSON" });
    expectSanitized(json);
    expect(mutations()).toHaveLength(0);
  });

  it("23. missing itemType/itemId is 400 for an authenticated caller", async () => {
    actAs("learner", "learner-1");
    const response = await analyticsPOST(
      postRequest("/api/analytics", { userId: "learner-1" })
    );
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      success: false,
      error: "itemType and itemId are required",
    });
    expect(mutations()).toHaveLength(0);
  });

  it("24. missing dedupeKey is 400 for an authenticated caller", async () => {
    actAs("learner", "learner-1");
    const response = await xpDELETE(deleteRequest("/api/xp"));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      success: false,
      error: "dedupeKey is required",
    });
    expect(mutations()).toHaveLength(0);
  });

  it("25. a non-string userId is a 400 field error, not a 403", async () => {
    actAs("learner", "learner-1");
    for (const claimed of [123, true, ["learner-1"], { id: "learner-1" }]) {
      const xp = await xpPOST(
        postRequest("/api/xp", {
          eventType: "content.read",
          sourceId: "de-mizu",
          userId: claimed,
        })
      );
      expect(xp.status).toBe(400);
      expect((await body(xp)).code).toBeUndefined();

      const analytics = await analyticsPOST(
        postRequest("/api/analytics", {
          itemType: "vocabulary",
          itemId: "de-mizu",
          userId: claimed,
        })
      );
      expect(analytics.status).toBe(400);
    }
    expect(mutations()).toHaveLength(0);
  });

  it("26. authorization is evaluated before body parsing (anonymous 401, not 400)", async () => {
    ANONYMOUS();
    const response = await xpPOST(malformedJsonRequest("/api/xp"));
    expect(response.status).toBe(401);
    const json = await body(response);
    expect(json.code).toBe("UNAUTHENTICATED");
    // the parser's message (which quotes the body) must not be echoed
    expectSanitized(json);
  });
});

/* ================================================================== *
 * (8) Database and identity-pipeline failures stay sanitized
 * ================================================================== */

describe("Phase 25 (8): failures stay sanitized after authorization is added", () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("27. a failed ledger insert is a sanitized 500, never a 200", async () => {
    actAs("learner", "learner-1");
    state.insert = sentinelError();

    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const json = await body(response);
    expect(json).toEqual({
      success: false,
      error: "Failed to award XP",
      code: "INTERNAL_ERROR",
    });
    expectSanitized(json);
  });

  it("28. a failed owner lookup on DELETE is a sanitized 500", async () => {
    actAs("learner", "learner-1");
    state.select = sentinelError();

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=review:rev-1"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.code).toBe("INTERNAL_ERROR");
    expectSanitized(json);
  });

  it("29. a failing identity lookup is a sanitized 500, not a 401", async () => {
    users.seed("supabase", "sub-learner-1", { id: "learner-1", name: "l", role: "learner" });
    authenticateAs({ sub: "sub-learner-1" });
    users.failure = sentinelError();

    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );

    // The caller is authenticated; the failure is server-side. Reporting 401
    // would blame the client and would also leak nothing, but it would be a
    // lie about a database failure.
    expect(response.status).toBe(500);
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.code).toBe("INTERNAL_ERROR");
    expectSanitized(json);
    expect(mutations()).toHaveLength(0);
    expect(errorLog).toHaveBeenCalled();
  });
});

/* ================================================================== *
 * PGlite integration — real SQL, real adapter, real row counts
 * ================================================================== */

const MIGRATION = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

function tableDdl(table: string): string {
  const start = MIGRATION.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table} in the migration`);
  const end = MIGRATION.indexOf(");", start);
  if (end === -1) throw new Error(`unterminated DDL for ${table}`);
  return MIGRATION.slice(start, end + 2);
}

describe("Phase 25: disposable PGlite — rejected writes leave the ledger untouched", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(tableDdl("xp_rules"));
    await client.exec(tableDdl("xp_events"));
    // Read by `XpService.currentStreak` on the real award path.
    await client.exec(tableDdl("srs_user_settings"));
    await client.exec(tableDdl("srs_reviews"));
    // The production adapter over a real (in-memory, disposable) database.
    dbHolder.current = drizzle(client) as unknown as Database;
  });

  afterEach(async () => {
    await client.close();
  });

  async function ledgerRows(): Promise<
    Array<{ user_id: string; dedupe_key: string | null; revoked_at: Date | null }>
  > {
    const result = await client.query<{
      user_id: string;
      dedupe_key: string | null;
      revoked_at: Date | null;
    }>("SELECT user_id, dedupe_key, revoked_at FROM xp_events ORDER BY user_id");
    return result.rows;
  }

  it("30. the owner's award lands as a real row under the verified id", async () => {
    const me = actAs("learner", "learner-1");

    const response = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        dedupeKey: "content.read:de-mizu",
      })
    );
    expect(response.status).toBe(200);

    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(me);
    expect(rows[0]!.dedupe_key).toBe("content.read:de-mizu");
  });

  it("31. a spoofed award writes zero rows", async () => {
    expect(await ledgerRows()).toHaveLength(0);

    // anonymous + foreign userId → 401
    ANONYMOUS();
    const anonymous = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        userId: "victim-1",
      })
    );
    expect(anonymous.status).toBe(401);
    expect(await ledgerRows()).toHaveLength(0);

    // authenticated + foreign userId → 403
    actAs("learner", "learner-1");
    const spoof = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        userId: "victim-1",
      })
    );
    expect(spoof.status).toBe(403);
    expect(await ledgerRows()).toHaveLength(0);
  });

  it("32. only the owner can revoke, and revocation is a real column update", async () => {
    const me = actAs("learner", "learner-1");
    await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        dedupeKey: "content.read:de-mizu",
      })
    );
    expect((await ledgerRows())[0]!.revoked_at).toBeNull();

    // anonymous: no change
    ANONYMOUS();
    expect((await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"))).status).toBe(401);
    expect((await ledgerRows())[0]!.revoked_at).toBeNull();

    // a different authenticated user: no change
    actAs("learner", "learner-2");
    expect((await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"))).status).toBe(403);
    expect((await ledgerRows())[0]!.revoked_at).toBeNull();

    // the owner: revoked
    actAs("learner", me);
    const own = await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"));
    expect(own.status).toBe(200);
    expect(await body(own)).toMatchObject({ success: true, revoked: true });
    const rows = await ledgerRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revoked_at).not.toBeNull();
  });

  it("33. an unknown dedupeKey creates and changes nothing", async () => {
    actAs("learner", "learner-1");
    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=missing-key"));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ success: true, revoked: false, points: 0 });
    expect(await ledgerRows()).toHaveLength(0);
  });
});
