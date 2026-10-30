/**
 * Phase 26B — authorization for the XP and analytics READ routes.
 *
 * VULNERABILITY UNDER TEST (re-verified in the live source before this file was
 * written — commit ac7f4d0):
 *
 *   `GET /api/xp`      `const userId = sp.get("userId") || "anonymous-user"`
 *   `GET /api/analytics` `const userId = params.get("userId") || "anonymous-user"`
 *
 *   Both handlers read a caller-supplied `userId` straight out of the query
 *   string and serve that user's XP totals, level, streak, source breakdown and
 *   analytic summary. No authentication, no ownership check, no fallback to the
 *   caller's own identity: any anonymous request can read any learner's data,
 *   which is the read half of the resource that Phase 25 locked down for writes.
 *
 * The intended contract (Phase 26B):
 *
 *   anonymous                        → 401 (sanitized, no-store)
 *   authenticated, userId absent     → the actor's OWN data
 *   authenticated, userId === actor  → the actor's OWN data
 *   authenticated, userId foreign    → 403 (sanitized, no-store)
 *   authenticated, empty/repeated    → 400 (validation, not authorization)
 *   any role (learner…admin)         → no cross-user bypass
 *
 * Layering, stated honestly:
 *   - REAL: both route handlers, the whole `@/lib/auth` pipeline, the real
 *     `XpService.getSummary` and `AnalyticsService.getUserProgressSummary`.
 *   - ENGINE: PGlite with the production DDL from
 *     `drizzle/0000_absurd_emma_frost.sql` plus the Phase 26A migration — real
 *     SQL and real constraints on an EMULATED PostgreSQL (not a server).
 *     The analytics READ path is additionally exercised through a service spy
 *     because `AnalyticsService.getUserProgressSummary` seeds several unrelated
 *     tables; that limitation is named where it applies.
 *   - No production database, credentials or user data are used.
 */
import { readFileSync, readdirSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/* ------------------------------------------------------------------ *
 * The database boundary is the only module replaced.
 * ------------------------------------------------------------------ */

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { current: null as unknown } }));

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

import { GET as xpGET } from "@/app/api/xp/route";
import { GET as analyticsGET } from "@/app/api/analytics/route";
import { POST as xpPOST } from "@/app/api/xp/route";
import type { ApplicationUserRecord, ApplicationUserStore, CmsRole } from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import { XpService } from "@/services/gamification/xpService";
import { AnalyticsService } from "@/services/analytics";

/* ------------------------------------------------------------------ *
 * Auth doubles (the Phase 25 seams)
 * ------------------------------------------------------------------ */

class FakeUserStore implements ApplicationUserStore {
  private readonly rows = new Map<string, ApplicationUserRecord>();

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
    const created: ApplicationUserRecord = { id: row.id, name: row.name, role: row.role };
    this.rows.set(key, created);
    return created;
  }
}

let users: FakeUserStore;

function authenticateAs(claims: Record<string, unknown> | null) {
  setSupabaseClientFactory(() => ({
    auth: {
      getClaims: async () =>
        claims === null
          ? { data: null, error: { message: "Auth session missing!" } }
          : { data: { claims }, error: null },
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

function getRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase26b.invalid");
  return Object.assign(new Request(url, { method: "GET" }), {
    nextUrl: url,
  }) as unknown as NextRequest;
}

function postRequest(path: string, body: unknown): NextRequest {
  const url = new URL(path, "http://phase26b.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => body,
  }) as unknown as NextRequest;
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

/** No internals may reach the client. */
function expectSanitized(responseBody: Record<string, any>): void {
  const text = JSON.stringify(responseBody).toLowerCase();
  for (const leak of [
    "select ",
    "from \"xp_events\"",
    "sql",
    "password",
    "postgres",
    "drizzle",
    "stack",
    "at object.",
  ]) {
    expect(text).not.toContain(leak);
  }
}

/* ------------------------------------------------------------------ *
 * Service spies — "the protected read was never reached"
 * ------------------------------------------------------------------ */

let xpSummarySpy: ReturnType<typeof vi.spyOn>;
let analyticsSummarySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  users = new FakeUserStore();
  setApplicationUserStore(users);

  xpSummarySpy = vi.spyOn(XpService, "getSummary");
  analyticsSummarySpy = vi.spyOn(AnalyticsService, "getUserProgressSummary");
});

afterEach(() => {
  vi.restoreAllMocks();
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
});

/* ================================================================== *
 * 1. Anonymous reads are refused
 * ================================================================== */

describe("Phase 26B: anonymous reads fail closed", () => {
  it("1. GET /api/xp is 401 and never reaches the summary service", async () => {
    ANONYMOUS();
    const response = await xpGET(getRequest("/api/xp"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "Authentication required.",
      code: "UNAUTHENTICATED",
    });
    expectSanitized(body);
    expect(xpSummarySpy).not.toHaveBeenCalled();
  });

  it("2. GET /api/analytics is 401 and never reaches the analytics service", async () => {
    ANONYMOUS();
    const response = await analyticsGET(getRequest("/api/analytics"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await json(response)).code).toBe("UNAUTHENTICATED");
    expect(analyticsSummarySpy).not.toHaveBeenCalled();
  });

  it("3. a caller-supplied userId confers no identity on an anonymous request", async () => {
    ANONYMOUS();
    for (const claimed of ["victim-1", "admin-1", "anonymous-user"]) {
      const xp = await xpGET(getRequest(`/api/xp?userId=${encodeURIComponent(claimed)}`));
      expect(xp.status).toBe(401);

      const analytics = await analyticsGET(
        getRequest(`/api/analytics?userId=${encodeURIComponent(claimed)}`)
      );
      expect(analytics.status).toBe(401);
    }
    expect(xpSummarySpy).not.toHaveBeenCalled();
    expect(analyticsSummarySpy).not.toHaveBeenCalled();
  });

  it("4. no identity configuration at all still fails closed (default resolver)", async () => {
    resetSupabaseClientFactory();
    resetActorResolver();
    resetApplicationUserStore();

    const response = await xpGET(getRequest("/api/xp"));
    expect(response.status).toBe(401);
    expect((await json(response)).code).toBe("UNAUTHENTICATED");
    expect(xpSummarySpy).not.toHaveBeenCalled();
  });

  it("5. authorization runs before query parsing and database access", async () => {
    ANONYMOUS();
    // A user id that would otherwise be a perfectly valid read.
    const response = await xpGET(getRequest("/api/xp?userId=someone&historyDays=not-a-number"));
    expect(response.status).toBe(401);
    expect(xpSummarySpy).not.toHaveBeenCalled();

    // ...and the DB boundary must not be touched at all.
    expect(dbHolder.current).toBeNull();
  });
});

/* ================================================================== *
 * 2. Foreign identifiers are refused
 * ================================================================== */

describe("Phase 26B: a caller cannot read another user's data", () => {
  beforeEach(() => {
    // Own-data reads in this block must not depend on a database.
    xpSummarySpy.mockResolvedValue({ userId: "placeholder", totalXp: 0 } as never);
    analyticsSummarySpy.mockResolvedValue({ userId: "placeholder" } as never);
  });

  it("6. GET /api/xp with a foreign userId is 403 and reads nothing", async () => {
    actAs("learner", "learner-1");
    const response = await xpGET(getRequest("/api/xp?userId=victim-1"));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
      code: "FORBIDDEN",
    });
    expectSanitized(body);
    expect(xpSummarySpy).not.toHaveBeenCalled();
  });

  it("7. GET /api/analytics with a foreign userId is 403 and reads nothing", async () => {
    actAs("learner", "learner-1");
    const response = await analyticsGET(getRequest("/api/analytics?userId=victim-1"));

    expect(response.status).toBe(403);
    expect((await json(response)).code).toBe("FORBIDDEN");
    expect(analyticsSummarySpy).not.toHaveBeenCalled();
  });

  it("8. no role — including admin — gets a cross-user read bypass", async () => {
    for (const role of ["learner", "reviewer", "editor", "admin"] as const) {
      const me = actAs(role, `${role}-actor`);

      const xpForeign = await xpGET(getRequest("/api/xp?userId=victim-1"));
      expect(xpForeign.status).toBe(403);

      const analyticsForeign = await analyticsGET(getRequest("/api/analytics?userId=victim-1"));
      expect(analyticsForeign.status).toBe(403);

      // ...while the same role may read its own data, so the refusal is about
      // ownership, not about a role being denied learning endpoints.
      const xpOwn = await xpGET(getRequest(`/api/xp?userId=${me}`));
      expect(xpOwn.status).toBe(200);

      const analyticsOwn = await analyticsGET(getRequest(`/api/analytics?userId=${me}`));
      expect(analyticsOwn.status).toBe(200);
      expect(analyticsSummarySpy).toHaveBeenLastCalledWith(me);
    }
  });
});

/* ================================================================== *
 * 3. Self-access keeps the documented contracts
 * ================================================================== */

describe("Phase 26B: the authenticated owner reads their own data", () => {
  beforeEach(() => {
    xpSummarySpy.mockResolvedValue({
      userId: "placeholder",
      totalXp: 42,
    } as never);
    analyticsSummarySpy.mockResolvedValue({ userId: "placeholder" } as never);
  });

  it("9. an omitted userId resolves to the verified actor", async () => {
    const me = actAs("learner", "learner-1");
    const response = await xpGET(getRequest("/api/xp"));

    expect(response.status).toBe(200);
    expect(xpSummarySpy).toHaveBeenCalledTimes(1);
    // userId arg, then historyDays
    expect(xpSummarySpy.mock.calls[0]![0]).toBe(me);
  });

  it("10. an explicit self userId is accepted and resolves to the actor", async () => {
    const me = actAs("learner", "learner-1");
    const response = await xpGET(getRequest(`/api/xp?userId=${me}&historyDays=7`));

    expect(response.status).toBe(200);
    expect(xpSummarySpy.mock.calls[0]![0]).toBe(me);
    expect(xpSummarySpy.mock.calls[0]![1]).toBe(7);
  });

  it("11. the XP envelope, registry block and architecture block are unchanged", async () => {
    actAs("learner", "learner-1");
    const response = await xpGET(getRequest("/api/xp"));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.rules).toEqual(expect.any(Array));
    expect(body.registry).toMatchObject({
      ruleCount: expect.any(Number),
      eventTypes: expect.any(Array),
      maxLevel: expect.any(Number),
    });
    expect(body.architecture).toMatchObject({
      model: expect.any(String),
      idempotency: expect.any(String),
      reversal: expect.any(String),
    });
  });

  it("12. the analytics `data` envelope is unchanged and scoped to the actor", async () => {
    const me = actAs("learner", "learner-1");
    const response = await analyticsGET(getRequest("/api/analytics"));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(analyticsSummarySpy).toHaveBeenCalledWith(me);
  });

  it("13. no response falls back to the anonymous ledger", async () => {
    actAs("learner", "learner-1");
    await xpGET(getRequest("/api/xp"));
    await analyticsGET(getRequest("/api/analytics"));

    for (const call of [...xpSummarySpy.mock.calls, ...analyticsSummarySpy.mock.calls]) {
      expect(call[0]).not.toBe("anonymous-user");
    }
  });
});

/* ================================================================== *
 * 4. Query-string validation is distinct from authorization
 * ================================================================== */

describe("Phase 26B: the query parameter contract is explicit", () => {
  it("14. an empty userId is a 400 validation error, not a 401/403", async () => {
    actAs("learner", "learner-1");
    for (const query of ["?userId=", "?userId=%20%20", "?userId=+&historyDays=7"]) {
      const xp = await xpGET(getRequest(`/api/xp${query}`));
      expect(xp.status).toBe(400);
      const body = await json(xp);
      expect(body.success).toBe(false);
      expect(body.code).toBeUndefined();
      expectSanitized(body);

      const analytics = await analyticsGET(getRequest(`/api/analytics${query}`));
      expect(analytics.status).toBe(400);
    }
    expect(xpSummarySpy).not.toHaveBeenCalled();
    expect(analyticsSummarySpy).not.toHaveBeenCalled();
  });

  it("15. a repeated userId is rejected as ambiguous, not resolved to one of them", async () => {
    const me = actAs("learner", "learner-1");
    const response = await xpGET(getRequest(`/api/xp?userId=${me}&userId=victim-1`));

    expect(response.status).toBe(400);
    expect((await json(response)).code).toBeUndefined();
    expect(xpSummarySpy).not.toHaveBeenCalled();
  });

  it("16. validation failures are distinguishable from authorization failures", async () => {
    actAs("learner", "learner-1");
    const anon = await (async () => {
      ANONYMOUS();
      return xpGET(getRequest("/api/xp?userId=victim-1"));
    })();
    actAs("learner", "learner-1");
    const foreign = await xpGET(getRequest("/api/xp?userId=victim-1"));
    const empty = await xpGET(getRequest("/api/xp?userId="));

    expect(anon.status).toBe(401);
    expect(foreign.status).toBe(403);
    expect(empty.status).toBe(400);
    expect(new Set([anon.status, foreign.status, empty.status]).size).toBe(3);

    const codes = await Promise.all([json(anon), json(foreign), json(empty)]);
    expect(codes[0]!.code).toBe("UNAUTHENTICATED");
    expect(codes[1]!.code).toBe("FORBIDDEN");
    expect(codes[2]!.code).toBeUndefined();
  });
});

/* ================================================================== *
 * 5. Failure paths stay sanitized
 * ================================================================== */

describe("Phase 26B: failures remain sanitized", () => {
  it("17. a failed read is a sanitized 500 with no-store", async () => {
    actAs("learner", "learner-1");
    const thrown = new Error(
      'Failed query: select "user_id" from "xp_events" where password=secret'
    );
    xpSummarySpy.mockRejectedValue(thrown);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await xpGET(getRequest("/api/xp"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "Failed to load XP summary",
      code: "INTERNAL_ERROR",
    });
    expectSanitized(body);

    const logged = JSON.stringify(errorLog.mock.calls.map((c) => String(c[0])));
    expect(logged.toLowerCase()).not.toContain("password=secret");
  });

  it("18. a failing analytics read is a sanitized 500 with no-store", async () => {
    actAs("learner", "learner-1");
    analyticsSummarySpy.mockRejectedValue(
      new Error('Failed query: select * from user_analytics where password=secret')
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await analyticsGET(getRequest("/api/analytics"));
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "Failed to load progress summary",
      code: "INTERNAL_ERROR",
    });
    expectSanitized(body);
  });

  it("19. an identity-pipeline failure is a sanitized 500, not a 401", async () => {
    users.seed("supabase", "sub-learner-1", { id: "learner-1", name: "l", role: "learner" });
    authenticateAs({ sub: "sub-learner-1" });
    const failure = new Error(
      'Failed query: select "role" from "users" dsn=postgresql://u:password@host/db'
    );
    const store: ApplicationUserStore = {
      async findByProviderIdentity() {
        throw failure;
      },
      async insertUserIfAbsent() {
        throw failure;
      },
    };
    setApplicationUserStore(store);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await xpGET(getRequest("/api/xp"));
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
    expectSanitized(body);
    expect(xpSummarySpy).not.toHaveBeenCalled();
  });
});

/* ================================================================== *
 * 6. The read path stays read-only, and ownership is real (PGlite)
 * ================================================================== */

const MIGRATION = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

function tableDdl(table: string): string {
  const start = MIGRATION.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table}`);
  const end = MIGRATION.indexOf(");", start);
  return MIGRATION.slice(start, end + 2);
}

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const READ_PATH_TABLES = ["xp_rules", "xp_events", "srs_user_settings", "srs_reviews"];

function isolationMigrationSql(): string | null {
  const file = readdirSync("drizzle").filter((n) => /^0004_.*\.sql$/.test(n)).sort()[0];
  return file ? readFileSync(`drizzle/${file}`, "utf8") : null;
}

describe("Phase 26B: real SQL — only the caller's own ledger is read", () => {
  let client: PGlite;
  let writeCount = 0;

  beforeAll(async () => {
    client = new PGlite();
    for (const table of READ_PATH_TABLES) await client.exec(tableDdl(table));
    const migration = isolationMigrationSql();
    if (migration) for (const s of statements(migration)) await client.exec(s);
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    xpSummarySpy.mockRestore();
    xpSummarySpy = vi.spyOn(XpService, "getSummary");
    await client.exec(`DELETE FROM "xp_events"; DELETE FROM "srs_reviews"; DELETE FROM "srs_user_settings";`);
    // One warm-up read seeds the rule mirror (Phase 22B: initialisation on an
    // empty mirror is expected); every later read must be write-free.
    actAs("learner", "learner-1");
    await xpGET(getRequest("/api/xp"));
    writeCount = 0;
  });

  async function ledger(): Promise<Array<{ user_id: string; points: number }>> {
    const result = await client.query<{ user_id: string; points: number }>(
      `SELECT user_id, points FROM "xp_events" ORDER BY user_id`
    );
    return result.rows;
  }

  it("20. two users hold separate ledgers; each reads only their own total", async () => {
    await XpService.award({
      payload: { eventType: "content.read", userId: "learner-1", sourceType: "vocabulary", sourceId: "a" },
      dedupeKey: "content.read:a",
    });
    await XpService.award({
      payload: { eventType: "content.read", userId: "victim-1", sourceType: "vocabulary", sourceId: "b" },
      dedupeKey: "content.read:b",
    });
    expect(await ledger()).toHaveLength(2);

    const mine = await xpGET(getRequest("/api/xp"));
    expect(mine.status).toBe(200);
    const mineBody = await json(mine);
    expect(mineBody.summary.userId).toBe("learner-1");
    expect(mineBody.summary.totalXp).toBe(5);

    // The victim's ledger is untouched and unreadable through this route.
    const foreign = await xpGET(getRequest("/api/xp?userId=victim-1"));
    expect(foreign.status).toBe(403);
    expect(JSON.stringify(await json(foreign))).not.toContain("victim-1");
  });

  it("21. rejected reads issue no INSERT/UPDATE/DELETE and change no row", async () => {
    await XpService.award({
      payload: { eventType: "content.read", userId: "learner-1", sourceType: "vocabulary", sourceId: "a" },
      dedupeKey: "content.read:a",
    });
    const before = await ledger();

    ANONYMOUS();
    expect((await xpGET(getRequest("/api/xp"))).status).toBe(401);
    expect((await xpGET(getRequest("/api/xp?userId=victim-1"))).status).toBe(401);

    actAs("learner", "learner-1");
    expect((await xpGET(getRequest("/api/xp?userId=victim-1"))).status).toBe(403);
    expect((await xpGET(getRequest("/api/xp?userId="))).status).toBe(400);

    expect(await ledger()).toEqual(before);
  });

  it("22. an authorized read is also write-free", async () => {
    await XpService.award({
      payload: { eventType: "content.read", userId: "learner-1", sourceType: "vocabulary", sourceId: "a" },
      dedupeKey: "content.read:a",
    });
    const before = await ledger();

    for (let i = 0; i < 3; i += 1) {
      expect((await xpGET(getRequest("/api/xp"))).status).toBe(200);
    }
    expect(await ledger()).toEqual(before);
    expect(writeCount).toBe(0);
  });
});

/* ================================================================== *
 * 7. Phase 25 write contracts are untouched by this change
 * ================================================================== */

describe("Phase 26B: the write routes keep their Phase 25 contract", () => {
  it("23. POST /api/xp remains 401 for anonymous callers and 403 for spoofers", async () => {
    ANONYMOUS();
    const anon = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );
    expect(anon.status).toBe(401);

    actAs("learner", "learner-1");
    const spoof = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu", userId: "victim-1" })
    );
    expect(spoof.status).toBe(403);
  });
});
