/**
 * Phase 24 — XP and analytics WRITE-path error sanitization.
 *
 * VULNERABILITIES UNDER TEST (all re-verified in the live source before this
 * file was written):
 *
 *   POST   /api/xp          `error.message` echoed to the client, raw object
 *                           logged, and a server-side database failure
 *                           reported as HTTP 400 (a client error).
 *   DELETE /api/xp          identical pattern, identical 400 misclassification.
 *   POST   /api/analytics   `catch (error: any)` + `error.message`, so a thrown
 *                           `null`/`undefined` throws INSIDE the catch and
 *                           escapes to the framework handler.
 *   XpService.awardSafe     `console.warn("XP award failed (non-fatal):", error)`
 *                           — a raw driver error serialized into the log on the
 *                           `POST /api/analytics` path.
 *   AnalyticsService.trackStudyEvent
 *                           awards through `awardSafe`, so an award that fails
 *                           is swallowed and the route answers 200: a failed
 *                           write reported as success.
 *
 * Layering, and what is real:
 *   - REAL: all three route handlers, `XpService`, `AnalyticsService`,
 *     `TestService`, `DailyQueueService` — the genuine catch paths execute.
 *   - FAKE: only the `@/db` boundary (a chainable, awaitable stub whose
 *     select/insert/update can be made to fail independently). No database is
 *     contacted; nothing is written anywhere; no production system is reachable.
 *   - Logs are captured through the application's real `console` and rendered
 *     with `node:util.format`, the renderer console itself uses, so an `Error`
 *     handed to the logger shows its message and stack instead of `{}`.
 *
 * Sentinels are unique tokens (`SENTINEL_…`, `…_sentinel_…`, `sentinel-…`), so
 * ordinary words in the legitimate messages cannot cause a false positive.
 *
 * PHASE 25 UPDATE — the three write routes now require a verified identity
 * before they validate, read or write anything (see
 * tests/xp-analytics-write-authorization.test.ts for that contract). This
 * suite's subject is unchanged: error sanitization on the mutation path. It
 * therefore makes every request as an authenticated learner via
 * `setActorResolver` (the same deterministic seam `POST /api/questions` tests
 * use) and the documented bodies now name that same actor's id. NO assertion
 * from Phase 24 was removed, relaxed or skipped: every sanitization, status,
 * envelope and log-classification expectation below is the original one.
 */
import { format } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * Sentinels — synthetic, no real credentials or production data
 * ------------------------------------------------------------------ */

const SENTINEL_SQL = "INSERT_SENTINEL_9f21 INTO xp_events_sentinel_c7d3 VALUES ($1, $2)";
const SENTINEL_PARAM = "PARAM_SENTINEL_5a0e77";
const SENTINEL_DSN =
  "postgresql://sentinel_writer:SENTINEL_PASSWORD_4c81@sentinel-write-db.invalid:5432/sentinel_write";
const SENTINEL_PASSWORD = "SENTINEL_PASSWORD_4c81";
const SENTINEL_TOKEN = "SENTINEL_TOKEN_8d2f60";
const SENTINEL_STACK = "at sentinelWriteFrame_1e6b (/srv/sentinel/write_sentinel.ts:57:29)";

const ALL_SENTINELS = [
  SENTINEL_SQL,
  SENTINEL_PARAM,
  SENTINEL_DSN,
  SENTINEL_PASSWORD,
  SENTINEL_TOKEN,
  SENTINEL_STACK,
  "INSERT_SENTINEL_9f21",
  "xp_events_sentinel_c7d3",
  "sentinelWriteFrame_1e6b",
  "sentinel-write-db.invalid",
  "sentinel_writer",
];

/**
 * A realistic Drizzle failure. Deliberately avoids the words "unique" and
 * "duplicate": `XpService.award` treats a message containing either as a
 * dedupe collision and would convert the failure into a silent success, which
 * would mask what this suite is measuring.
 */
function sentinelError(): Error {
  const error = new Error(
    `Failed query: ${SENTINEL_SQL}\nparams: ${SENTINEL_PARAM}\ndsn=${SENTINEL_DSN}\n` +
      `token=${SENTINEL_TOKEN}`
  );
  error.stack = `Error: Failed query: ${SENTINEL_SQL}\n    ${SENTINEL_STACK}`;
  (error as { cause?: unknown }).cause = Object.assign(
    new Error(`password authentication failed for user "sentinel_writer" (${SENTINEL_DSN})`),
    { code: "28P01" }
  );
  return error;
}

/** Every non-Error shape a hostile or careless caller can throw. */
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
    { label: "ordinary Error", value: sentinelError() },
  ];
}

/* ------------------------------------------------------------------ *
 * The database boundary is the ONLY thing replaced.
 * ------------------------------------------------------------------ */

const { NO_FAILURE, state } = vi.hoisted(() => {
  const NO_FAILURE = Symbol("no-failure");
  return {
    NO_FAILURE,
    state: {
      select: NO_FAILURE as unknown,
      insert: NO_FAILURE as unknown,
      update: NO_FAILURE as unknown,
      /** Rows a successful select resolves to. */
      selectRows: [] as unknown[],
      /** Rows a successful update resolves to (for `returning()`). */
      updateRows: [] as unknown[],
      /** Only inserts into this table fail (null = no table-scoped failure). */
      insertFailureFor: null as string | null,
    },
  };
});

vi.mock("@/db", () => {
  const tableName = (table: unknown): string => {
    if (typeof table !== "object" || table === null) return "";
    const name = (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
    return typeof name === "string" ? name : "";
  };

  /**
   * Chainable and awaitable: every property access returns another queryable,
   * so `db.select({...}).from(t).where(...).groupBy(...)` works at any depth,
   * and the chain settles only when awaited.
   */
  const queryable = (failure: unknown, rows: unknown[]): unknown =>
    new Proxy(
      {
        then(onFulfilled: unknown, onRejected: unknown) {
          const settled = failure === NO_FAILURE ? Promise.resolve(rows) : Promise.reject(failure);
          return settled.then(onFulfilled as never, onRejected as never);
        },
      },
      {
        get(target, prop) {
          if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
          return () => queryable(failure, rows);
        },
      }
    );

  return {
    db: {
      select: () => queryable(state.select, state.selectRows),
      insert: (table: unknown) => {
        const scoped =
          state.insertFailureFor !== null && tableName(table) === state.insertFailureFor
            ? state.insert
            : NO_FAILURE;
        return queryable(scoped, []);
      },
      update: () => queryable(state.update, state.updateRows),
    },
  };
});

import { DELETE as xpDELETE, POST as xpPOST } from "@/app/api/xp/route";
import { POST as analyticsPOST } from "@/app/api/analytics/route";
import { AnalyticsService } from "@/services/analytics";
import { XpService } from "@/services/gamification/xpService";
import { resetActorResolver, setActorResolver } from "@/lib/auth";

/**
 * The verified actor every request in this suite runs as. Phase 25 routes
 * derive the acting user id from this server-side identity, so a body that
 * names a different user is (correctly) refused with 403.
 */
const ACTOR_ID = "u-42";

let errorLog: ReturnType<typeof vi.spyOn>;
let warnLog: ReturnType<typeof vi.spyOn>;

/* ------------------------------------------------------------------ *
 * Request builders and capture helpers
 * ------------------------------------------------------------------ */

function postRequest(path: string, body: unknown): NextRequest {
  const url = new URL(path, "http://phase24.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => body,
  }) as unknown as NextRequest;
}

function malformedJsonRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase24.invalid");
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => {
      throw new SyntaxError(`Unexpected token < in JSON at position 0 near ${SENTINEL_SQL}`);
    },
  }) as unknown as NextRequest;
}

function deleteRequest(path: string): NextRequest {
  const url = new URL(path, "http://phase24.invalid");
  return Object.assign(new Request(url, { method: "DELETE" }), { nextUrl: url }) as NextRequest;
}

function capturedCalls(): unknown[][] {
  return [...errorLog.mock.calls, ...warnLog.mock.calls] as unknown[][];
}

function capturedLogs(): string {
  return capturedCalls()
    .map((call) => format(...(call as [unknown, ...unknown[]])))
    .join("\n");
}

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

beforeEach(() => {
  state.select = NO_FAILURE;
  state.insert = NO_FAILURE;
  state.update = NO_FAILURE;
  state.selectRows = [];
  state.updateRows = [];
  state.insertFailureFor = null;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
  setActorResolver(() => ({ id: ACTOR_ID, role: "learner" }));
});

afterEach(() => {
  resetActorResolver();
  vi.restoreAllMocks();
});

/* ================================================================== *
 * 1, 4, 5, 6, 7 — POST /api/analytics database failure
 * ================================================================== */

describe("Phase 24: POST /api/analytics — database failure", () => {
  it("returns a sanitized 500 with no SQL, parameters, DSN, credentials or stack", async () => {
    state.select = sentinelError();

    const response = await analyticsPOST(
      postRequest("/api/analytics", { itemType: "vocabulary", itemId: "de-mizu" })
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to track study event",
      code: "INTERNAL_ERROR",
    });
    expectNoSentinel(body, "analytics POST body");
    expectNoSentinel(capturedLogs(), "analytics POST log");
    expect(loggedRawErrorObject()).toBe(false);
  });

  it("logs a classified diagnostic instead of the raw exception", async () => {
    state.select = sentinelError();

    await analyticsPOST(postRequest("/api/analytics", { itemType: "vocabulary", itemId: "x" }));

    expect(capturedLogs()).toContain(
      "AnalyticsService.trackStudyEvent failed [category=database_statement_rejected]"
    );
  });

  it("does not report success when only the award write fails", async () => {
    // Initialisation succeeds; the ledger insert is the failing mutation.
    state.insertFailureFor = "xp_events";
    state.insert = sentinelError();

    const response = await analyticsPOST(
      postRequest("/api/analytics", { itemType: "vocabulary", itemId: "de-mizu" })
    );

    expect(response.status).not.toBe(200);
    const body = await response.json();
    expect(body.success).toBe(false);
    expectNoSentinel(body, "analytics POST failed-award body");
  });
});

/* ================================================================== *
 * 2, 3, 4, 5, 6, 7 — POST and DELETE /api/xp database failures
 * ================================================================== */

describe("Phase 24: POST /api/xp — database failure", () => {
  it("returns a sanitized 500 with no SQL, parameters, DSN, credentials or stack", async () => {
    state.select = sentinelError();

    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to award XP",
      code: "INTERNAL_ERROR",
    });
    expectNoSentinel(body, "xp POST body");
    expectNoSentinel(capturedLogs(), "xp POST log");
    expect(loggedRawErrorObject()).toBe(false);
  });

  it("logs a classified diagnostic instead of the raw exception", async () => {
    state.select = sentinelError();

    await xpPOST(postRequest("/api/xp", { eventType: "content.read", sourceId: "x" }));

    expect(capturedLogs()).toContain("XpService.award failed [category=database_statement_rejected]");
  });

  it("does not report success when the ledger insert fails", async () => {
    state.insertFailureFor = "xp_events";
    state.insert = sentinelError();

    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })
    );

    expect(response.status).not.toBe(200);
    expect((await response.json()).success).toBe(false);
  });
});

describe("Phase 24: DELETE /api/xp — database failure", () => {
  it("returns a sanitized 500 with no SQL, parameters, DSN, credentials or stack", async () => {
    state.update = sentinelError();

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: "Failed to revoke XP",
      code: "INTERNAL_ERROR",
    });
    expectNoSentinel(body, "xp DELETE body");
    expectNoSentinel(capturedLogs(), "xp DELETE log");
    expect(loggedRawErrorObject()).toBe(false);
  });

  it("logs a classified diagnostic instead of the raw exception", async () => {
    state.update = sentinelError();

    await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:x"));

    expect(capturedLogs()).toContain(
      "XpService.revokeByDedupeKey failed [category=database_statement_rejected]"
    );
  });
});

/* ================================================================== *
 * 8, 9 — every thrown shape, including the analytics null-throw bypass
 * ================================================================== */

type RouteCase = {
  name: string;
  call: () => Promise<Response>;
  fail: (thrown: unknown) => void;
};

const routes: RouteCase[] = [
  {
    name: "POST /api/analytics",
    call: () =>
      analyticsPOST(postRequest("/api/analytics", { itemType: "vocabulary", itemId: "de-mizu" })),
    fail: (thrown) => {
      state.select = thrown;
    },
  },
  {
    name: "POST /api/xp",
    call: () =>
      xpPOST(postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu" })),
    fail: (thrown) => {
      state.select = thrown;
    },
  },
  {
    name: "DELETE /api/xp",
    call: () => xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu")),
    fail: (thrown) => {
      state.update = thrown;
    },
  },
];

describe("Phase 24: every thrown shape is handled without a secondary exception", () => {
  for (const route of routes) {
    for (const { label, value } of nonErrorThrows()) {
      it(`${route.name} survives a ${label}`, async () => {
        route.fail(value);

        // The handler must RESOLVE. A throw here is the secondary-exception bug.
        const response = await route.call();

        expect(response.status).toBeGreaterThanOrEqual(400);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.code).toBe("INTERNAL_ERROR");
        expectNoSentinel(body, `${route.name} body (${label})`);
        expectNoSentinel(capturedLogs(), `${route.name} log (${label})`);
      });
    }
  }

  it("9. POST /api/analytics survives the previously observed null-throw bypass", async () => {
    // `catch (error: any)` + `error.message` used to raise
    // "TypeError: Cannot read properties of null (reading 'message')" from
    // inside the catch block itself, escaping the handler entirely.
    state.select = null;

    const response = await analyticsPOST(
      postRequest("/api/analytics", { itemType: "vocabulary", itemId: "de-mizu" })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Failed to track study event",
      code: "INTERNAL_ERROR",
    });
  });
});

/* ================================================================== *
 * 10 — validation, success, not-found and idempotency are preserved
 * ================================================================== */

describe("Phase 24: validation behaviour is preserved (400, not 500)", () => {
  it("POST /api/analytics rejects a missing itemType/itemId with 400", async () => {
    const response = await analyticsPOST(postRequest("/api/analytics", { userId: ACTOR_ID }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: "itemType and itemId are required",
    });
  });

  it("POST /api/xp rejects an unknown eventType with 400 and the documented message", async () => {
    const response = await xpPOST(postRequest("/api/xp", { eventType: "not.a.real.event" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("eventType must be one of:");
    expect(body.code).toBeUndefined();
  });

  it("POST /api/xp keeps 400 for a malformed JSON body without leaking parser text", async () => {
    const response = await xpPOST(malformedJsonRequest("/api/xp"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expectNoSentinel(body, "xp malformed-JSON body");
    expectNoSentinel(capturedLogs(), "xp malformed-JSON log");
  });

  it("DELETE /api/xp still requires dedupeKey with 400", async () => {
    const response = await xpDELETE(deleteRequest("/api/xp"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "dedupeKey is required" });
  });
});

describe("Phase 24: success contracts are unchanged", () => {
  it("POST /api/xp awards XP and returns the documented envelope", async () => {
    const response = await xpPOST(
      postRequest("/api/xp", { eventType: "content.read", sourceId: "de-mizu", userId: "u-42" })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result).toMatchObject({
      awarded: true,
      duplicate: false,
      skipped: false,
      points: expect.any(Number),
      ruleKey: "content-read",
      totalXp: expect.any(Number),
    });
    expect(body.result.points).toBeGreaterThan(0);
    expect(body.code).toBeUndefined();
  });

  it("POST /api/xp keeps idempotent duplicate reporting", async () => {
    state.selectRows = [{ id: "xp-existing-1", points: 5 }];

    const response = await xpPOST(
      postRequest("/api/xp", {
        eventType: "content.read",
        sourceId: "de-mizu",
        dedupeKey: "content.read:de-mizu",
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result).toMatchObject({ awarded: false, duplicate: true, eventId: "xp-existing-1" });
  });

  it("DELETE /api/xp revokes and reports the points", async () => {
    state.updateRows = [{ points: 7 }];

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=content.read:de-mizu"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revoked: true, points: 7 });
  });

  it("DELETE /api/xp keeps the existing 200 revoked:false behaviour for an unknown key", async () => {
    state.updateRows = [];

    const response = await xpDELETE(deleteRequest("/api/xp?dedupeKey=nothing-here"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, revoked: false, points: 0 });
  });

  it("POST /api/analytics tracks a study event and returns the documented envelope", async () => {
    const response = await analyticsPOST(
      postRequest("/api/analytics", {
        userId: "u-42",
        itemType: "vocabulary",
        itemId: "de-mizu",
        jlptLevel: "N5",
      })
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ awarded: true, points: expect.any(Number) });
    expect(body.code).toBeUndefined();
  });
});

/* ================================================================== *
 * 11 — service-level mutation semantics
 * ================================================================== */

describe("Phase 24: trackStudyEvent surfaces a failed award", () => {
  it("rejects instead of resolving when the ledger insert fails", async () => {
    state.insertFailureFor = "xp_events";
    state.insert = sentinelError();

    await expect(
      AnalyticsService.trackStudyEvent({ userId: "u-1", itemType: "vocabulary", itemId: "de-mizu" })
    ).rejects.toBeTruthy();
  });

  it("does not resolve with a success payload carrying the sentinel", async () => {
    state.insertFailureFor = "xp_events";
    state.insert = sentinelError();

    let captured: unknown = null;
    try {
      captured = await AnalyticsService.trackStudyEvent({
        userId: "u-1",
        itemType: "vocabulary",
        itemId: "de-mizu",
      });
    } catch {
      captured = null;
    }
    expectNoSentinel(captured, "trackStudyEvent result");
    expectNoSentinel(capturedLogs(), "trackStudyEvent log");
  });
});

describe("Phase 24: XpService.awardSafe keeps its non-fatal contract but logs safely", () => {
  it("returns null on failure without serialising the error into the log", async () => {
    state.insertFailureFor = "xp_events";
    state.insert = sentinelError();

    const result = await XpService.awardSafe({
      payload: { eventType: "content.read", userId: "u-1", sourceId: "de-mizu" },
      dedupeKey: "content.read:de-mizu",
    });

    // Non-fatal by design: the caller decides what a null means.
    expect(result).toBeNull();
    expect(capturedLogs()).toContain(
      "XpService.awardSafe failed [category=database_statement_rejected]"
    );
    expectNoSentinel(capturedLogs(), "awardSafe log");
    expect(loggedRawErrorObject()).toBe(false);
  });
});
