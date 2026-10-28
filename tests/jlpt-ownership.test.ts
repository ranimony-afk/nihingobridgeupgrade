/**
 * Phase 26F-E2 — JLPT/quiz learner-data ownership.
 *
 * THE DEFECTS UNDER TEST (each re-verified in the live source before this file
 * was written, at commit 35470e9):
 *
 *   GET  /api/jlpt/progress          `searchParams.get("userId") || "anonymous-user"`
 *   GET  /api/quiz/analytics         `searchParams.get("userId") || "anonymous-user"`
 *                                    used as the ONLY predicate on two reads
 *   POST /api/jlpt/session/start     `body.userId` → `params.userId || "anonymous-user"`
 *   GET  /api/jlpt/session/[id]      `getSessionState(id)` — primary key only
 *   POST /api/jlpt/session/[id]/answer  `saveAnswer(id, …)` — no session lookup at all
 *   POST /api/jlpt/session/[id]/submit  `submitSession(id)` — PK only, then grades,
 *                                    updates user_analytics and awards XP
 *   GET  /api/jlpt/session/[id]/results `getSessionState(id)` — PK only
 *
 * No handler authenticated. No service carried an ownership predicate. Session
 * ids are generated (`session-<timestamp>-<6 base36 chars>`), so "knowing the
 * id" was the whole of the authorization.
 *
 * THE CONTRACT NOW:
 *   anonymous                         → 401, service never reached
 *   authenticated, foreign id claim   → 403, service never reached
 *   authenticated, malformed claim    → 400
 *   authenticated, own/absent claim   → served, scoped to the actor's id
 *   foreign or unknown session id     → identical 404 (no existence oracle)
 *   legacy NULL-owner session         → served to nobody, row never rewritten
 *
 * Layering, stated honestly:
 *   - REAL: the seven route handlers, the whole `@/lib/auth` pipeline
 *     (`getClaims` → `resolveApplicationUser` → `CmsActor` → `requireActor`),
 *     and the real `TestService` session methods.
 *   - ENGINE: PGlite with the production DDL from
 *     `drizzle/0000_absurd_emma_frost.sql` — real SQL and real constraints on
 *     an EMULATED PostgreSQL, so ownership predicates are proven by executing
 *     them, not by reading them. PGlite does not model concurrency; nothing
 *     here claims it does.
 *   - `XpService` awarding is spied in the service tests: the assertion is that
 *     a foreign submit awards *nothing*, which a spy proves exactly and which
 *     keeps the XP rule mirror out of this fixture.
 *   - No production database, credentials or user data are used.
 */
import { readFileSync } from "node:fs";

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

import { GET as progressGET } from "@/app/api/jlpt/progress/route";
import { GET as analyticsGET } from "@/app/api/quiz/analytics/route";
import { POST as startPOST } from "@/app/api/jlpt/session/start/route";
import { GET as sessionGET } from "@/app/api/jlpt/session/[id]/route";
import { POST as answerPOST } from "@/app/api/jlpt/session/[id]/answer/route";
import { POST as submitPOST } from "@/app/api/jlpt/session/[id]/submit/route";
import { GET as resultsGET } from "@/app/api/jlpt/session/[id]/results/route";
import type { ApplicationUserRecord, ApplicationUserStore, CmsRole } from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import { TestService } from "@/services/jlpt/testService";
import { JLPTKnowledgeService } from "@/services/jlpt/knowledge";
import { XpService } from "@/services/gamification/xpService";

/* ------------------------------------------------------------------ *
 * Auth doubles (the Phase 25 seams)
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

function actAs(role: CmsRole, id: string) {
  const subject = `sub-${id}`;
  users.seed("supabase", subject, { id, name: role, role });
  authenticateAs({ sub: subject, email: `${id}@example.com` });
  return id;
}

const ANONYMOUS = () => authenticateAs(null);

/* ------------------------------------------------------------------ *
 * Request builders
 * ------------------------------------------------------------------ */

const ORIGIN = "http://phase26fe2.invalid";

function getRequest(path: string): NextRequest {
  const url = new URL(path, ORIGIN);
  return Object.assign(new Request(url, { method: "GET" }), {
    nextUrl: url,
  }) as unknown as NextRequest;
}

function postRequest(path: string, body?: unknown): NextRequest {
  const url = new URL(path, ORIGIN);
  return Object.assign(new Request(url, { method: "POST" }), {
    nextUrl: url,
    json: async () => {
      if (body === undefined) throw new Error("no body");
      return body;
    },
  }) as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

const ALICE = "learner-alice";
const BOB = "learner-bob";

/* ================================================================== *
 * PART 1 — route layer: identity decisions happen before any service
 * ================================================================== */

describe("Phase 26F-E2: route layer refuses before reaching a service", () => {
  let progressSpy: ReturnType<typeof vi.spyOn>;
  let startSpy: ReturnType<typeof vi.spyOn>;
  let stateSpy: ReturnType<typeof vi.spyOn>;
  let saveSpy: ReturnType<typeof vi.spyOn>;
  let submitSpy: ReturnType<typeof vi.spyOn>;
  let seedSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetActorResolver();
    resetSupabaseClientFactory();
    resetApplicationUserStore();
    users = new FakeUserStore();
    setApplicationUserStore(users);

    /* No database is installed for the route layer: if a handler reached the
     * db layer despite an authorization failure, it would throw a TypeError
     * instead of quietly reading. */
    dbHolder.current = null;

    progressSpy = vi.spyOn(JLPTKnowledgeService, "getUserProgress");
    startSpy = vi.spyOn(TestService, "startSession");
    stateSpy = vi.spyOn(TestService, "getSessionState");
    saveSpy = vi.spyOn(TestService, "saveAnswer");
    submitSpy = vi.spyOn(TestService, "submitSession");
    seedSpy = vi.spyOn(TestService, "ensureSeeded").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetActorResolver();
    resetSupabaseClientFactory();
    resetApplicationUserStore();
  });

  const ALL_ROUTES: Array<{ name: string; call: () => Promise<Response> }> = [
    {
      name: "GET /api/jlpt/progress",
      call: () => progressGET(getRequest("/api/jlpt/progress")),
    },
    {
      name: "GET /api/quiz/analytics",
      call: () => analyticsGET(getRequest("/api/quiz/analytics")),
    },
    {
      name: "POST /api/jlpt/session/start",
      call: () => startPOST(postRequest("/api/jlpt/session/start", {})),
    },
    {
      name: "GET /api/jlpt/session/[id]",
      call: () => sessionGET(getRequest("/api/jlpt/session/s-1"), ctx("s-1")),
    },
    {
      name: "POST /api/jlpt/session/[id]/answer",
      call: () =>
        answerPOST(
          postRequest("/api/jlpt/session/s-1/answer", { questionId: "q-1" }),
          ctx("s-1")
        ),
    },
    {
      name: "POST /api/jlpt/session/[id]/submit",
      call: () => submitPOST(postRequest("/api/jlpt/session/s-1/submit", {}), ctx("s-1")),
    },
    {
      name: "GET /api/jlpt/session/[id]/results",
      call: () => resultsGET(getRequest("/api/jlpt/session/s-1/results"), ctx("s-1")),
    },
  ];

  it("1. anonymous callers are refused with 401 on every route, and no service runs", async () => {
    ANONYMOUS();

    for (const route of ALL_ROUTES) {
      const response = await route.call();
      expect(response.status, route.name).toBe(401);
      expect(response.headers.get("cache-control"), route.name).toContain("no-store");

      const body = await json(response);
      expect(body.success, route.name).toBe(false);
      expect(body.code, route.name).toBe("UNAUTHENTICATED");
      // No internals, no ids.
      const text = JSON.stringify(body).toLowerCase();
      for (const leak of ["select ", "postgres", "drizzle", "stack", "at object."]) {
        expect(text, route.name).not.toContain(leak);
      }
    }

    expect(progressSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(stateSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(seedSpy).not.toHaveBeenCalled();
    // Nothing was even allowed to touch the database boundary.
    expect(dbHolder.current).toBeNull();
  });

  it("2. a foreign ?userId= is 403 and the service is never reached", async () => {
    actAs("learner", ALICE);

    const response = await progressGET(
      getRequest(`/api/jlpt/progress?userId=${BOB}`)
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await json(response);
    expect(body.code).toBe("FORBIDDEN");
    // The foreign id is not echoed back.
    expect(JSON.stringify(body)).not.toContain(BOB);
    expect(progressSpy).not.toHaveBeenCalled();
  });

  it("3. a repeated or blank ?userId= is 400 — a shape error, not an authz denial", async () => {
    actAs("learner", ALICE);

    const repeated = await progressGET(
      getRequest(`/api/jlpt/progress?userId=${ALICE}&userId=${BOB}`)
    );
    expect(repeated.status).toBe(400);

    const blank = await progressGET(getRequest("/api/jlpt/progress?userId=%20"));
    expect(blank.status).toBe(400);

    expect(progressSpy).not.toHaveBeenCalled();
  });

  it("4. the actor's own id (or none at all) reads only the actor's progress", async () => {
    actAs("learner", ALICE);
    progressSpy.mockResolvedValue({ userId: ALICE } as never);

    const implicit = await progressGET(getRequest("/api/jlpt/progress?level=N5"));
    expect(implicit.status).toBe(200);
    expect(progressSpy).toHaveBeenLastCalledWith(ALICE, "N5");

    const explicit = await progressGET(
      getRequest(`/api/jlpt/progress?userId=${ALICE}`)
    );
    expect(explicit.status).toBe(200);
    expect(progressSpy).toHaveBeenLastCalledWith(ALICE, "N5");

    expect((await json(explicit)).success).toBe(true);
    expect(explicit.headers.get("cache-control")).toContain("no-store");
  });

  it("5. session/start refuses a foreign body userId before any insert", async () => {
    actAs("learner", ALICE);

    const response = await startPOST(
      postRequest("/api/jlpt/session/start", {
        userId: BOB,
        quizType: "custom_quiz",
        jlptLevel: "N5",
      })
    );

    expect(response.status).toBe(403);
    expect(JSON.stringify(await json(response))).not.toContain(BOB);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("6. session/start still accepts an absent claim, and starts the session for the ACTOR", async () => {
    actAs("learner", ALICE);
    startSpy.mockResolvedValue({ sessionId: "s-new", timeLimitSeconds: 60, questions: [] } as never);

    const response = await startPOST(
      postRequest("/api/jlpt/session/start", {
        quizType: "custom_quiz",
        jlptLevel: "N5",
      })
    );

    expect(response.status).toBe(200);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect((startSpy.mock.calls[0] as any[])[0].userId).toBe(ALICE);
  });

  it("7. session/start rejects a malformed JSON body with 400 and no service call", async () => {
    actAs("learner", ALICE);

    const url = new URL("/api/jlpt/session/start", ORIGIN);
    const request = Object.assign(
      new Request(url, {
        method: "POST",
        body: "{not json",
        headers: { "Content-Type": "application/json" },
      }),
      { nextUrl: url }
    ) as unknown as NextRequest;

    const response = await startPOST(request);
    expect(response.status).toBe(400);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("8. every session-id route hands the service the VERIFIED actor id, never a request value", async () => {
    actAs("learner", ALICE);

    stateSpy.mockResolvedValue(null);
    saveSpy.mockResolvedValue(false);
    submitSpy.mockResolvedValue(null);

    // A hostile query string on a session route must not influence ownership.
    const read = await sessionGET(
      getRequest(`/api/jlpt/session/s-1?userId=${BOB}`),
      ctx("s-1")
    );
    expect(read.status).toBe(404);
    expect(stateSpy).toHaveBeenLastCalledWith("s-1", ALICE);

    const answer = await answerPOST(
      postRequest("/api/jlpt/session/s-1/answer", { questionId: "q-1", userId: BOB }),
      ctx("s-1")
    );
    expect(answer.status).toBe(404);
    expect((saveSpy.mock.calls[0] as any[])[0]).toBe("s-1");
    expect((saveSpy.mock.calls[0] as any[])[1]).toBe(ALICE);

    const submit = await submitPOST(
      postRequest("/api/jlpt/session/s-1/submit", { userId: BOB }),
      ctx("s-1")
    );
    expect(submit.status).toBe(404);
    expect((submitSpy.mock.calls[0] as any[])[0]).toBe("s-1");
    expect((submitSpy.mock.calls[0] as any[])[1]).toBe(ALICE);
  });

  it("9. a foreign session id and an unknown one produce the SAME response (no existence oracle)", async () => {
    actAs("learner", ALICE);
    stateSpy.mockResolvedValue(null);

    const foreign = await sessionGET(getRequest("/api/jlpt/session/foreign"), ctx("foreign"));
    const missing = await sessionGET(getRequest("/api/jlpt/session/missing"), ctx("missing"));

    expect(foreign.status).toBe(missing.status);
    const a = await json(foreign);
    const b = await json(missing);
    expect(a).toEqual(b);
    expect(a.code).toBe("NOT_FOUND");
  });

  it("10. a service failure is sanitized: fixed message, no driver detail, no-store", async () => {
    actAs("learner", ALICE);
    stateSpy.mockRejectedValue(
      new Error('select * from "test_sessions" where id = $1 — password=postgres')
    );

    const response = await sessionGET(getRequest("/api/jlpt/session/s-1"), ctx("s-1"));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const text = JSON.stringify(await json(response)).toLowerCase();
    for (const leak of ["select ", "postgres", "password", "test_sessions", "$1"]) {
      expect(text).not.toContain(leak);
    }
  });
});

/* ================================================================== *
 * PART 2 — service layer: ownership is in the SQL, on real rows
 * ================================================================== */

const MIGRATION = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

function tableDdl(table: string): string {
  const start = MIGRATION.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table}`);
  const end = MIGRATION.indexOf(");", start);
  return MIGRATION.slice(start, end + 2);
}

const OWNERSHIP_TABLES = [
  "questions",
  "jlpt_tests",
  // The link table `ensureSeeded` populates after inserting the test suites;
  // without it the (caught) seed failure short-circuits the published tests.
  "jlpt_test_questions",
  "test_sessions",
  "test_answers",
  "user_analytics",
];

describe("Phase 26F-E2: real SQL — a session belongs to exactly one learner", () => {
  let client: PGlite;
  let awardSpy: ReturnType<typeof vi.spyOn>;
  let streakSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    client = new PGlite();
    for (const table of OWNERSHIP_TABLES) await client.exec(tableDdl(table));
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
    // Seed the shared question bank once (real service behaviour).
    await TestService.ensureSeeded();
  }, 120_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    /* Re-establish the auth seams: the previous describe resets them after each
     * test, and `actAs` below must be able to verify a real actor. */
    resetActorResolver();
    resetSupabaseClientFactory();
    resetApplicationUserStore();
    users = new FakeUserStore();
    setApplicationUserStore(users);

    await client.exec(
      `DELETE FROM "test_answers"; DELETE FROM "test_sessions"; DELETE FROM "user_analytics";`
    );
    awardSpy = vi.spyOn(XpService, "awardSafe").mockResolvedValue(null);
    streakSpy = vi.spyOn(XpService, "awardDailyStreak").mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetActorResolver();
    resetSupabaseClientFactory();
    resetApplicationUserStore();
  });

  async function scalar(sql: string): Promise<number> {
    const result = await client.query<{ c: number }>(sql);
    return Number(result.rows[0]?.c ?? 0);
  }

  async function newSession(owner: string): Promise<string> {
    const session = await TestService.startSession({
      userId: owner,
      quizType: "custom_quiz",
      jlptLevel: "N5",
      isTimed: false,
      questionLimit: 3,
    });
    return session.sessionId;
  }

  async function sessionRow(id: string): Promise<Record<string, any> | null> {
    const result = await client.query<Record<string, any>>(
      `SELECT * FROM "test_sessions" WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  it("11. startSession writes the session under the owner it was given", async () => {
    const id = await newSession(ALICE);
    const row = await sessionRow(id);
    expect(row?.user_id).toBe(ALICE);
  });

  it("12. startSession refuses an empty owner instead of defaulting to the sentinel", async () => {
    await expect(
      TestService.startSession({
        userId: "   ",
        quizType: "custom_quiz",
        jlptLevel: "N5",
      })
    ).rejects.toThrow(/requires an owned userId/);

    expect(await scalar(`SELECT count(*)::int AS c FROM "test_sessions"`)).toBe(0);
  });

  it("13. getSessionState serves the owner and returns null for everyone else", async () => {
    const id = await newSession(ALICE);

    const mine = await TestService.getSessionState(id, ALICE);
    expect(mine).not.toBeNull();
    expect(mine?.session.id).toBe(id);
    expect(mine?.questions.length).toBeGreaterThan(0);

    // Cross-owner, empty actor, and a non-existent id all resolve identically.
    expect(await TestService.getSessionState(id, BOB)).toBeNull();
    expect(await TestService.getSessionState(id, "")).toBeNull();
    expect(await TestService.getSessionState("session-does-not-exist", ALICE)).toBeNull();
  });

  it("14. saveAnswer refuses a foreign session and writes NO row", async () => {
    const id = await newSession(ALICE);
    const questionId = (await TestService.getSessionState(id, ALICE))!.questions[0]!.id;

    const before = await scalar(`SELECT count(*)::int AS c FROM "test_answers"`);

    const refused = await TestService.saveAnswer(id, BOB, {
      questionId,
      selectedAnswer: "attacker-chosen",
      timeSpentSeconds: 1,
    });

    expect(refused).toBe(false);
    expect(await scalar(`SELECT count(*)::int AS c FROM "test_answers"`)).toBe(before);
    expect(
      await scalar(`SELECT count(*)::int AS c FROM "test_answers" WHERE selected_answer = 'attacker-chosen'`)
    ).toBe(0);
  });

  it("15. saveAnswer accepts the owner's own answer", async () => {
    const id = await newSession(ALICE);
    const questionId = (await TestService.getSessionState(id, ALICE))!.questions[0]!.id;

    const saved = await TestService.saveAnswer(id, ALICE, {
      questionId,
      selectedAnswer: "own-answer",
      timeSpentSeconds: 1,
    });

    expect(saved).toBe(true);
    expect(await scalar(`SELECT count(*)::int AS c FROM "test_answers"`)).toBe(1);
  });

  it("16. submitSession on a foreign session mutates NOTHING and awards NO XP", async () => {
    const id = await newSession(ALICE);
    const before = await sessionRow(id);
    expect(before?.status).toBe("in_progress");

    const refused = await TestService.submitSession(id, BOB, []);

    expect(refused).toBeNull();

    const after = await sessionRow(id);
    // The victim's session is byte-for-byte unchanged.
    expect(after).toEqual(before);
    expect(after?.status).toBe("in_progress");
    expect(after?.score).toBeNull();
    expect(after?.completed_at).toBeNull();

    // No analytics for anybody, and no XP — not for bob, not for alice.
    expect(await scalar(`SELECT count(*)::int AS c FROM "user_analytics"`)).toBe(0);
    expect(awardSpy).not.toHaveBeenCalled();
    expect(streakSpy).not.toHaveBeenCalled();
  });

  it("17. submitSession on the owner's own session grades it and awards XP to the OWNER", async () => {
    const id = await newSession(ALICE);
    const state = await TestService.getSessionState(id, ALICE);
    const answers = (state?.questions ?? []).map((q: any, i: number) => ({
      questionId: q.id,
      selectedAnswer: i === 0 ? q.correctAnswer : "wrong",
      timeSpentSeconds: 5,
    }));

    const result = await TestService.submitSession(id, ALICE, answers);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe(id);

    const row = await sessionRow(id);
    expect(row?.status).toBe("completed");
    expect(row?.score).toBe(result?.score);

    // Analytics written for the owner only.
    const analytics = await client.query<{ user_id: string }>(
      `SELECT user_id FROM "user_analytics"`
    );
    expect(analytics.rows.map((r) => r.user_id)).toEqual([ALICE]);

    // XP awarded to the owner, never to the sentinel and never to a caller id.
    expect(awardSpy).toHaveBeenCalled();
    const awardedTo = awardSpy.mock.calls.map((c: any[]) => c[0]?.payload?.userId);
    expect(new Set(awardedTo)).toEqual(new Set([ALICE]));
    expect(awardedTo).not.toContain("anonymous-user");
    expect(streakSpy).toHaveBeenCalledWith(ALICE);
  });

  it("18. a legacy NULL-owner session is served to nobody and is never rewritten", async () => {
    await client.query(
      `INSERT INTO "test_sessions"
         (id, user_id, quiz_type, jlpt_level, status, is_timed,
          time_limit_seconds, time_remaining_seconds)
       VALUES ('session-legacy-null', NULL, 'custom_quiz', 'N5', 'completed', false, 60, 60)`
    );

    expect(await TestService.getSessionState("session-legacy-null", ALICE)).toBeNull();
    expect(await TestService.getSessionState("session-legacy-null", BOB)).toBeNull();
    expect(await TestService.getSessionState("session-legacy-null", "")).toBeNull();

    expect(
      await TestService.saveAnswer("session-legacy-null", ALICE, {
        questionId: "q-1",
        selectedAnswer: "x",
        timeSpentSeconds: 1,
      })
    ).toBe(false);

    expect(await TestService.submitSession("session-legacy-null", ALICE, [])).toBeNull();

    // Untouched: not reassigned to the caller, not defaulted to the sentinel,
    // not deleted. Legacy ownership is an owner decision, not a code default.
    const row = await sessionRow("session-legacy-null");
    expect(row?.user_id).toBeNull();
    expect(row?.status).toBe("completed");
    expect(await scalar(`SELECT count(*)::int AS c FROM "test_answers"`)).toBe(0);
  });

  it("19. getUserProgress refuses an empty owner instead of reading the sentinel's records", async () => {
    await expect(JLPTKnowledgeService.getUserProgress("")).rejects.toThrow(
      /requires an owned userId/
    );
    await expect(JLPTKnowledgeService.getUserProgress("   ")).rejects.toThrow(
      /requires an owned userId/
    );
  });

  it("20. quiz analytics is scoped to the verified actor's own rows (real SQL)", async () => {
    // Two learners with analytics and completed sessions.
    await client.query(
      `INSERT INTO "user_analytics" (id, user_id, jlpt_level, tests_completed)
       VALUES ('an-alice', $1, 'N5', 4), ('an-bob', $2, 'N5', 9)`,
      [ALICE, BOB]
    );
    await client.query(
      `INSERT INTO "test_sessions"
         (id, user_id, quiz_type, jlpt_level, status, is_timed,
          time_limit_seconds, time_remaining_seconds, started_at)
       VALUES ('s-alice', $1, 'custom_quiz', 'N5', 'completed', false, 60, 60, now()),
              ('s-bob',   $2, 'custom_quiz', 'N5', 'completed', false, 60, 60, now())`,
      [ALICE, BOB]
    );

    actAs("learner", ALICE);

    const own = await analyticsGET(getRequest("/api/quiz/analytics"));
    expect(own.status).toBe(200);
    const body = await json(own);
    expect(body.analytics.userId).toBe(ALICE);
    expect(body.analytics.testsCompleted).toBe(4);
    expect(body.recentSessions.map((s: any) => s.id)).toEqual(["s-alice"]);

    // The victim's rows are neither returned nor even referenced.
    const text = JSON.stringify(body);
    expect(text).not.toContain(BOB);
    expect(text).not.toContain("s-bob");

    // And a foreign claim is refused outright.
    const foreign = await analyticsGET(getRequest(`/api/quiz/analytics?userId=${BOB}`));
    expect(foreign.status).toBe(403);
  });
});
