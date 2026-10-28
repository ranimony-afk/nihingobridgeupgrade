/**
 * Phase 22A — seeding-failure log sanitization.
 *
 * VULNERABILITY UNDER TEST: `TestService.ensureSeeded` caught failures with
 * `console.error("Failed to seed database questions:", error)`. A Drizzle/pg
 * error serializes its SQL text, bound parameters, connection target, and the
 * full driver `cause` chain into the server log. `submitSession`'s analytics
 * catch had the identical pattern (`console.warn(..., e)`).
 *
 * This suite drives the REAL `TestService` (no service-level mocking) with only
 * the database boundary replaced, so the vulnerable logging path actually
 * executes. Logs are captured through `console` itself — the application's
 * actual logger — not through source-text assertions.
 *
 * Layering:
 *   - UNIT      — `classifyFailure` / `describeFailure` (pure).
 *   - INTEGRATION — real `ensureSeeded` + real `GET` route over a failing db.
 *   - STATIC    — narrow guard that the logging call shape cannot return.
 *
 * Sentinels are deliberately distinctive so ordinary words in the legitimate
 * diagnostic ("failed", "category", "TestService") can never cause a false
 * positive.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * Sentinels (synthetic; no real secrets or production data)
 * ------------------------------------------------------------------ */

const SENTINEL_SQL = "SELECT_SENTINEL_7f3a9c FROM questions_sentinel_tbl WHERE id = $1";
const SENTINEL_PARAM_1 = "PARAM_SENTINEL_b41d";
const SENTINEL_PARAM_2 = "PARAM_SENTINEL_e77c";
const SENTINEL_DSN = "postgresql://sentinel_user:SENTINEL_PASSWORD_9x2@sentinel-db.internal:5432/sentinel";
const SENTINEL_PASSWORD = "SENTINEL_PASSWORD_9x2";
const SENTINEL_TOKEN = "SENTINEL_TOKEN_c19f04";
const SENTINEL_API_KEY = "SENTINEL_API_KEY_a83b71";
const SENTINEL_STACK_FRAME = "at sentinelFrame_5d2e (/srv/sentinel/path/sentinel_mod.ts:42:13)";

const ALL_SENTINELS = [
  SENTINEL_SQL,
  SENTINEL_PARAM_1,
  SENTINEL_PARAM_2,
  SENTINEL_DSN,
  SENTINEL_PASSWORD,
  SENTINEL_TOKEN,
  SENTINEL_API_KEY,
  SENTINEL_STACK_FRAME,
  "SELECT_SENTINEL_7f3a9c",
  "sentinelFrame_5d2e",
  "sentinel-db.internal",
];

/** Build a synthetic driver failure carrying every sensitive surface. */
function sentinelError(): Error {
  const error = new Error(
    `Failed query: ${SENTINEL_SQL}\nparams: ${SENTINEL_PARAM_1},${SENTINEL_PARAM_2}\n` +
      `dsn=${SENTINEL_DSN}\ntoken=${SENTINEL_TOKEN} apiKey=${SENTINEL_API_KEY}`
  );
  error.stack = `Error: Failed query: ${SENTINEL_SQL}\n    ${SENTINEL_STACK_FRAME}`;
  // Drizzle wraps the driver error; model the realistic cause chain.
  (error as { cause?: unknown }).cause = Object.assign(
    new Error(`connect ECONNREFUSED ${SENTINEL_DSN}`),
    { code: "ECONNREFUSED" }
  );
  return error;
}

/* ------------------------------------------------------------------ *
 * The database boundary is the ONLY thing replaced.
 * ------------------------------------------------------------------ */

const { NO_FAILURE, state } = vi.hoisted(() => {
  const NO_FAILURE = Symbol("no-failure");
  return { NO_FAILURE, state: { select: NO_FAILURE as unknown, insert: NO_FAILURE as unknown } };
});

/**
 * A chainable, awaitable stub: every method returns another queryable, and the
 * chain settles only when awaited. This mirrors drizzle's builder closely
 * enough for `db.select().from(t).where(...)` at any chain length, and — unlike
 * a bare `Promise.reject()` — it never creates an unhandled rejection when the
 * code touches a further method before awaiting.
 */
vi.mock("@/db", () => {
  const queryable = (failure: unknown): unknown =>
    new Proxy(
      {
        then(onFulfilled: unknown, onRejected: unknown) {
          const settled =
            failure === NO_FAILURE ? Promise.resolve([]) : Promise.reject(failure);
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
  return { db: { select: () => queryable(state.select), insert: () => queryable(state.insert) } };
});

import {
  classifyFailure,
  describeFailure,
  logOperationFailure,
} from "@/lib/logging/safeDiagnostics";
import { TestService } from "@/services/jlpt/testService";
import { GET as questionsGET } from "@/app/api/questions/route";

let errorLog: ReturnType<typeof vi.spyOn>;
let warnLog: ReturnType<typeof vi.spyOn>;

function captured(log: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(log.mock.calls);
}

/** No sentinel may appear in captured log output. */
function expectNoSentinel(log: ReturnType<typeof vi.spyOn>, label: string) {
  const text = captured(log);
  for (const sentinel of ALL_SENTINELS) {
    expect(`${label}: ${text}`).not.toContain(sentinel);
  }
}

function nextRequest(url: string): NextRequest {
  const request = new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}

beforeEach(() => {
  state.select = NO_FAILURE;
  state.insert = NO_FAILURE;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== *
 * UNIT — classification is closed-vocabulary and never reads messages
 * ================================================================== */

describe("Phase 22A unit: failure classification", () => {
  it("1. classifies connection-level failures without reading the message", () => {
    const network = Object.assign(new Error("irrelevant text"), { code: "ECONNREFUSED" });
    const notFound = Object.assign(new Error("irrelevant text"), { code: "ENOTFOUND" });
    expect(classifyFailure(network)).toBe("database_unavailable");
    expect(classifyFailure(notFound)).toBe("database_unavailable");
  });

  it("2. finds a code nested in a Drizzle-style cause chain", () => {
    const wrapped = Object.assign(new Error("wrapper"), {
      cause: Object.assign(new Error("inner"), { code: "23505" }),
    });
    expect(classifyFailure(wrapped)).toBe("database_statement_rejected");
  });

  it("3. classifies SQLSTATE integrity/connection classes", () => {
    for (const code of ["23505", "23503", "42P01", "28P01", "22P02", "08006"]) {
      expect(classifyFailure(Object.assign(new Error("x"), { code }))).toBe(
        "database_statement_rejected"
      );
    }
  });

  it("4. unknown codes and non-Error throws degrade to unknown_failure", () => {
    expect(classifyFailure(Object.assign(new Error("x"), { code: "SOMETHING_ELSE" }))).toBe(
      "unknown_failure"
    );
    for (const thrown of ["a string", 42, null, undefined, { code: 123 }, []]) {
      expect(classifyFailure(thrown)).toBe("unknown_failure");
    }
  });

  it("5. the diagnostic never contains exception text", () => {
    const line = describeFailure("TestService.ensureSeeded", sentinelError());
    expect(line).toBe(
      "TestService.ensureSeeded failed [category=database_unavailable]"
    );
    for (const sentinel of ALL_SENTINELS) expect(line).not.toContain(sentinel);
  });

  it("6. hostile throw values cannot make logging throw", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("poisoned getter");
        },
        getPrototypeOf() {
          throw new Error("poisoned prototype");
        },
      }
    );
    expect(() => classifyFailure(hostile)).not.toThrow();
    expect(() => logOperationFailure("error", "TestService.ensureSeeded", hostile)).not.toThrow();
    expect(classifyFailure(hostile)).toBe("unknown_failure");
  });

  it("7. cyclic cause chains terminate", () => {
    const cyclic = new Error("loop") as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    expect(() => classifyFailure(cyclic)).not.toThrow();
  });
});

/* ================================================================== *
 * INTEGRATION — the real ensureSeeded executes its catch block
 * ================================================================== */

describe("Phase 22A: TestService.ensureSeeded failure logging", () => {
  it("8. database query failure logs a stable, actionable operation identifier", async () => {
    state.select = sentinelError();

    await expect(TestService.ensureSeeded()).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledTimes(1);
    const line = errorLog.mock.calls[0]![0] as string;
    expect(line).toContain("TestService.ensureSeeded");
    expect(line).toMatch(/\[category=(database_unavailable|database_statement_rejected|unknown_failure)\]/);
  });

  it("9. SQL text, bound parameters, DSN, credentials and stack never reach the log", async () => {
    state.select = sentinelError();

    await TestService.ensureSeeded();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expectNoSentinel(errorLog, "ensureSeeded select failure");
    // Exactly one argument, and it is a plain string — no serialized object.
    expect(errorLog.mock.calls[0]).toHaveLength(1);
    expect(typeof errorLog.mock.calls[0]![0]).toBe("string");
  });

  it("10. a failure during the seed INSERT is equally sanitized", async () => {
    // Empty table -> insert path; the insert itself fails with a DSN-laden error.
    state.select = NO_FAILURE;
    state.insert = sentinelError();

    await TestService.ensureSeeded();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expectNoSentinel(errorLog, "ensureSeeded insert failure");
  });

  it("11. non-Error throw values are handled without sensitive serialization", async () => {
    const cases: unknown[] = [
      `raw string containing ${SENTINEL_SQL} and ${SENTINEL_DSN}`,
      { message: SENTINEL_SQL, password: SENTINEL_PASSWORD, token: SENTINEL_TOKEN },
      null,
    ];

    for (const thrown of cases) {
      errorLog.mockClear();
      state.select = thrown;
      await expect(TestService.ensureSeeded()).resolves.toBeUndefined();
      expect(errorLog).toHaveBeenCalledTimes(1);
      expectNoSentinel(errorLog, `non-Error throw ${String(typeof thrown)}`);
    }
  });
});

/* ================================================================== *
 * PROPAGATION & NESTED CATCHES
 * ================================================================== */

describe("Phase 22A: failure propagation and nested catches", () => {
  it("12. seeding failure is not converted into success by the read route", async () => {
    state.select = sentinelError();

    // Inner catch: ensureSeeded logs and returns (documented best-effort
    // contract, unchanged by this phase).
    await expect(TestService.ensureSeeded()).resolves.toBeUndefined();

    // Outer catch: the caller's query still fails, so the route must NOT
    // report an empty successful result.
    const response = await questionsGET(nextRequest("http://localhost/api/questions?level=N5"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body).not.toHaveProperty("questions");
    expect(body).not.toHaveProperty("total");
  });

  it("13. inner and outer catches together leak nothing (log or response)", async () => {
    state.select = sentinelError();
    const response = await questionsGET(nextRequest("http://localhost/api/questions"));
    expect(response.status).toBe(500);

    const bodyText = JSON.stringify(await response.json());
    for (const sentinel of ALL_SENTINELS) {
      expect(`response: ${bodyText}`).not.toContain(sentinel);
    }
    // Inner (ensureSeeded) + outer (route) diagnostic lines, both clean.
    expect(errorLog.mock.calls.length).toBeGreaterThanOrEqual(1);
    expectNoSentinel(errorLog, "nested catches");
    expect(
      (errorLog.mock.calls as unknown[][]).some((call) =>
        String(call[0]).includes("GET /api/questions failed")
      )
    ).toBe(true);
    expect(
      (errorLog.mock.calls as unknown[][]).some((call) =>
        String(call[0]).includes("TestService.ensureSeeded")
      )
    ).toBe(true);
  });

  it("14. the analytics catch uses the same sanitized convention", async () => {
    const source = readFileSync("src/services/jlpt/testService.ts", "utf8");
    expect(source).toContain('logOperationFailure("warn", "TestService.updateUserAnalytics", e)');
    expect(source).toContain('logOperationFailure("error", "TestService.ensureSeeded", error)');
  });
});

/* ================================================================== *
 * STATIC GUARD — the raw-object logging shape cannot come back
 * ================================================================== */

describe("Phase 22A static guard", () => {
  it("15. testService.ts never logs a thrown value as an argument", () => {
    const source = readFileSync("src/services/jlpt/testService.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");

    // `console.error("...", error)` / `console.warn("...", e)` — the exact
    // shape that serialized driver errors.
    expect(source).not.toMatch(/console\.(error|warn)\s*\(\s*[^)]*,\s*(error|e|err|failure)\s*\)/);
    // No error is stringified or spread into a log call.
    expect(source).not.toMatch(/JSON\.stringify\s*\(\s*(error|e|err)\b/);
    expect(source).not.toMatch(/console\.(error|warn)\s*\(\s*(error|e|err)\s*\)/);
  });

  it("16. the safe helper never reads message, name, or stack", () => {
    const source = readFileSync("src/lib/logging/safeDiagnostics.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");
    // The word "message" appears only in documentation comments, which were
    // stripped above: no property read remains.
    expect(source).not.toMatch(/\.message|\.stack|\.name\b/);
    expect(source).not.toMatch(/String\s*\(\s*thrown\s*\)/);
  });
});
