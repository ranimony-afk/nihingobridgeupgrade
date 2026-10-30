/**
 * Phase 26C — authorization for the XP LEDGER read route.
 *
 * VULNERABILITY UNDER TEST (re-verified in the live source before this file was
 * written — commit 686918b):
 *
 *   `GET /api/xp/ledger`   `const userId = sp.get("userId") || "anonymous-user"`
 *
 *   No authentication, no ownership check, no fallback to the caller's own
 *   identity. The handler served `XpService.getLedger({ userId })` for whatever
 *   id the query string named, returning the raw event feed of that learner:
 *   event ids, event types, rule keys/versions, points, multipliers, source
 *   type/id, scoring breakdown, revoke state and timestamps. Unless Phase 26B,
 *   which covered `GET /api/xp` and `GET /api/analytics`, this route was missed.
 *
 *   A second defect lives on the same handler (D2): its catch block answered
 *   `{ error: error.message }` — the driver message, which carries the failing
 *   SQL, its bound parameters and the connection target — and logged the raw
 *   error object. There was no `Cache-Control: no-store` on any branch.
 *
 * Intended contract (Phase 26C), reusing the Phase 26B boundary:
 *
 *   anonymous                        → 401 (sanitized, no-store)
 *   authenticated, userId absent     → the actor's OWN ledger
 *   authenticated, userId === actor  → the actor's OWN ledger
 *   authenticated, userId foreign    → 403 (sanitized, no-store)
 *   authenticated, empty/blank/repeat→ 400 (validation, not authorization)
 *   identity-pipeline failure        → 500 (sanitized, no-store)
 *
 * Layers, stated honestly:
 *   - REAL: the route handler, the whole `@/lib/auth` pipeline,
 *     `XpService.getLedger` / `XpService.getTotalXp`.
 *   - Stub layer (no database): rejection and authorization assertions, plus the
 *     sanitized-failure assertions — the services are spied so "the protected
 *     read was never reached" is observable.
 *   - PGlite layer: real SQL on an EMULATED PostgreSQL with the production DDL
 *     from `drizzle/0000_absurd_emma_frost.sql` plus the Phase 26A migration, so
 *     "only my rows are returned" and "GET mutates nothing" are row counts, not
 *     mock assertions. Not a PostgreSQL server.
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

import { GET as ledgerGET } from "@/app/api/xp/ledger/route";
import type { ApplicationUserRecord, ApplicationUserStore, CmsRole } from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import { XpService } from "@/services/gamification/xpService";
import { MAX_LEVEL, levelForXp, xpAtLevel } from "@/services/gamification/xpRegistry";

/* ------------------------------------------------------------------ *
 * Auth doubles (the Phase 25/26B seams)
 * ------------------------------------------------------------------ */

class FakeUserStore implements ApplicationUserStore {
  private readonly rows = new Map<string, ApplicationUserRecord>();

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

function actAs(role: CmsRole, id = `${role}-1`) {
  const subject = `sub-${id}`;
  users.seed("supabase", subject, { id, name: role, role });
  authenticateAs({ sub: subject, email: `${id}@example.com` });
  return id;
}

const ANONYMOUS = () => authenticateAs(null);

/* ------------------------------------------------------------------ *
 * Request builders / helpers
 * ------------------------------------------------------------------ */

function ledgerRequest(path = "/api/xp/ledger"): NextRequest {
  const url = new URL(path, "http://phase26c.invalid");
  return Object.assign(new Request(url, { method: "GET" }), {
    nextUrl: url,
  }) as unknown as NextRequest;
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

const SENTINELS = [
  "select ",
  "from \"xp_events\"",
  "password",
  "postgresql://",
  "drizzle",
  "at object.",
  "SENTINEL_P26C",
  "sentinel-p26c",
];

/** No internals may reach the client. */
function expectSanitized(body: Record<string, any>): void {
  const text = JSON.stringify(body).toLowerCase();
  for (const leak of SENTINELS) {
    expect(text).not.toContain(leak.toLowerCase());
  }
}

/** Realistic Drizzle/driver failure carrying SQL, params and a DSN. */
function sentinelError(): Error {
  const error = new Error(
    'Failed query: select * from "xp_events" where user_id = $1 SENTINEL_P26C\n' +
      "params: SENTINEL_P26C\n" +
      "dsn=postgresql://sentinel:SENTINEL_P26C@sentinel.invalid:5432/db"
  );
  error.stack = "Error: Failed query: select ...\n    at sentinelFrame (/srv/sentinel.ts:9:1)";
  return error;
}

/* ------------------------------------------------------------------ *
 * Service spies — "the protected read was never reached"
 * ------------------------------------------------------------------ */

let getLedgerSpy: ReturnType<typeof vi.spyOn>;
let getTotalXpSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  users = new FakeUserStore();
  setApplicationUserStore(users);

  // Default stubs: the blocks below that assert ONLY authorization outcomes must
  // never fall through to the real service (there is no database in those
  // blocks). Without this, a stub-less success path returns 500 and turns a
  // genuine 401/403 assertion into meaningless 500-vs-500 noise — the same
  // harness gap Phase 26B hit. Real-SQL behaviour lives in the PGlite block,
  // which replaces this stub via `mockRestore` on the spy.
  getLedgerSpy = vi
    .spyOn(XpService, "getLedger")
    .mockResolvedValue({ entries: [], total: 0 } as never);
  getTotalXpSpy = vi.spyOn(XpService, "getTotalXp").mockResolvedValue(0 as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
});

/* ================================================================== *
 * 1-2. Anonymous access
 * ================================================================== */

describe("Phase 26C: anonymous ledger reads fail closed", () => {
  it("1. GET /api/xp/ledger is 401 and never reaches the ledger service", async () => {
    ANONYMOUS();
    const response = await ledgerGET(ledgerRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "Authentication required.",
      code: "UNAUTHENTICATED",
    });
    expectSanitized(body);
    expect(getLedgerSpy).not.toHaveBeenCalled();
    expect(getTotalXpSpy).not.toHaveBeenCalled();
  });

  it("2. a caller-supplied userId confers no identity on an anonymous request", async () => {
    ANONYMOUS();
    for (const claimed of ["victim-1", "admin-1", "anonymous-user"]) {
      const response = await ledgerGET(
        ledgerRequest(`/api/xp/ledger?userId=${encodeURIComponent(claimed)}`)
      );
      expect(response.status).toBe(401);
      const body = await json(response);
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(JSON.stringify(body)).not.toContain(claimed === "anonymous-user" ? "@@never@@" : claimed);
    }
    expect(getLedgerSpy).not.toHaveBeenCalled();
    expect(getTotalXpSpy).not.toHaveBeenCalled();
  });

  it("3. authorization runs before query parsing and before any database access", async () => {
    ANONYMOUS();
    const response = await ledgerGET(
      ledgerRequest("/api/xp/ledger?userId=someone&limit=100&offset=0")
    );
    expect(response.status).toBe(401);
    expect(getLedgerSpy).not.toHaveBeenCalled();
    expect(dbHolder.current).toBeNull(); // the db boundary was never installed
  });
});

/* ================================================================== *
 * 3-6. Foreign access, role matrix, self access
 * ================================================================== */

describe("Phase 26C: cross-user ledger access is refused", () => {
  beforeEach(() => {
    getLedgerSpy.mockResolvedValue({ entries: [], total: 0 } as never);
    getTotalXpSpy.mockResolvedValue(0 as never);
  });

  it("4. a foreign userId is 403 and reads nothing", async () => {
    actAs("learner", "learner-1");
    const response = await ledgerGET(ledgerRequest("/api/xp/ledger?userId=victim-1"));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await json(response);
    expect(body).toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
      code: "FORBIDDEN",
    });
    expectSanitized(body);
    expect(JSON.stringify(body)).not.toContain("victim-1");
    expect(getLedgerSpy).not.toHaveBeenCalled();
    expect(getTotalXpSpy).not.toHaveBeenCalled();
  });

  it("5. no role — including admin — gets a cross-user ledger bypass", async () => {
    for (const role of ["learner", "reviewer", "editor", "admin"] as const) {
      const me = actAs(role, `${role}-actor`);

      const foreign = await ledgerGET(ledgerRequest("/api/xp/ledger?userId=victim-1"));
      expect(foreign.status).toBe(403);
      expect(JSON.stringify(await json(foreign))).not.toContain("victim-1");

      // ...while the same role may read its own ledger, so the refusal is about
      // ownership rather than a role being denied the endpoint.
      getLedgerSpy.mockClear();
      const own = await ledgerGET(ledgerRequest(`/api/xp/ledger?userId=${me}`));
      expect(own.status).toBe(200);
      expect(getLedgerSpy).toHaveBeenCalledTimes(1);
      expect((getLedgerSpy.mock.calls[0]![0] as { userId?: string }).userId).toBe(me);
    }
  });

  it("6. an omitted userId resolves to the verified actor", async () => {
    const me = actAs("learner", "learner-1");
    const response = await ledgerGET(ledgerRequest());

    expect(response.status).toBe(200);
    expect(getLedgerSpy).toHaveBeenCalledTimes(1);
    expect((getLedgerSpy.mock.calls[0]![0] as { userId?: string }).userId).toBe(me);
    expect(getTotalXpSpy).toHaveBeenCalledWith(me);
  });

  it("7. an explicit self userId is accepted", async () => {
    const me = actAs("learner", "learner-1");
    const response = await ledgerGET(ledgerRequest(`/api/xp/ledger?userId=${me}`));

    expect(response.status).toBe(200);
    expect((getLedgerSpy.mock.calls[0]![0] as { userId?: string }).userId).toBe(me);
  });

  it("8. no response falls back to the anonymous ledger", async () => {
    actAs("learner", "learner-1");
    await ledgerGET(ledgerRequest());

    for (const call of [...getLedgerSpy.mock.calls, ...getTotalXpSpy.mock.calls]) {
      const first = call[0];
      const userId = typeof first === "object" && first !== null ? (first as { userId?: string }).userId : first;
      expect(userId).not.toBe("anonymous-user");
    }
  });
});

/* ================================================================== *
 * 7. Query-string validation is distinct from authorization
 * ================================================================== */

describe("Phase 26C: the query parameter contract is explicit", () => {
  it("9. empty, blank and repeated userId are 400, never 401/403", async () => {
    actAs("learner", "learner-1");
    const me = "learner-1";

    for (const query of [
      "?userId=",
      "?userId=%20%20",
      "?userId=+&limit=10",
      `?userId=${me}&userId=victim-1`,
    ]) {
      const response = await ledgerGET(ledgerRequest(`/api/xp/ledger${query}`));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toContain("no-store");

      const body = await json(response);
      expect(body.success).toBe(false);
      expect(body.code).toBeUndefined();
      expectSanitized(body);
    }

    expect(getLedgerSpy).not.toHaveBeenCalled();
    expect(getTotalXpSpy).not.toHaveBeenCalled();
  });

  it("10. validation failures stay distinguishable from authorization failures", async () => {
    const me = actAs("learner", "learner-1");

    const foreign = await ledgerGET(ledgerRequest("/api/xp/ledger?userId=victim-1"));
    const empty = await ledgerGET(ledgerRequest("/api/xp/ledger?userId="));

    ANONYMOUS();
    const anonymous = await ledgerGET(ledgerRequest("/api/xp/ledger?userId=victim-1"));

    expect(anonymous.status).toBe(401);
    expect(foreign.status).toBe(403);
    expect(empty.status).toBe(400);
    expect(new Set([anonymous.status, foreign.status, empty.status]).size).toBe(3);

    actAs("learner", me);
    expect((await ledgerGET(ledgerRequest(`/api/xp/ledger?userId=${me}`))).status).toBe(200);
  });
});

/* ================================================================== *
 * 8-9. Failure paths: sanitized, and no service access
 * ================================================================== */

describe("Phase 26C: failures are sanitized (D2 on this handler)", () => {
  it("11. a ledger query failure is a sanitized 500 with no-store", async () => {
    actAs("learner", "learner-1");
    getLedgerSpy.mockRejectedValue(sentinelError());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await ledgerGET(ledgerRequest());

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await json(response);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
    expectSanitized(body);
  });

  it("12. the raw error is never logged and the SQL never reaches the client", async () => {
    actAs("learner", "learner-1");
    getLedgerSpy.mockRejectedValue(sentinelError());
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await ledgerGET(ledgerRequest());
    const body = await json(response);

    const logs = [...errorLog.mock.calls, ...warnLog.mock.calls];
    const rendered = logs
      .map((call) => call.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg))).join(" "))
      .join("\n");

    expect(rendered).not.toContain("SENTINEL_P26C");
    expect(rendered).not.toContain("select *");
    expect(rendered).not.toContain("postgresql://");
    // No raw error object handed to the logger.
    expect(logs.some((call) => call.some((arg) => arg instanceof Error))).toBe(false);
    expect(JSON.stringify(body)).not.toContain("SENTINEL_P26C");
  });

  it("13. a failing total lookup is also a sanitized 500", async () => {
    actAs("learner", "learner-1");
    getLedgerSpy.mockResolvedValue({ entries: [], total: 0 } as never);
    getTotalXpSpy.mockRejectedValue(sentinelError());
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await ledgerGET(ledgerRequest());
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.code).toBe("INTERNAL_ERROR");
    expectSanitized(body);
  });

  it("14. an identity-pipeline failure is a sanitized 500, not a 401", async () => {
    users.seed("supabase", "sub-learner-1", { id: "learner-1", name: "l", role: "learner" });
    authenticateAs({ sub: "sub-learner-1" });
    const failure = sentinelError();
    setApplicationUserStore({
      async findByProviderIdentity() {
        throw failure;
      },
      async insertUserIfAbsent() {
        throw failure;
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await ledgerGET(ledgerRequest());
    expect(response.status).toBe(500);
    const body = await json(response);
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
    expectSanitized(body);
    expect(getLedgerSpy).not.toHaveBeenCalled();
  });
});

/* ================================================================== *
 * 10. Response and pagination contracts are preserved
 * ================================================================== */

describe("Phase 26C: the ledger response contract is unchanged", () => {
  beforeEach(() => {
    getLedgerSpy.mockResolvedValue({
      entries: [
        {
          id: "xp-1",
          eventType: "content.read",
          ruleKey: "content-read",
          ruleVersion: "1.0.0",
          points: 5,
          basePoints: 5,
          multiplier: 1,
          sourceType: "vocabulary",
          sourceId: "de-mizu",
          breakdown: [{ label: "Item studied", value: 5, kind: "base" }],
          revokedAt: null,
          revokedReason: null,
          occurredAt: "2026-10-28T00:00:00.000Z",
        },
      ],
      total: 1,
    } as never);
    getTotalXpSpy.mockResolvedValue(5 as never);
  });

  it("15. the success envelope, level and curve blocks are unchanged", async () => {
    actAs("learner", "learner-1");
    const response = await ledgerGET(ledgerRequest());
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      id: "xp-1",
      eventType: "content.read",
      points: 5,
      sourceId: "de-mizu",
      occurredAt: expect.any(String),
    });
    expect(body.total).toBe(1);
    expect(body.totalXp).toBe(5);
    expect(body.level).toEqual(levelForXp(5));
    expect(body.curve).toHaveLength(Math.min(20, MAX_LEVEL));
    expect(body.curve[0]).toEqual({ level: 1, xpRequired: xpAtLevel(1) });
    expect(body.code).toBeUndefined();
  });

  it("16. pagination and filtering parameters are still forwarded", async () => {
    actAs("learner", "learner-1");
    await ledgerGET(ledgerRequest("/api/xp/ledger?limit=10&offset=20&eventType=content.read"));

    const args = getLedgerSpy.mock.calls[0]![0] as {
      userId?: string;
      limit?: number;
      offset?: number;
      eventType?: string;
    };
    expect(args).toMatchObject({ limit: 10, offset: 20, eventType: "content.read" });
  });

  it("17. the documented defaults (limit 50, offset 0, no filter) are preserved", async () => {
    actAs("learner", "learner-1");
    await ledgerGET(ledgerRequest());

    const args = getLedgerSpy.mock.calls[0]![0] as {
      limit?: number;
      offset?: number;
      eventType?: string;
    };
    expect(args.limit).toBe(50);
    expect(args.offset).toBe(0);
    expect(args.eventType).toBeUndefined();
  });
});

/* ================================================================== *
 * PGlite — real SQL: only my rows, and GET mutates nothing
 * ================================================================== */

const MIGRATION_0000 = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

function tableDdl(table: string): string {
  const start = MIGRATION_0000.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table}`);
  const end = MIGRATION_0000.indexOf(");", start);
  return MIGRATION_0000.slice(start, end + 2);
}

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

function isolationMigrationSql(): string | null {
  const file = readdirSync("drizzle").filter((n) => /^0004_.*\.sql$/.test(n)).sort()[0];
  return file ? readFileSync(`drizzle/${file}`, "utf8") : null;
}

describe("Phase 26C: real SQL — the ledger returns only the caller's events", () => {
  let client: PGlite;

  const ME = "p26c-learner";
  const VICTIM = "p26c-victim";

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(tableDdl("xp_events"));
    // `XpService.award` resolves the per-user day cutoff through these settings,
    // so the fixture needs the table even though the ledger read never touches it.
    await client.exec(tableDdl("srs_user_settings"));
    // ...and `getTotalXp` derives the level block from the review history.
    await client.exec(tableDdl("srs_reviews"));
    const migration = isolationMigrationSql();
    if (migration) for (const s of statements(migration)) await client.exec(s);
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // This block asserts against REAL SQL, so the authorization-block stubs
    // installed by the outer beforeEach are removed here.
    getLedgerSpy.mockRestore();
    getTotalXpSpy.mockRestore();

    await client.exec(`DELETE FROM "xp_events"`);
    // Two learners with overlapping event types but distinct secrets.
    await XpService.award({
      payload: {
        eventType: "content.read",
        userId: ME,
        sourceType: "vocabulary",
        sourceId: "my-item",
      },
      dedupeKey: "content.read:my-item",
    });
    await XpService.award({
      payload: {
        eventType: "content.read",
        userId: VICTIM,
        sourceType: "vocabulary",
        sourceId: "victim-secret-item",
      },
      dedupeKey: "content.read:victim-secret-item",
    });
  });

  it("18. an authorized read returns only the actor's own events", async () => {
    actAs("learner", ME);
    const response = await ledgerGET(ledgerRequest());

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].sourceId).toBe("my-item");
    expect(body.total).toBe(1);
    expect(body.totalXp).toBe(5);

    // Nothing about the victim is present anywhere in the payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("victim-secret-item");
    expect(serialized).not.toContain(VICTIM);
  });

  it("19. a foreign userId cannot be used to enumerate the victim's ledger", async () => {
    actAs("learner", ME);
    const response = await ledgerGET(ledgerRequest(`/api/xp/ledger?userId=${VICTIM}`));

    expect(response.status).toBe(403);
    const serialized = JSON.stringify(await json(response));
    expect(serialized).not.toContain("victim-secret-item");
    expect(serialized).not.toContain(VICTIM);

    // ...and the victim's rows are still there, untouched.
    const remaining = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "xp_events" WHERE user_id = $1`,
      [VICTIM]
    );
    expect(remaining.rows[0]!.count).toBe(1);
  });

  it("20. GET issues no INSERT/UPDATE/DELETE and changes no row", async () => {
    actAs("learner", ME);

    const snapshot = async () =>
      (
        await client.query<{ id: string; user_id: string; points: number; revoked_at: Date | null }>(
          `SELECT id, user_id, points, revoked_at FROM "xp_events" ORDER BY id`
        )
      ).rows;

    const before = await snapshot();
    for (let i = 0; i < 3; i += 1) {
      expect((await ledgerGET(ledgerRequest())).status).toBe(200);
    }
    // Rejections must not write either.
    ANONYMOUS();
    expect((await ledgerGET(ledgerRequest())).status).toBe(401);
    actAs("learner", ME);
    expect((await ledgerGET(ledgerRequest(`/api/xp/ledger?userId=${VICTIM}`))).status).toBe(403);
    expect((await ledgerGET(ledgerRequest("/api/xp/ledger?userId="))).status).toBe(400);

    expect(await snapshot()).toEqual(before);
  });

  it("21. pagination and event filtering still work against real rows", async () => {
    // A second event for the same learner, of a different type.
    await XpService.award({
      payload: {
        eventType: "review.graded",
        userId: ME,
        sourceType: "review",
        sourceId: "rev-1",
        rating: "good",
        wasCorrect: true,
        intervalDays: 1,
        isNewCard: true,
      },
      dedupeKey: "review:rev-1",
    });

    actAs("learner", ME);

    const all = await json(await ledgerGET(ledgerRequest()));
    expect(all.total).toBe(2);
    expect(all.entries).toHaveLength(2);

    const filtered = await json(
      await ledgerGET(ledgerRequest("/api/xp/ledger?eventType=review.graded"))
    );
    expect(filtered.total).toBe(1);
    expect(filtered.entries[0].eventType).toBe("review.graded");

    const paged = await json(await ledgerGET(ledgerRequest("/api/xp/ledger?limit=1&offset=1")));
    expect(paged.entries).toHaveLength(1);
    expect(paged.total).toBe(2); // total counts the full filtered set, not the page
  });
});
