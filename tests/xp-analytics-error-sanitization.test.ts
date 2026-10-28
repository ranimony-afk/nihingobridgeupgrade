/**
 * Phase 23 — XP and analytics read-path error sanitization.
 *
 * VULNERABILITY UNDER TEST: `GET /api/xp` and `GET /api/analytics` both caught
 * database failures and echoed `error.message` to the client while passing the
 * raw thrown object to `console.error`. A Drizzle/pg error carries the failing
 * SQL, its bound parameters, the connection target and a `cause` chain, so both
 * the response body and the server log disclosed driver internals.
 *
 * `GET /api/analytics` had a second defect: `catch (error: any)` then
 * `error.message` means a thrown `null`/`undefined` makes the catch block itself
 * throw, bypassing every sanitization decision and escaping to the framework
 * error handler.
 *
 * Layering, and what is real:
 *   - REAL: both route handlers, `XpService`, `AnalyticsService`,
 *     `DailyQueueService`, `TestService` — the whole catch path executes.
 *   - FAKE: only the `@/db` boundary (a chainable, awaitable stub). No database
 *     is contacted, nothing is written, and no production system is reachable.
 *   - Logs are captured through the application's actual `console`, not through
 *     source-text assertions.
 *
 * PHASE 26B UPDATE — both read routes now require a verified identity and serve
 * only the caller's own data (see tests/xp-analytics-read-authorization.test.ts
 * for that contract). This suite's subject is unchanged: error sanitization on
 * the read path. It therefore makes every request as an authenticated learner
 * through `setActorResolver` (the same deterministic seam the other suites use),
 * and the two assertions that named the old anonymous fallback now name that
 * actor — `anonymous-user` no longer exists as a readable identity. The
 * sanitization assertions below are untouched; the trailing "documented userId
 * query parameter" case keeps its subject (the parameter is honoured) while
 * using a SELF id, because a foreign id is now correctly 403.
 *
 * Sentinels are unique tokens: `XpService`, `failed`, `category`, `summary` and
 * other ordinary words in the legitimate message can never cause a false
 * positive, so these assertions cannot be satisfied by accident.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * Sentinels — synthetic, no real credentials or production data
 * ------------------------------------------------------------------ */

const SENTINEL_SQL = "SELECT t.id FROM xp_rules_sentinel_3b7e WHERE t.key = $1";
const SENTINEL_PARAM = "PARAM_SENTINEL_c40a91";
const SENTINEL_DSN = "postgresql://sentinel_app:SENTINEL_PASSWORD_7d13@sentinel-db.invalid:5432/sentinel_db";
const SENTINEL_PASSWORD = "SENTINEL_PASSWORD_7d13";
const SENTINEL_TOKEN = "SENTINEL_TOKEN_2be8f5";
const SENTINEL_STACK = "at sentinelAnalyticsFrame_9ac4 (/srv/sentinel/analytics_sentinel.ts:88:17)";

const ALL_SENTINELS = [
  SENTINEL_SQL,
  SENTINEL_PARAM,
  SENTINEL_DSN,
  SENTINEL_PASSWORD,
  SENTINEL_TOKEN,
  SENTINEL_STACK,
  "xp_rules_sentinel_3b7e",
  "sentinelAnalyticsFrame_9ac4",
  "sentinel-db.invalid",
  "sentinel_app",
];

/** A realistic Drizzle failure: SQL + params + DSN + stack + a driver cause. */
function sentinelError(): Error {
  const error = new Error(
    `Failed query: ${SENTINEL_SQL}\nparams: ${SENTINEL_PARAM}\ndsn=${SENTINEL_DSN}\n` +
      `token=${SENTINEL_TOKEN}`
  );
  error.stack = `Error: Failed query: ${SENTINEL_SQL}\n    ${SENTINEL_STACK}`;
  (error as { cause?: unknown }).cause = Object.assign(
    new Error(`password authentication failed for user "sentinel_app" (${SENTINEL_DSN})`),
    { code: "28P01" }
  );
  return error;
}

/** Non-Error throws that still carry sensitive text. */
function nonErrorThrows(): Array<{ label: string; value: unknown }> {
  return [
    {
      label: "string throw",
      value: `Failed query: ${SENTINEL_SQL} params: ${SENTINEL_PARAM} dsn=${SENTINEL_DSN}`,
    },
    {
      label: "plain object throw",
      value: {
        message: `Failed query: ${SENTINEL_SQL}`,
        params: SENTINEL_PARAM,
        dsn: SENTINEL_DSN,
        stack: SENTINEL_STACK,
      },
    },
    { label: "null throw", value: null },
    { label: "undefined throw", value: undefined },
  ];
}

/* ------------------------------------------------------------------ *
 * The database boundary is the ONLY thing replaced.
 * ------------------------------------------------------------------ */

const { NO_FAILURE, state } = vi.hoisted(() => {
  const NO_FAILURE = Symbol("no-failure");
  return { NO_FAILURE, state: { select: NO_FAILURE as unknown, insert: NO_FAILURE as unknown } };
});

/**
 * A chainable, awaitable stub. Every property access returns another queryable
 * so `db.select({...}).from(t).where(...).groupBy(...)` works at any length, and
 * the chain settles only when awaited. Rejects only on await, so touching
 * further builder methods never creates an unhandled rejection.
 */
vi.mock("@/db", () => {
  const queryable = (failure: unknown): unknown =>
    new Proxy(
      {
        then(onFulfilled: unknown, onRejected: unknown) {
          const settled = failure === NO_FAILURE ? Promise.resolve([]) : Promise.reject(failure);
          return settled.then(onFulfilled as never, onRejected as never);
        },
      },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return () => queryable(failure);
        },
      }
    );
  return {
    db: {
      select: () => queryable(state.select),
      insert: () => queryable(state.insert),
    },
  };
});

import { GET as xpGET } from "@/app/api/xp/route";
import { GET as analyticsGET } from "@/app/api/analytics/route";
import { XP_RULE_COUNT } from "@/services/gamification/xpRegistry";
import { resetActorResolver, setActorResolver } from "@/lib/auth";

/** The verified actor every read in this suite runs as (Phase 26B). */
const ACTOR_ID = "phase23-user";

let errorLog: ReturnType<typeof vi.spyOn>;
let warnLog: ReturnType<typeof vi.spyOn>;

function nextRequest(url: string): NextRequest {
  const request = new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}

/**
 * Render captured log calls exactly as `console` would print them.
 *
 * `JSON.stringify` would render an `Error` argument as `{}` and hide the leak;
 * `util.format` is what Node's console actually uses, so an error passed as a
 * log argument shows its message and stack here — which is precisely the
 * disclosure this suite is about.
 */
function capturedCalls(): unknown[][] {
  return [...errorLog.mock.calls, ...warnLog.mock.calls] as unknown[][];
}

function capturedLogs(): string {
  return capturedCalls()
    .map((call) => format(...(call as [unknown, ...unknown[]])))
    .join("\n");
}

/** True when a raw thrown object was handed to the logger as an argument. */
function loggedRawErrorObject(): boolean {
  return capturedCalls().some((call) => call.some((arg) => arg instanceof Error));
}

/** No sentinel may survive into a response body or a captured log line. */
function expectNoSentinel(value: unknown, label: string) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const sentinel of ALL_SENTINELS) {
    expect(`${label}: ${text}`).not.toContain(sentinel);
  }
}

const XP_ERROR_ENVELOPE = {
  success: false,
  error: "Failed to load XP summary",
  code: "INTERNAL_ERROR",
};
const ANALYTICS_ERROR_ENVELOPE = {
  success: false,
  error: "Failed to load progress summary",
  code: "INTERNAL_ERROR",
};

beforeEach(() => {
  state.select = NO_FAILURE;
  state.insert = NO_FAILURE;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
  setActorResolver(() => ({ id: ACTOR_ID, role: "learner" }));
});

afterEach(() => {
  resetActorResolver();
  vi.restoreAllMocks();
});

/* ================================================================== *
 * 1–5. Database failure: response + log sanitization, both routes
 * ================================================================== */

describe("Phase 23: database failure is sanitized — GET /api/xp", () => {
  it("1/3/4/5. returns a stable 500 envelope with no SQL, parameters, DSN, credentials or stack", async () => {
    state.select = sentinelError();

    const response = await xpGET(nextRequest("http://phase23.invalid/api/xp"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual(XP_ERROR_ENVELOPE);
    expectNoSentinel(body, "xp response body");
    expectNoSentinel(capturedLogs(), "xp server log");
  });

  it("3/4/5. logs a classified diagnostic instead of the raw error", async () => {
    state.select = sentinelError();

    await xpGET(nextRequest("http://phase23.invalid/api/xp"));

    const logs = capturedLogs();
    // Actionable, and stable: operation id plus an allowlisted category.
    expect(logs).toContain("XpService.getSummary failed [category=database_statement_rejected]");
    // The raw object was never passed as a log argument.
    expect(loggedRawErrorObject()).toBe(false);
  });
});

describe("Phase 23: database failure is sanitized — GET /api/analytics", () => {
  it("2/3/4/5. returns a stable 500 envelope with no SQL, parameters, DSN, credentials or stack", async () => {
    state.select = sentinelError();

    const response = await analyticsGET(nextRequest("http://phase23.invalid/api/analytics"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual(ANALYTICS_ERROR_ENVELOPE);
    expectNoSentinel(body, "analytics response body");
    expectNoSentinel(capturedLogs(), "analytics server log");
  });

  it("3/4/5. logs a classified diagnostic instead of the raw error", async () => {
    state.select = sentinelError();

    await analyticsGET(nextRequest("http://phase23.invalid/api/analytics"));

    const logs = capturedLogs();
    expect(logs).toContain(
      "AnalyticsService.getUserProgressSummary failed [category=database_statement_rejected]"
    );
    expect(loggedRawErrorObject()).toBe(false);
  });
});

/* ================================================================== *
 * 6. Non-Error throws — including the `catch (error: any)` bypass
 * ================================================================== */

describe("Phase 23: non-Error thrown values are handled without leaking", () => {
  for (const { label, value } of nonErrorThrows()) {
    it(`GET /api/xp survives a ${label}`, async () => {
      state.select = value;

      const response = await xpGET(nextRequest("http://phase23.invalid/api/xp"));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual(XP_ERROR_ENVELOPE);
      expectNoSentinel(body, `xp body (${label})`);
      expectNoSentinel(capturedLogs(), `xp log (${label})`);
    });

    it(`GET /api/analytics survives a ${label}`, async () => {
      state.select = value;

      const response = await analyticsGET(nextRequest("http://phase23.invalid/api/analytics"));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual(ANALYTICS_ERROR_ENVELOPE);
      expectNoSentinel(body, `analytics body (${label})`);
      expectNoSentinel(capturedLogs(), `analytics log (${label})`);
    });
  }
});

/* ================================================================== *
 * 7. A failure is never converted into a successful empty payload
 * ================================================================== */

describe("Phase 23: failures stay failures", () => {
  it("does not answer 200 with empty data when the database fails", async () => {
    state.select = sentinelError();

    const xpResponse = await xpGET(nextRequest("http://phase23.invalid/api/xp"));
    const analyticsResponse = await analyticsGET(nextRequest("http://phase23.invalid/api/analytics"));

    expect(xpResponse.status).not.toBe(200);
    expect(analyticsResponse.status).not.toBe(200);
    expect((await xpResponse.json()).success).toBe(false);
    expect((await analyticsResponse.json()).success).toBe(false);
  });
});

/* ================================================================== *
 * 8. Success contracts are unchanged
 * ================================================================== */

describe("Phase 23: successful response contracts are unchanged", () => {
  it("GET /api/xp keeps its envelope, registry block and summary shape", async () => {
    const response = await xpGET(nextRequest("http://phase23.invalid/api/xp"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.registry.ruleCount).toBe(XP_RULE_COUNT);
    expect(body.rules).toHaveLength(XP_RULE_COUNT);
    expect(body.summary).toMatchObject({
      userId: ACTOR_ID,
      totalXp: 0,
      todayXp: 0,
      weekXp: 0,
      revokedEvents: 0,
      bySource: [],
      daily: expect.any(Array),
      recent: [],
    });
    expect(body.summary.level.level).toBeGreaterThanOrEqual(1);
    expect(body.architecture.model).toContain("Append-only XP ledger");
    // No error envelope leaked into the success path.
    expect(body.code).toBeUndefined();
  });

  it("GET /api/analytics keeps its `data` envelope and metric shape", async () => {
    const response = await analyticsGET(nextRequest("http://phase23.invalid/api/analytics"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(ACTOR_ID);
    expect(body.data.xp).toMatchObject({ totalPoints: 0 });
    expect(body.data.studyMetrics).toMatchObject({
      vocabularyStudied: 0,
      kanjiStudied: 0,
      grammarStudied: 0,
      examplesStudied: 0,
      srsReviewsCompleted: 0,
      quizAttempts: 0,
      jlptTestsCompleted: 0,
      totalTimeSpentMinutes: 0,
    });
    expect(body.data.recentActivity).toEqual([]);
    expect(body.code).toBeUndefined();
  });

  it("honours the documented userId query parameter on the success path", async () => {
    // Phase 26B: the parameter is still honoured, but only for the caller's own
    // id — reading another learner is 403 (asserted at the end of this case).
    const xpResponse = await xpGET(nextRequest(`http://phase23.invalid/api/xp?userId=${ACTOR_ID}`));
    expect((await xpResponse.json()).summary.userId).toBe(ACTOR_ID);

    const analyticsResponse = await analyticsGET(
      nextRequest(`http://phase23.invalid/api/analytics?userId=${ACTOR_ID}`)
    );
    expect((await analyticsResponse.json()).data.userId).toBe(ACTOR_ID);

    // ...and an omitted id resolves to the same actor rather than to a shared
    // anonymous ledger.
    const omitted = await xpGET(nextRequest("http://phase23.invalid/api/xp"));
    expect((await omitted.json()).summary.userId).toBe(ACTOR_ID);

    // A foreign id is refused, in the same envelope family this suite checks.
    const foreign = await xpGET(nextRequest("http://phase23.invalid/api/xp?userId=someone-else"));
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({
      success: false,
      error: "You do not have permission to perform this action.",
      code: "FORBIDDEN",
    });
  });
});
