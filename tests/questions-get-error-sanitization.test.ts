/**
 * Read-path error sanitization — `GET /api/questions` and
 * `GET /api/questions/[id]`.
 *
 * The captured behaviour: both handlers returned `error.message` to the
 * client on a database failure. Drizzle's message embeds the failing SQL and
 * its bound parameters, so a 500 leaked the query text, the parameter values,
 * and connection detail. This suite pins the sanitized contract.
 *
 * Guarantees asserted here:
 *   1. Clients receive a stable message — never SQL, parameters, driver text,
 *      stack traces, or credentials.
 *   2. Server logs carry the error class only, not the message body.
 *   3. The success envelopes, the 404 path, and public (unauthenticated)
 *      read access are unchanged — this is a leak fix, not an access change.
 *
 * No database is contacted: `TestService` is replaced with doubles, so the
 * failure is deterministic and nothing is written anywhere.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/services/jlpt/testService", () => ({
  TestService: {
    queryQuestions: vi.fn(),
    getQuestionById: vi.fn(),
  },
}));

import { GET as collectionGET } from "@/app/api/questions/route";
import { GET as itemGET } from "@/app/api/questions/[id]/route";
import { TestService } from "@/services/jlpt/testService";
import {
  resetActorResolver,
  resetSupabaseClientFactory,
} from "@/lib/auth";

const mockQueryQuestions = vi.mocked(TestService.queryQuestions);
const mockGetQuestionById = vi.mocked(TestService.getQuestionById);

/**
 * A realistic Drizzle failure: the message contains the SQL, the bound
 * parameters, and a connection string. Every one of these must stay out of
 * the HTTP response AND out of the logs.
 */
const SENTINEL_SQL = 'Failed query: select "id", "prompt" from "questions" where "questions"."id" = $1';
const SENTINEL_PARAMS = "params: n5-vocab-1,1";
const SENTINEL_DSN = "postgresql://app_user:sup3r-s3cret@db.internal:5432/nihongo";

function leakyError(): Error {
  return new Error(`${SENTINEL_SQL}\n${SENTINEL_PARAMS}\n${SENTINEL_DSN}`);
}

function nextRequest(url: string): NextRequest {
  const request = new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}

function itemCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockQueryQuestions.mockReset();
  mockGetQuestionById.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetActorResolver();
  resetSupabaseClientFactory();
});

/**
 * Assert no leak token appears in a serialized payload.
 *
 * Tokens are deliberately SQL/DSN-specific. Bare names such as "questions" or
 * "select" are NOT used: the legitimate user-facing message ("Failed to fetch
 * questions") contains them in prose, so matching those would produce false
 * failures rather than evidence.
 */
function expectNoLeak(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const token of [
    "Failed query",
    "params:",
    "select ",
    "postgresql://",
    "app_user",
    "sup3r-s3cret",
    "db.internal",
    "$1",
    "at Object",
    "node_modules",
    "ECONNREFUSED",
  ]) {
    expect(text).not.toContain(token);
  }
}

/* ------------------------------------------------------------------ *
 * GET /api/questions
 * ------------------------------------------------------------------ */

describe("GET /api/questions — database failure is sanitized", () => {
  it("1. returns a stable 500 body with no SQL, parameters, or credentials", async () => {
    mockQueryQuestions.mockRejectedValue(leakyError());
    const response = await collectionGET(nextRequest("http://localhost/api/questions?level=N5"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: false,
      error: "Failed to fetch questions",
      code: "INTERNAL_ERROR",
    });
    expectNoLeak(body);
  });

  it("2. logs only the error class, never the message body", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mockQueryQuestions.mockRejectedValue(leakyError());

    await collectionGET(nextRequest("http://localhost/api/questions"));

    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("GET /api/questions failed");
    expect(logged).toContain("Error");
    // The message content must not be logged either.
    expectNoLeak(logged);
  });

  it("3. non-Error failures are handled without leaking or crashing", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const thrown of ["plain string with postgresql://x:y@h/db", { sql: "select 1" }, null, undefined]) {
      mockQueryQuestions.mockRejectedValue(thrown);
      const response = await collectionGET(nextRequest("http://localhost/api/questions"));
      expect(response.status).toBe(500);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.code).toBe("INTERNAL_ERROR");
      expectNoLeak(body);
    }
    expectNoLeak(JSON.stringify(errorLog.mock.calls));
  });

  it("4. the success envelope is unchanged and the read path stays public", async () => {
    // No session, no Supabase configuration: anonymous reads must still work.
    mockQueryQuestions.mockResolvedValue({
      total: 1,
      questions: [{ id: "n5-vocab-1", prompt: "毎日" }],
    } as never);

    const response = await collectionGET(nextRequest("http://localhost/api/questions?level=N5"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      total: 1,
      questions: [{ id: "n5-vocab-1", prompt: "毎日" }],
    });
  });

  it("5. query parameters are still forwarded as before", async () => {
    mockQueryQuestions.mockResolvedValue({ total: 0, questions: [] } as never);
    await collectionGET(
      nextRequest(
        "http://localhost/api/questions?level=N4&section=grammar&category=grammar_form&mondaiNumber=2&keyword=abc&tag=x&limit=5&offset=10"
      )
    );
    expect(mockQueryQuestions).toHaveBeenCalledWith({
      level: "N4",
      section: "grammar",
      category: "grammar_form",
      mondaiNumber: 2,
      keyword: "abc",
      tag: "x",
      limit: 5,
      offset: 10,
    });
  });
});

/* ------------------------------------------------------------------ *
 * GET /api/questions/[id]
 * ------------------------------------------------------------------ */

describe("GET /api/questions/[id] — database failure is sanitized", () => {
  it("6. returns a stable 500 body with no SQL, parameters, or credentials", async () => {
    mockGetQuestionById.mockRejectedValue(leakyError());
    const response = await itemGET(nextRequest("http://localhost/api/questions/n5-vocab-1"), itemCtx("n5-vocab-1"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      success: false,
      error: "Failed to fetch question",
      code: "INTERNAL_ERROR",
    });
    expectNoLeak(body);
  });

  it("7. logs only the error class", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetQuestionById.mockRejectedValue(leakyError());

    await itemGET(nextRequest("http://localhost/api/questions/n5-vocab-1"), itemCtx("n5-vocab-1"));

    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("GET /api/questions/[id] failed");
    expectNoLeak(logged);
  });

  it("8. the 404 path is unchanged and reveals nothing about the query", async () => {
    mockGetQuestionById.mockResolvedValue(null);
    const response = await itemGET(nextRequest("http://localhost/api/questions/missing"), itemCtx("missing"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Question not found",
    });
  });

  it("9. the success envelope is unchanged and reads stay public", async () => {
    mockGetQuestionById.mockResolvedValue({ id: "n5-vocab-1" } as never);
    const response = await itemGET(nextRequest("http://localhost/api/questions/n5-vocab-1"), itemCtx("n5-vocab-1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      question: { id: "n5-vocab-1" },
    });
  });
});

/* ------------------------------------------------------------------ *
 * Static proof that the leak channel is gone
 * ------------------------------------------------------------------ */

describe("read handlers hold no error-message channel", () => {
  const strip = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

  /** The GET handler only: POST legitimately returns validation messages. */
  function getHandler(file: string): string {
    const source = strip(readFileSync(file, "utf8"));
    const start = source.indexOf("export async function GET");
    expect(start).toBeGreaterThan(-1);
    const rest = source.slice(start + 1);
    const next = rest.indexOf("export async function");
    return next === -1 ? rest : rest.slice(0, next);
  }

  it("10. neither GET handler surfaces error.message", () => {
    for (const file of [
      "src/app/api/questions/route.ts",
      "src/app/api/questions/[id]/route.ts",
    ]) {
      const handler = getHandler(file);
      // A read handler may not read the error's message or stringify it.
      expect(`${file}: ${handler}`).not.toMatch(
        /error\.message|error\?\.message|String\(error\)/
      );
    }
  });

  it("11. POST keeps its sanitized validation channel unchanged", () => {
    // Guard against the fix over-reaching: QuestionAuthoringError messages are
    // caller-safe by construction and must still reach the client.
    const source = strip(readFileSync("src/app/api/questions/route.ts", "utf8"));
    expect(source).toContain("error instanceof QuestionAuthoringError");
    expect(source).toContain("Failed to create question.");
  });

  it("12. the sanitized convention is shared with GET /api/search", () => {
    // Same shape as the PR #19 reference implementation: a generic log line
    // and a generic message, so the read paths cannot drift apart again.
    const search = strip(readFileSync("src/app/api/search/route.ts", "utf8"));
    expect(search).toContain('console.error("GET /api/search failed")');
    expect(search).not.toMatch(/error\.message/);
  });
});
