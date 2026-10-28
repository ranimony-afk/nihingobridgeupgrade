/**
 * Secure `POST /api/questions` — server-side authorization.
 *
 * The route is exercised as a real route handler (no HTTP server) over the
 * established seams:
 *   - `setSupabaseClientFactory`  → verified provider identity (canned claims)
 *   - `setApplicationUserStore`   → the users table (in-memory fake)
 *   - `setActorResolver`          → deterministic actor injection
 *   - `setQuestionStore`          → the only write surface
 *
 * Covered: missing authentication, forged/invalid identity, authenticated
 * but unauthorized, authorized success, malformed input, auth dependency
 * failure, store failure, and — for every rejection — zero writes.
 *
 * Evidence layers:
 *   1. FakeQuestionStore — counts attempted writes; the rejections cannot
 *      reach it at all.
 *   2. Disposable PGlite (real SQL, real Drizzle adapter, real schema DDL
 *      extracted from drizzle/0000_absurd_emma_frost.sql) — row counts are
 *      read back after every rejected request.
 *   PGlite is NOT PostgreSQL: this is emulated-engine SQL evidence. No real
 *   PostgreSQL server, no production database, and no production
 *   credentials are used anywhere in this file.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { like } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

// The read path is mocked only so the GET compatibility assertions are
// DB-free; POST never touches TestService.
vi.mock("@/services/jlpt/testService", () => ({
  TestService: {
    queryQuestions: vi.fn(),
    getQuestionById: vi.fn(),
  },
}));

import { db } from "@/db";
import { GET, POST } from "@/app/api/questions/route";
import { TestService } from "@/services/jlpt/testService";
import type {
  ApplicationUserRecord,
  ApplicationUserStore,
  CmsRole,
} from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setActorResolver,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import type { NewQuestionRow } from "@/services/jlpt/questionDraft";
import { parseCreateQuestionDraft } from "@/services/jlpt/questionDraft";
import { questions as questionsTable } from "@/db/schema";
import {
  createDrizzleQuestionStore,
  resetQuestionStore,
  setQuestionStore,
} from "@/services/jlpt/questionAuthoring";
import type { QuestionStore } from "@/services/jlpt/questionAuthoring";

const mockQueryQuestions = vi.mocked(TestService.queryQuestions);

/* ------------------------------------------------------------------ *
 * Doubles
 * ------------------------------------------------------------------ */

/** Records every attempted insert; never touches a database. */
class FakeQuestionStore implements QuestionStore {
  readonly writes: NewQuestionRow[] = [];
  /** When set, the next insert rejects with this error. */
  failure: unknown = null;

  async insertQuestion(row: NewQuestionRow): Promise<void> {
    if (this.failure !== null) {
      const failure = this.failure;
      this.failure = null;
      throw failure;
    }
    this.writes.push(row);
  }
}

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

let store: FakeQuestionStore;
let users: FakeUserStore;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  resetQuestionStore();
  store = new FakeQuestionStore();
  users = new FakeUserStore();
  setQuestionStore(store);
  setApplicationUserStore(users);
  mockQueryQuestions.mockReset();
});

afterEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  resetQuestionStore();
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

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
}

function post(
  body: unknown,
  init: { headers?: HeadersInit; raw?: boolean } = {}
): Request {
  const payload =
    init.raw === true
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : JSON.stringify(body);
  return new Request("http://localhost/api/questions", {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function nextRequest(url: string): NextRequest {
  const request = new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}

/** A complete, valid payload (the shape `src/app/question-bank` sends). */
function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。",
    questionType: "multiple_choice",
    prompt: "毎日 日本語を 勉強します。",
    promptTranslation: "I study Japanese every day.",
    options: [
      { id: "1", text: "まいにち" },
      { id: "2", text: "まいあさ" },
      { id: "3", text: "まいばん" },
      { id: "4", text: "まいしゅう" },
    ],
    correctAnswer: "1",
    explanation: "毎日 is read まいにち.",
    tags: ["daily-life"],
    ...overrides,
  };
}

async function body(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

/** No internals may reach the client. */
function expectSanitized(responseBody: Record<string, any>) {
  const text = JSON.stringify(responseBody).toLowerCase();
  for (const leak of [
    "insert into",
    "questions\"",
    "sql",
    "syntax error",
    "constraint",
    "duplicate key",
    "at object.",
    "stack",
    "password",
    "postgres",
    "drizzle",
    "supabase",
    "authorization",
    "cms.create",
    "cms_create",
    "token",
  ]) {
    expect(text).not.toContain(leak);
  }
}

/* ------------------------------------------------------------------ *
 * 1. Missing authentication
 * ------------------------------------------------------------------ */

describe("POST /api/questions — missing authentication fails closed", () => {
  it("1. anonymous create is rejected with 401 and writes nothing", async () => {
    authenticateAs(null);
    const response = await POST(post(validDraft()));

    expect(response.status).toBe(401);
    const json = await body(response);
    expect(json.success).toBe(false);
    expect(json.code).toBe("UNAUTHENTICATED");
    expect(json.error).toBe("Authentication required.");
    expectSanitized(json);
    expect(response.headers.get("cache-control")).toContain("no-store");

    expect(store.writes).toHaveLength(0);
    // Anonymous callers never provision a user row either.
    expect(users.size).toBe(0);
  });

  it("2. no identity configuration at all (default resolver) is 401", async () => {
    // No supabase client factory, no actor resolver, no DATABASE_URL.
    const response = await POST(post(validDraft()));
    expect(response.status).toBe(401);
    expect((await body(response)).code).toBe("UNAUTHENTICATED");
    expect(store.writes).toHaveLength(0);
  });

  it("3. the pre-existing unauthenticated payload shape is now rejected", async () => {
    // Exactly the body src/app/question-bank/page.tsx used to POST
    // anonymously before this fix.
    authenticateAs(null);
    const legacyBody = validDraft({ tags: ["daily-life", "kanji"] });
    const response = await POST(post(legacyBody));
    expect(response.status).toBe(401);
    expect(store.writes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Invalid or forged identity
 * ------------------------------------------------------------------ */

describe("POST /api/questions — invalid or forged identity", () => {
  it("4. expired/invalid sessions resolve to anonymous (401)", async () => {
    authenticateAs(null); // error branch: invalid JWT / missing session
    expect((await POST(post(validDraft()))).status).toBe(401);

    // Valid envelope with unusable claims: no sub, empty sub, wrong type.
    for (const claims of [
      { email: "ghost@example.com" },
      { sub: "" },
      { sub: 12345 },
      { sub: ["sub-attacker"] },
      null,
    ]) {
      authenticateAs(claims as Record<string, unknown> | null);
      const response = await POST(post(validDraft()));
      expect(response.status).toBe(401);
    }
    expect(store.writes).toHaveLength(0);
    expect(users.size).toBe(0);
  });

  it("5. forged transport identity headers confer nothing", async () => {
    authenticateAs(null);
    const response = await POST(
      post(validDraft(), {
        headers: {
          "x-user-id": "user-admin-1",
          "x-role": "admin",
          "x-admin-key": "let-me-in",
          "x-forwarded-user": "admin",
          authorization: "Bearer forged-token",
        },
      })
    );
    expect(response.status).toBe(401);
    expect(store.writes).toHaveLength(0);
  });

  it("6. client-supplied identity fields in the payload confer nothing", async () => {
    authenticateAs(null);
    const response = await POST(
      post(
        validDraft({
          userId: "user-admin-1",
          user_id: "user-admin-1",
          role: "admin",
          authorId: "user-admin-1",
          createdById: "user-admin-1",
          isActive: true,
          permissions: ["cms.create"],
          actor: { id: "user-admin-1", role: "admin" },
        })
      )
    );
    expect(response.status).toBe(401);
    expect(store.writes).toHaveLength(0);
  });

  it("7. a verified identity with no stored role is a learner, not a writer", async () => {
    // First sight: the pipeline provisions a learner row, then denies.
    authenticateAs({ sub: "sub-newcomer" });
    const response = await POST(post(validDraft()));
    expect(response.status).toBe(403);
    expect((await body(response)).code).toBe("FORBIDDEN");
    expect(store.writes).toHaveLength(0);
    // Provisioning a learner row is the auth pipeline's documented
    // behaviour; it never grants write access and never touches questions.
    expect(users.size).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Authenticated but unauthorized
 * ------------------------------------------------------------------ */

describe("POST /api/questions — authenticated without cms.create", () => {
  it("8. learner is rejected with 403 and writes nothing", async () => {
    actAs("learner");
    const response = await POST(post(validDraft()));

    expect(response.status).toBe(403);
    const json = await body(response);
    expect(json.code).toBe("FORBIDDEN");
    expect(json.error).toBe(
      "You do not have permission to perform this action."
    );
    expectSanitized(json);
    expect(store.writes).toHaveLength(0);
    // The seeded learner was found, not re-provisioned: no indirect write.
    expect(users.size).toBe(1);
  });

  it("9. reviewer (read/approve only) is rejected with 403", async () => {
    actAs("reviewer");
    const response = await POST(post(validDraft()));
    expect(response.status).toBe(403);
    expect(store.writes).toHaveLength(0);
  });

  it("10. an unknown stored role degrades to learner (403), never widens", async () => {
    users.seed("supabase", "sub-weird", {
      id: "user-weird",
      name: "Weird",
      role: "superadmin",
    });
    authenticateAs({ sub: "sub-weird" });
    const response = await POST(post(validDraft()));
    expect(response.status).toBe(403);
    expect(store.writes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Properly authorized
 * ------------------------------------------------------------------ */

describe("POST /api/questions — authorized creation still works", () => {
  it("11. editor creates a question once, with defaults and a whitelist row", async () => {
    actAs("editor", "user-editor-1");
    const response = await POST(post(validDraft()));

    expect(response.status).toBe(200);
    const json = await body(response);
    expect(json).toEqual({
      success: true,
      message: "Question created successfully",
      id: expect.stringMatching(/^q-\d+$/),
    });

    expect(store.writes).toHaveLength(1);
    const row = store.writes[0]!;
    expect(row).toMatchObject({
      id: json.id,
      jlptLevel: "N5",
      section: "vocab",
      category: "kanji_reading",
      mondaiNumber: 1,
      questionType: "multiple_choice",
      prompt: "毎日 日本語を 勉強します。",
      promptTranslation: "I study Japanese every day.",
      correctAnswer: "1",
      explanation: "毎日 is read まいにち.",
      difficulty: 3,
      tags: ["daily-life"],
      promptFurigana: null,
      passage: null,
      starOrderParts: null,
      explanationBreakdown: null,
    });
    // Server-authoritative fields are absent from the row entirely: the
    // adapter (not the client) decides isActive and the timestamps.
    expect(Object.keys(row)).not.toContain("isActive");
    expect(Object.keys(row)).not.toContain("createdAt");
    expect(Object.keys(row)).not.toContain("updatedAt");
  });

  it("12. a client id is honoured but still bounded and validated", async () => {
    actAs("editor");
    const response = await POST(post(validDraft({ id: "n5-vocab-900" })));
    expect(response.status).toBe(200);
    expect((await body(response)).id).toBe("n5-vocab-900");
    expect(store.writes[0]!.id).toBe("n5-vocab-900");
  });

  it("13. admin passes, and hostile extra fields are dropped, not stored", async () => {
    actAs("admin");
    const response = await POST(
      post(
        validDraft({
          userId: "user-victim",
          role: "admin",
          isActive: false,
          createdAt: "1999-01-01T00:00:00.000Z",
          options: [
            { id: "1", text: "まいにち", injected: { evil: true } },
            { id: "2", text: "まいあさ" },
          ],
          correctAnswer: "1",
        })
      )
    );
    expect(response.status).toBe(200);
    const row = store.writes[0]!;
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("role");
    expect(row).not.toHaveProperty("isActive");
    expect(row).not.toHaveProperty("createdAt");
    expect(row.options).toEqual([
      { id: "1", text: "まいにち" },
      { id: "2", text: "まいあさ" },
    ]);
  });

  it("14. star-order drafts validate their parts and are stored intact", async () => {
    actAs("editor");
    const response = await POST(
      post(
        validDraft({
          category: "sentence_order",
          mondaiNumber: 6,
          questionType: "star_order",
          prompt: "わたしは 日曜日に ____ ____ ★ ____ いきました。",
          correctAnswer: "3",
          starOrderParts: {
            parts: [
              { id: "1", text: "東京へ" },
              { id: "2", text: "友達と" },
              { id: "3", text: "電車で" },
              { id: "4", text: "いっしょに" },
            ],
            correctOrder: ["2", "4", "3", "1"],
            starPosition: 3,
          },
        })
      )
    );
    expect(response.status).toBe(200);
    expect(store.writes[0]!.starOrderParts).toMatchObject({
      correctOrder: ["2", "4", "3", "1"],
      starPosition: 3,
    });
  });

  it("15. GET /api/questions stays public and unchanged (read path untouched)", async () => {
    mockQueryQuestions.mockResolvedValue({ total: 1, questions: [{ id: "q1" }] } as never);
    const response = await GET(nextRequest("http://localhost/api/questions?level=N5"));
    expect(response.status).toBe(200);
    const json = await body(response);
    expect(json).toMatchObject({ success: true, total: 1 });
  });
});

/* ------------------------------------------------------------------ *
 * 5. Malformed input
 * ------------------------------------------------------------------ */

describe("POST /api/questions — malformed input is rejected before mutation", () => {
  const invalidBodies: Array<[string, unknown, string]> = [
    ["missing prompt", validDraft({ prompt: undefined }), "prompt"],
    ["empty prompt", validDraft({ prompt: "   " }), "prompt"],
    ["non-string prompt", validDraft({ prompt: 42 }), "prompt"],
    ["missing promptTranslation", validDraft({ promptTranslation: undefined }), "promptTranslation"],
    ["missing explanation", validDraft({ explanation: undefined }), "explanation"],
    ["options not an array", validDraft({ options: "1,2,3,4" }), "options"],
    ["single option", validDraft({ options: [{ id: "1", text: "a" }], correctAnswer: "1" }), "options"],
    [
      "option without text",
      validDraft({ options: [{ id: "1" }, { id: "2", text: "b" }], correctAnswer: "1" }),
      "options[0].text",
    ],
    [
      "duplicate option ids",
      validDraft({
        options: [
          { id: "1", text: "a" },
          { id: "1", text: "b" },
        ],
      }),
      "options[1].id",
    ],
    ["answer not among options", validDraft({ correctAnswer: "9" }), "correctAnswer"],
    ["missing correctAnswer", validDraft({ correctAnswer: undefined }), "correctAnswer"],
    ["unknown JLPT level", validDraft({ jlptLevel: "N9" }), "jlptLevel"],
    ["unknown section", validDraft({ section: "speaking" }), "section"],
    ["unknown category", validDraft({ category: "made_up" }), "category"],
    ["unknown question type", validDraft({ questionType: "essay" }), "questionType"],
    ["fractional difficulty", validDraft({ difficulty: 2.5 }), "difficulty"],
    ["out-of-range difficulty", validDraft({ difficulty: 9 }), "difficulty"],
    ["out-of-range mondaiNumber", validDraft({ mondaiNumber: 0 }), "mondaiNumber"],
    ["tags not an array", validDraft({ tags: "daily-life" }), "tags"],
    ["non-string tag", validDraft({ tags: ["ok", 7] }), "tags[1]"],
    ["id with spaces", validDraft({ id: "q 1; DROP TABLE questions" }), "id"],
    ["overlong id", validDraft({ id: "q".repeat(65) }), "id"],
    [
      "starOrderParts without starPosition",
      validDraft({
        questionType: "star_order",
        starOrderParts: {
          parts: [
            { id: "1", text: "a" },
            { id: "2", text: "b" },
          ],
          correctOrder: ["2", "1"],
        },
      }),
      "starOrderParts.starPosition",
    ],
    [
      "starOrderParts correctOrder referencing unknown part",
      validDraft({
        questionType: "star_order",
        correctAnswer: "1",
        starOrderParts: {
          parts: [
            { id: "1", text: "a" },
            { id: "2", text: "b" },
          ],
          correctOrder: ["2", "3"],
          starPosition: 1,
        },
      }),
      "starOrderParts.correctOrder[1]",
    ],
    [
      "explanationBreakdown with wrong shape",
      validDraft({ explanationBreakdown: { grammarPoints: "nope" } }),
      "explanationBreakdown.grammarPoints",
    ],
  ];

  it.each(invalidBodies)(
    "16. authorized caller with %s gets 400 and zero writes",
    async (_label, payload, field) => {
      actAs("editor");
      const response = await POST(post(payload));

      expect(response.status).toBe(400);
      const json = await body(response);
      expect(json.success).toBe(false);
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.field).toBe(field);
      expectSanitized(json);
      expect(store.writes).toHaveLength(0);
    }
  );

  it("17. non-JSON / non-object bodies are 400, not 500", async () => {
    actAs("editor");
    for (const payload of ["not-json", "[]", "null", "42", '"text"', ""]) {
      const response = await POST(post(payload, { raw: true }));
      expect(response.status).toBe(400);
      expect((await body(response)).code).toBe("VALIDATION_ERROR");
    }
    expect(store.writes).toHaveLength(0);
  });

  it("18. an oversized body is rejected before parsing or writing", async () => {
    actAs("editor");
    const response = await POST(
      post(validDraft({ passage: "あ".repeat(70_000) }))
    );
    expect(response.status).toBe(400);
    expect((await body(response)).field).toBe("body");
    expect(store.writes).toHaveLength(0);
  });

  it("19. an anonymous caller cannot use validation as an oracle", async () => {
    authenticateAs(null);
    // Malformed in every way, but still 401: authorization precedes parsing.
    for (const payload of ["not-json", "[]", JSON.stringify({})]) {
      const response = await POST(post(payload, { raw: true }));
      expect(response.status).toBe(401);
    }
    expect(store.writes).toHaveLength(0);
  });

  it("20. an unauthorized caller cannot use validation as an oracle either", async () => {
    actAs("learner");
    const response = await POST(post("not-json", { raw: true }));
    expect(response.status).toBe(403);
    expect(store.writes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 6. Authentication / authorization dependency failure
 * ------------------------------------------------------------------ */

describe("POST /api/questions — dependency failures fail closed", () => {
  it("21. an identity-provider exception degrades to 401", async () => {
    authenticateAs(null, { fail: true });
    const response = await POST(post(validDraft()));
    expect(response.status).toBe(401);
    expect((await body(response)).code).toBe("UNAUTHENTICATED");
    expect(store.writes).toHaveLength(0);
  });

  it("22. a user-store failure yields a sanitized 500 and zero writes", async () => {
    authenticateAs({ sub: "sub-editor-x" });
    users.failure = new Error(
      'relation "users" does not exist — connection postgres://u:p@host/db'
    );
    const response = await POST(post(validDraft()));

    expect(response.status).toBe(500);
    const json = await body(response);
    expect(json).toEqual({
      success: false,
      error: "Failed to create question.",
      code: "INTERNAL_ERROR",
    });
    expect(JSON.stringify(json)).not.toContain("relation");
    expect(JSON.stringify(json)).not.toContain("postgres://");
    expect(store.writes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 7. Database / service failure
 * ------------------------------------------------------------------ */

describe("POST /api/questions — store failures", () => {
  it("23. a generic database failure is a sanitized 500 with no writes recorded", async () => {
    actAs("editor");
    store.failure = new Error(
      'insert into "questions" ("id", ...) values ($1, ...) — password authentication failed for user "app"'
    );
    const response = await POST(post(validDraft()));

    expect(response.status).toBe(500);
    const json = await body(response);
    expect(json.code).toBe("INTERNAL_ERROR");
    expect(json.error).toBe("Failed to create question.");
    const text = JSON.stringify(json);
    expect(text).not.toContain("insert into");
    expect(text).not.toContain("password");
    expect(store.writes).toHaveLength(0);
  });

  it("24. a duplicate id is a sanitized 409, not a leaked constraint error", async () => {
    actAs("editor");
    store.failure = Object.assign(new Error('duplicate key value violates unique constraint "questions_pkey"'), {
      code: "23505",
    });
    const response = await POST(post(validDraft({ id: "n5-vocab-1" })));

    expect(response.status).toBe(409);
    const json = await body(response);
    expect(json).toMatchObject({
      success: false,
      code: "QUESTION_ID_CONFLICT",
      error: "A question with this id already exists.",
      field: "id",
    });
    expect(JSON.stringify(json)).not.toContain("questions_pkey");
    expect(store.writes).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 8. Aggregate zero-write proof
 * ------------------------------------------------------------------ */

describe("POST /api/questions — every rejection produces zero writes", () => {
  it("25. the full rejection matrix leaves the store untouched", async () => {
    const attempts: Array<() => Promise<Response>> = [
      () => {
        authenticateAs(null);
        return POST(post(validDraft()));
      },
      () => {
        actAs("learner");
        return POST(post(validDraft()));
      },
      () => {
        actAs("reviewer");
        return POST(post(validDraft()));
      },
      () => {
        actAs("editor");
        return POST(post(validDraft({ prompt: "" })));
      },
      () => {
        actAs("editor");
        return POST(post("{bad json", { raw: true }));
      },
      () => {
        authenticateAs(null);
        return POST(post(validDraft(), { headers: { "x-role": "admin" } }));
      },
      () => {
        actAs("editor");
        store.failure = new Error("boom");
        return POST(post(validDraft()));
      },
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBeGreaterThanOrEqual(400);
    }

    expect(store.writes).toHaveLength(0);
  });

  it("26. enforcement lives in the service and the route cannot bypass it", () => {
    const strip = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

    const route = strip(readFileSync("src/app/api/questions/route.ts", "utf8"));
    const service = strip(
      readFileSync("src/services/jlpt/questionAuthoring.ts", "utf8")
    );

    // The route holds no database access at all: no second write path.
    expect(route).not.toMatch(/@\/db|questionsTable|\.insert\(/);
    expect(route).toMatch(/createQuestion\(/);

    // The service authorizes first, then parses, then writes — in order.
    const authorizeAt = service.indexOf('await requirePermission("cms.create")');
    const parseAt = service.indexOf("JSON.parse(rawBody)");
    const writeAt = service.indexOf("currentStore().insertQuestion(");
    expect(authorizeAt).toBeGreaterThan(-1);
    expect(parseAt).toBeGreaterThan(authorizeAt);
    expect(writeAt).toBeGreaterThan(parseAt);

    // No transport or payload channel can decide identity.
    expect(service).not.toMatch(
      /request\.|\.headers|searchParams|cookies\(|x-user-id|x-role|x-admin-key|\.userId|\.authorId|\.role\b/
    );
  });

  it("27. the pure validator never trusts identity-shaped fields", () => {
    const row = parseCreateQuestionDraft(
      validDraft({
        userId: "user-admin-1",
        role: "admin",
        authorId: "user-admin-1",
        isActive: false,
      })
    );
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("role");
    expect(row).not.toHaveProperty("authorId");
    expect(row).not.toHaveProperty("isActive");
  });
});

/* ------------------------------------------------------------------ *
 * 9. Disposable PGlite integration (real SQL, emulated engine)
 * ------------------------------------------------------------------ */

const MIGRATION = readFileSync(
  "drizzle/0000_absurd_emma_frost.sql",
  "utf8"
);

/** Extract the real `CREATE TABLE` statement for a table from the migration. */
function tableDdl(table: string): string {
  const start = MIGRATION.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table} in the migration`);
  const end = MIGRATION.indexOf(");", start);
  if (end === -1) throw new Error(`unterminated DDL for ${table}`);
  return MIGRATION.slice(start, end + 2);
}

describe("POST /api/questions — disposable PGlite integration (real SQL)", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(tableDdl("questions"));
    await client.exec(tableDdl("jlpt_test_questions"));
    // The production adapter, over a real (in-memory, disposable) database.
    setQuestionStore(
      createDrizzleQuestionStore(drizzle(client) as unknown as typeof db)
    );
  });

  afterEach(async () => {
    await client.close();
  });

  async function questionCount(): Promise<number> {
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM questions"
    );
    return result.rows[0]!.count;
  }

  async function linkCount(): Promise<number> {
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM jlpt_test_questions"
    );
    return result.rows[0]!.count;
  }

  it("28. rejected requests write zero rows; an authorized one writes exactly one", async () => {
    expect(await questionCount()).toBe(0);

    // Anonymous.
    authenticateAs(null);
    expect((await POST(post(validDraft()))).status).toBe(401);
    expect(await questionCount()).toBe(0);

    // Authenticated, unauthorized.
    actAs("learner");
    expect((await POST(post(validDraft()))).status).toBe(403);
    expect(await questionCount()).toBe(0);

    // Authorized, malformed.
    actAs("editor", "user-editor-1");
    expect((await POST(post(validDraft({ prompt: "" })))).status).toBe(400);
    expect(await questionCount()).toBe(0);

    // Authorized, valid.
    const created = await POST(post(validDraft({ id: "n5-vocab-700" })));
    expect(created.status).toBe(200);
    expect(await questionCount()).toBe(1);

    const rows = await client.query<{
      id: string;
      jlpt_level: string;
      is_active: boolean;
      correct_answer: string;
      options: unknown;
      tags: unknown;
      created_at: Date;
    }>(
      "SELECT id, jlpt_level, is_active, correct_answer, options, tags, created_at FROM questions"
    );
    const row = rows.rows[0]!;
    expect(row.id).toBe("n5-vocab-700");
    expect(row.jlpt_level).toBe("N5");
    // isActive is server-authoritative even though the client sent false.
    expect(row.is_active).toBe(true);
    expect(row.correct_answer).toBe("1");
    expect(row.options).toEqual([
      { id: "1", text: "まいにち" },
      { id: "2", text: "まいあさ" },
      { id: "3", text: "まいばん" },
      { id: "4", text: "まいしゅう" },
    ]);
    expect(row.tags).toEqual(["daily-life"]);

    // No indirect writes anywhere: question creation never links tests.
    expect(await linkCount()).toBe(0);

    // A duplicate id is rejected and does not create a second row.
    const duplicate = await POST(post(validDraft({ id: "n5-vocab-700" })));
    expect(duplicate.status).toBe(409);
    expect((await body(duplicate)).code).toBe("QUESTION_ID_CONFLICT");
    expect(await questionCount()).toBe(1);
    expect(await linkCount()).toBe(0);
  });

  it("29. a hostile payload cannot smuggle isActive=false or forged identity into the row", async () => {
    actAs("admin", "user-admin-1");
    const response = await POST(
      post(
        validDraft({
          id: "n5-vocab-701",
          isActive: false,
          userId: "user-victim",
          role: "learner",
          createdAt: "1999-01-01T00:00:00.000Z",
        })
      )
    );
    expect(response.status).toBe(200);

    const rows = await client.query<{ is_active: boolean; created_at: Date; id: string }>(
      "SELECT id, is_active, created_at FROM questions"
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.is_active).toBe(true);
    // The database default wins over the client's timestamp.
    expect(new Date(rows.rows[0]!.created_at).getUTCFullYear()).toBeGreaterThan(1999);
  });
});

/* ------------------------------------------------------------------ *
 * 10. Real PostgreSQL (runs only when DATABASE_URL points at a database)
 * ------------------------------------------------------------------ *
 *
 * This layer is skipped with an explicit reason when no database is
 * reachable — it never fabricates a pass. In CI the disposable
 * `postgres:18-alpine` service provides DATABASE_URL, so the production
 * Drizzle adapter is exercised against a real PostgreSQL server.
 *
 * Safety: rows are confined to the `q-s04-` id prefix and deleted again in
 * afterEach. Nothing outside the disposable CI database is touched.
 */
const REAL_DATABASE_URL = process.env.DATABASE_URL ?? "";

/**
 * The skip below is for developer machines only. In CI the service container
 * always provides DATABASE_URL, so a silently skipped layer there would be
 * vacuous evidence — this guard turns that into a visible failure.
 */
describe("POST /api/questions — real PostgreSQL availability", () => {
  it("30. CI runs this layer rather than skipping it", () => {
    if (process.env.CI === "true") {
      expect(REAL_DATABASE_URL.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(REAL_DATABASE_URL.length === 0)(
  "POST /api/questions — real PostgreSQL integration",
  () => {
    const ID_PREFIX = "q-s04-";

    async function prefixedRows() {
      return db
        .select({ id: questionsTable.id, isActive: questionsTable.isActive })
        .from(questionsTable)
        .where(like(questionsTable.id, `${ID_PREFIX}%`));
    }

    beforeEach(() => {
      // The production adapter, over the real database.
      setQuestionStore(createDrizzleQuestionStore(db));
    });

    afterEach(async () => {
      await db.delete(questionsTable).where(like(questionsTable.id, `${ID_PREFIX}%`));
    });

    it("31. rejected requests write zero rows; an authorized one writes exactly one", async () => {
      expect(await prefixedRows()).toHaveLength(0);

      authenticateAs(null);
      expect((await POST(post(validDraft({ id: `${ID_PREFIX}anon` })))).status).toBe(401);
      expect(await prefixedRows()).toHaveLength(0);

      actAs("learner");
      expect((await POST(post(validDraft({ id: `${ID_PREFIX}learner` })))).status).toBe(403);
      expect(await prefixedRows()).toHaveLength(0);

      actAs("editor", "user-editor-1");
      expect((await POST(post(validDraft({ id: `${ID_PREFIX}bad`, prompt: "" })))).status).toBe(400);
      expect(await prefixedRows()).toHaveLength(0);

      const created = await POST(
        post(
          validDraft({
            id: `${ID_PREFIX}ok`,
            // Hostile field: must not survive into the row.
            isActive: false,
            role: "admin",
          })
        )
      );
      expect(created.status).toBe(200);
      const rows = await prefixedRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: `${ID_PREFIX}ok`, isActive: true });

      // Duplicate id: sanitized 409, still exactly one row.
      const duplicate = await POST(post(validDraft({ id: `${ID_PREFIX}ok` })));
      expect(duplicate.status).toBe(409);
      expect(await prefixedRows()).toHaveLength(1);
    });
  }
);
