/**
 * Phase 26F-E1 — emergency SRS containment.
 *
 * These tests prove that every route which can read or mutate learner-owned SRS
 * data refuses to execute its service layer, and that the refusal is uniform,
 * non-disclosing, non-cacheable and impossible to bypass with an attacker-
 * controlled identifier.
 *
 * Why the services are mocked rather than pointed at a database:
 * the property under test is "the service is never reached". A spy can prove
 * that exactly; a real database could only prove "nothing changed", which is
 * weaker (an unrelated early return would also pass). `@/db` is replaced with a
 * proxy that throws on any property access, so an accidental database touch
 * fails loudly instead of passing silently.
 *
 * Scope note: containment is NOT authorization. These tests assert
 * unreachability. They do not assert ownership, and no test here should be read
 * as evidence that the SRS ownership defect is fixed.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/* ------------------------------------------------------------------ *
 * Spies for every service the contained routes could reach.
 * Declared via vi.hoisted so the vi.mock factories can see them.
 * ------------------------------------------------------------------ */

const spies = vi.hoisted(() => {
  const spy = () => vi.fn();
  return {
    srs: {
      queryCards: spy(),
      createCard: spy(),
      gradeCard: spy(),
      getDueQueue: spy(),
      getStats: spy(),
      listDecks: spy(),
      createDeck: spy(),
      updateDeck: spy(),
      previewDeckScheduler: spy(),
      ensureSeeded: spy(),
      // The one method the approved-public schedulers route calls.
      listAvailableSchedulers: vi.fn(() => []),
    },
    session: {
      listSessions: spy(),
      getResumableSession: spy(),
      getDailyNewUsed: spy(),
      planSession: spy(),
      getSessionState: spy(),
      completeSession: spy(),
      abandonSession: spy(),
      answer: spy(),
      undo: spy(),
      getSummary: spy(),
      getSessionRow: spy(),
      getSessionReviews: spy(),
    },
    sync: {
      getStatus: spy(),
      registerDevice: spy(),
      revokeDevice: spy(),
      pull: spy(),
      snapshot: spy(),
      push: spy(),
    },
    daily: {
      getDailyQueue: spy(),
      getSettings: spy(),
      updateSettings: spy(),
    },
    personalization: {
      getPersonalizedView: spy(),
      updatePrefs: spy(),
      buildPlan: spy(),
      buildProfile: spy(),
      getPrefs: spy(),
    },
    knowledge: {
      addKanaToSrs: spy(),
      addKanjiToSrs: spy(),
      // Approved-public GET: global content counts only.
      getKnowledgeStats: vi.fn(async () => ({
        kanaEntries: 1,
        kanjiEntries: 2,
        elements: 3,
        compositionEdges: 4,
        byJlptLevel: [],
        sourceRef: "test",
      })),
    },
    xp: {
      awardSafe: spy(),
      awardDailyStreak: spy(),
      getTotalXp: spy(),
      revokeByDedupeKey: spy(),
    },
  };
});

/* ------------------------------------------------------------------ *
 * Module substitution. Nothing here reaches a database.
 * ------------------------------------------------------------------ */

vi.mock("@/db", () => {
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `CONTAINMENT VIOLATION: database accessed (property "${String(property)}")`
        );
      },
    }
  );
  return { db, pool: db };
});

vi.mock("@/services/srs/srsService", () => ({ SrsService: spies.srs }));
vi.mock("@/services/srs/sessionService", () => ({
  SessionService: spies.session,
  DEFAULT_SESSION_CONFIG: {},
}));
vi.mock("@/services/srs/syncService", () => ({ SyncService: spies.sync }));
vi.mock("@/services/srs/dailyQueueService", () => ({
  DailyQueueService: spies.daily,
  resolveDayWindow: () => ({}),
  DEFAULT_DAILY_SETTINGS: {},
}));
vi.mock("@/services/srs/personalizationService", () => ({
  PersonalizationService: spies.personalization,
}));
vi.mock("@/services/knowledge/knowledgeService", () => ({
  KnowledgeService: spies.knowledge,
}));
vi.mock("@/services/gamification/xpService", () => ({ XpService: spies.xp }));

/* `@/services/srs/scheduler` is deliberately NOT mocked: `preview` and
 * `schedulers` are the approved-public endpoints, and they must be exercised
 * against the real pure registry / pure calculation. */

/* ------------------------------------------------------------------ *
 * Route handlers
 * ------------------------------------------------------------------ */

import { GET as knowledgeGET, POST as knowledgePOST, PATCH as knowledgePATCH } from "@/app/api/knowledge/srs/route";
import { GET as cardsGET, POST as cardsPOST } from "@/app/api/srs/cards/route";
import { GET as dailyGET } from "@/app/api/srs/daily/route";
import { GET as deckOneGET, PATCH as deckOnePATCH } from "@/app/api/srs/decks/[id]/route";
import { GET as decksGET, POST as decksPOST } from "@/app/api/srs/decks/route";
import { GET as lifecycleGET, POST as lifecyclePOST } from "@/app/api/srs/personal/lifecycle/route";
import { GET as personalGET, PUT as personalPUT, POST as personalPOST } from "@/app/api/srs/personal/route";
import { POST as previewPOST } from "@/app/api/srs/preview/route";
import { GET as queueGET } from "@/app/api/srs/queue/route";
import { POST as reviewPOST } from "@/app/api/srs/review/route";
import { GET as schedulersGET } from "@/app/api/srs/schedulers/route";
import { POST as answerPOST } from "@/app/api/srs/sessions/[id]/answer/route";
import { GET as sessionGET, PATCH as sessionPATCH } from "@/app/api/srs/sessions/[id]/route";
import { GET as summaryGET } from "@/app/api/srs/sessions/[id]/summary/route";
import { POST as undoPOST } from "@/app/api/srs/sessions/[id]/undo/route";
import { GET as sessionsGET, POST as sessionsPOST } from "@/app/api/srs/sessions/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/srs/settings/route";
import { GET as statsGET } from "@/app/api/srs/stats/route";
import { GET as pullGET } from "@/app/api/srs/sync/pull/route";
import { POST as pushPOST } from "@/app/api/srs/sync/push/route";
import { DELETE as syncDELETE, GET as syncGET, POST as syncPOST } from "@/app/api/srs/sync/route";

/* ------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------ */

function nextRequest(url: string, init?: { method?: string; body?: unknown }): NextRequest {
  const request = new Request(url, {
    method: init?.method ?? "GET",
    ...(init?.body === undefined
      ? {}
      : {
          body: JSON.stringify(init.body),
          headers: { "Content-Type": "application/json" },
        }),
  });
  return Object.assign(request, { nextUrl: new URL(url) }) as unknown as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const base = "http://localhost";

/* Attacker-controlled identifiers. None of these may influence the response. */
const VICTIM = "victim-alice";
const VICTIM_CARD = "card-victim-alice-1";
const VICTIM_SESSION = "rsess-victim-alice-1";
const VICTIM_DEVICE = "dev-victim-alice-1";

type Case = { name: string; call: () => Promise<Response> };

/** Every sensitive handler, called the way an attacker would call it. */
const SENSITIVE_CASES: Case[] = [
  // knowledge → SRS additions (creates cards, awards XP)
  {
    name: "POST /api/knowledge/srs",
    call: () =>
      knowledgePOST(
        nextRequest(`${base}/api/knowledge/srs`, {
          method: "POST",
          body: { target: "kana", kanaId: "hira-a", userId: VICTIM },
        })
      ),
  },
  // knowledge → deck rebind (unscoped UPDATE)
  {
    name: "PATCH /api/knowledge/srs",
    call: () =>
      knowledgePATCH(
        nextRequest(`${base}/api/knowledge/srs`, {
          method: "PATCH",
          body: { deckId: "deck-victim", schedulerKey: "sm2" },
        })
      ),
  },
  // cards
  {
    name: "GET /api/srs/cards",
    call: () => cardsGET(nextRequest(`${base}/api/srs/cards?userId=${VICTIM}`)),
  },
  {
    name: "POST /api/srs/cards",
    call: () =>
      cardsPOST(
        nextRequest(`${base}/api/srs/cards`, {
          method: "POST",
          body: { deckId: "deck-victim", front: "x", back: "y" },
        })
      ),
  },
  // queue / daily / stats / settings
  {
    name: "GET /api/srs/queue",
    call: () => queueGET(nextRequest(`${base}/api/srs/queue?userId=${VICTIM}`)),
  },
  {
    name: "GET /api/srs/daily",
    call: () => dailyGET(nextRequest(`${base}/api/srs/daily?userId=${VICTIM}`)),
  },
  {
    name: "GET /api/srs/stats",
    call: () => statsGET(nextRequest(`${base}/api/srs/stats?userId=${VICTIM}`)),
  },
  {
    name: "GET /api/srs/settings",
    call: () => settingsGET(nextRequest(`${base}/api/srs/settings?userId=${VICTIM}`)),
  },
  {
    name: "PUT /api/srs/settings",
    call: () =>
      settingsPUT(
        nextRequest(`${base}/api/srs/settings`, {
          method: "PUT",
          body: { userId: VICTIM, dailyNewTarget: 9999 },
        })
      ),
  },
  // decks
  {
    name: "GET /api/srs/decks",
    call: () => decksGET(nextRequest(`${base}/api/srs/decks?userId=${VICTIM}`)),
  },
  {
    name: "POST /api/srs/decks",
    call: () =>
      decksPOST(
        nextRequest(`${base}/api/srs/decks`, {
          method: "POST",
          body: { name: "injected", userId: VICTIM },
        })
      ),
  },
  {
    name: "GET /api/srs/decks/[id]",
    call: () => deckOneGET(nextRequest(`${base}/api/srs/decks/deck-victim`), ctx("deck-victim")),
  },
  {
    name: "PATCH /api/srs/decks/[id]",
    call: () =>
      deckOnePATCH(
        nextRequest(`${base}/api/srs/decks/deck-victim`, {
          method: "PATCH",
          body: { schedulerKey: "fsrs-lite" },
        }),
        ctx("deck-victim")
      ),
  },
  // grading
  {
    name: "POST /api/srs/review",
    call: () =>
      reviewPOST(
        nextRequest(`${base}/api/srs/review`, {
          method: "POST",
          body: { cardId: VICTIM_CARD, rating: "again", userId: VICTIM },
        })
      ),
  },
  // sessions
  {
    name: "GET /api/srs/sessions",
    call: () => sessionsGET(nextRequest(`${base}/api/srs/sessions?userId=${VICTIM}`)),
  },
  {
    name: "POST /api/srs/sessions",
    call: () =>
      sessionsPOST(
        nextRequest(`${base}/api/srs/sessions`, {
          method: "POST",
          body: { userId: VICTIM },
        })
      ),
  },
  {
    name: "GET /api/srs/sessions/[id]",
    call: () => sessionGET(nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}`), ctx(VICTIM_SESSION)),
  },
  {
    name: "PATCH /api/srs/sessions/[id]",
    call: () =>
      sessionPATCH(
        nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}`, {
          method: "PATCH",
          body: { action: "abandon" },
        }),
        ctx(VICTIM_SESSION)
      ),
  },
  {
    name: "POST /api/srs/sessions/[id]/answer",
    call: () =>
      answerPOST(
        nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}/answer`, {
          method: "POST",
          body: { cardId: VICTIM_CARD, rating: "good" },
        }),
        ctx(VICTIM_SESSION)
      ),
  },
  {
    name: "POST /api/srs/sessions/[id]/undo",
    call: () => undoPOST(nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}/undo`, { method: "POST" }), ctx(VICTIM_SESSION)),
  },
  {
    name: "GET /api/srs/sessions/[id]/summary",
    call: () => summaryGET(nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}/summary`), ctx(VICTIM_SESSION)),
  },
  // sync
  {
    name: "GET /api/srs/sync",
    call: () => syncGET(nextRequest(`${base}/api/srs/sync?userId=${VICTIM}`)),
  },
  {
    name: "POST /api/srs/sync",
    call: () =>
      syncPOST(
        nextRequest(`${base}/api/srs/sync`, {
          method: "POST",
          body: { deviceId: VICTIM_DEVICE, userId: VICTIM },
        })
      ),
  },
  {
    name: "DELETE /api/srs/sync",
    call: () => syncDELETE(nextRequest(`${base}/api/srs/sync?deviceId=${VICTIM_DEVICE}&userId=${VICTIM}`, { method: "DELETE" })),
  },
  {
    name: "GET /api/srs/sync/pull",
    call: () => pullGET(nextRequest(`${base}/api/srs/sync/pull?deviceId=${VICTIM_DEVICE}&userId=${VICTIM}`)),
  },
  {
    name: "POST /api/srs/sync/push",
    call: () =>
      pushPOST(
        nextRequest(`${base}/api/srs/sync/push`, {
          method: "POST",
          body: {
            deviceId: VICTIM_DEVICE,
            events: [{ clientId: "c1", cardId: VICTIM_CARD, rating: "easy" }],
          },
        })
      ),
  },
  // personalization
  {
    name: "GET /api/srs/personal",
    call: () => personalGET(nextRequest(`${base}/api/srs/personal?userId=${VICTIM}`)),
  },
  {
    name: "PUT /api/srs/personal",
    call: () =>
      personalPUT(
        nextRequest(`${base}/api/srs/personal`, {
          method: "PUT",
          body: { userId: VICTIM, weaknessWeight: 1 },
        })
      ),
  },
  {
    name: "POST /api/srs/personal",
    call: () =>
      personalPOST(
        nextRequest(`${base}/api/srs/personal`, {
          method: "POST",
          body: { userId: VICTIM },
        })
      ),
  },
  {
    name: "GET /api/srs/personal/lifecycle",
    call: () => lifecycleGET(nextRequest(`${base}/api/srs/personal/lifecycle?cardId=${VICTIM_CARD}`)),
  },
  {
    name: "POST /api/srs/personal/lifecycle",
    call: () =>
      lifecyclePOST(
        nextRequest(`${base}/api/srs/personal/lifecycle`, {
          method: "POST",
          body: { userId: VICTIM, rating: "good" },
        })
      ),
  },
];

/* ------------------------------------------------------------------ *
 * 1–3, 9. Uniform containment, no bypass, no disclosure, no caching
 * ------------------------------------------------------------------ */

describe("Phase 26F-E1: containment covers every sensitive handler", () => {
  it("1. every sensitive endpoint and method returns 503 with the stable code", async () => {
    expect(SENSITIVE_CASES).toHaveLength(31);

    for (const testCase of SENSITIVE_CASES) {
      const response = await testCase.call();
      expect(response.status, `${testCase.name} status`).toBe(503);

      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success, `${testCase.name} success`).toBe(false);
      expect(body.code, `${testCase.name} code`).toBe("SRS_CONTAINMENT_ACTIVE");
      expect(typeof body.error, `${testCase.name} error`).toBe("string");
    }
  });

  it("2. no sensitive service is invoked for any contained handler", async () => {
    for (const testCase of SENSITIVE_CASES) await testCase.call();

    const sensitive = {
      srs: ["queryCards", "createCard", "gradeCard", "getDueQueue", "getStats", "listDecks", "createDeck", "updateDeck", "previewDeckScheduler"],
      session: ["listSessions", "getResumableSession", "getDailyNewUsed", "planSession", "getSessionState", "completeSession", "abandonSession", "answer", "undo", "getSummary", "getSessionRow", "getSessionReviews"],
      sync: ["getStatus", "registerDevice", "revokeDevice", "pull", "snapshot", "push"],
      daily: ["getDailyQueue", "getSettings", "updateSettings"],
      personalization: ["getPersonalizedView", "updatePrefs", "buildPlan", "buildProfile", "getPrefs"],
      knowledge: ["addKanaToSrs", "addKanjiToSrs"],
      xp: ["awardSafe", "awardDailyStreak", "getTotalXp", "revokeByDedupeKey"],
    } as const;

    for (const [group, methods] of Object.entries(sensitive)) {
      for (const method of methods) {
        const fn = (spies as Record<string, Record<string, { mock: { calls: unknown[] } }>>)[group][method];
        expect(fn.mock.calls, `${group}.${method} must not be called`).toHaveLength(0);
      }
    }
  });

  it("3. attacker-controlled identifiers cannot bypass containment", async () => {
    // A hostile value in every identity-bearing position the routes accept.
    const hostileIds = [VICTIM, "anonymous-user", "admin", "", "   ", "'; DROP TABLE srs_cards; --"];

    for (const id of hostileIds) {
      const probes = [
        cardsGET(nextRequest(`${base}/api/srs/cards?userId=${encodeURIComponent(id)}`)),
        reviewPOST(
          nextRequest(`${base}/api/srs/review`, {
            method: "POST",
            body: { cardId: id, rating: "good", userId: id },
          })
        ),
        sessionGET(nextRequest(`${base}/api/srs/sessions/${encodeURIComponent(id)}`), ctx(id)),
        undoPOST(nextRequest(`${base}/api/srs/sessions/${encodeURIComponent(id)}/undo`, { method: "POST" }), ctx(id)),
        pullGET(nextRequest(`${base}/api/srs/sync/pull?deviceId=${encodeURIComponent(id)}&userId=${encodeURIComponent(id)}`)),
      ];

      for (const response of await Promise.all(probes)) {
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).toContain("SRS_CONTAINMENT_ACTIVE");
        // The probe value must never be echoed back.
        if (id.trim().length > 2 && id !== "anonymous-user") {
          expect(text).not.toContain(id);
        }
      }
    }
  });

  it("4. grading, undo and sync cannot reach scheduling, reviews or XP through routes", async () => {
    await reviewPOST(
      nextRequest(`${base}/api/srs/review`, {
        method: "POST",
        body: { cardId: VICTIM_CARD, rating: "again", userId: VICTIM },
      })
    );
    await undoPOST(nextRequest(`${base}/api/srs/sessions/${VICTIM_SESSION}/undo`, { method: "POST" }), ctx(VICTIM_SESSION));
    await pushPOST(
      nextRequest(`${base}/api/srs/sync/push`, {
        method: "POST",
        body: { deviceId: VICTIM_DEVICE, events: [{ clientId: "c1", cardId: VICTIM_CARD, rating: "easy" }] },
      })
    );

    expect(spies.srs.gradeCard).not.toHaveBeenCalled();
    expect(spies.session.answer).not.toHaveBeenCalled();
    expect(spies.session.undo).not.toHaveBeenCalled();
    expect(spies.sync.push).not.toHaveBeenCalled();
    expect(spies.sync.pull).not.toHaveBeenCalled();
    expect(spies.sync.snapshot).not.toHaveBeenCalled();
    expect(spies.xp.awardSafe).not.toHaveBeenCalled();
    expect(spies.xp.awardDailyStreak).not.toHaveBeenCalled();
    expect(spies.xp.revokeByDedupeKey).not.toHaveBeenCalled();
  });

  it("5. kana/kanji additions cannot reach the shared card-id handoff", async () => {
    await knowledgePOST(
      nextRequest(`${base}/api/knowledge/srs`, {
        method: "POST",
        body: { target: "kana", kanaId: "hira-a", userId: VICTIM },
      })
    );
    await knowledgePOST(
      nextRequest(`${base}/api/knowledge/srs`, {
        method: "POST",
        body: { target: "kanji", character: "日", userId: VICTIM },
      })
    );

    expect(spies.knowledge.addKanaToSrs).not.toHaveBeenCalled();
    expect(spies.knowledge.addKanjiToSrs).not.toHaveBeenCalled();
    expect(spies.xp.awardSafe).not.toHaveBeenCalled();
  });

  it("9. responses disclose nothing internal and are not cacheable", async () => {
    const response = await cardsGET(nextRequest(`${base}/api/srs/cards?userId=${VICTIM}`));

    expect(response.headers.get("cache-control")).toBe("no-store");

    const text = await response.text();
    const body = JSON.parse(text) as Record<string, unknown>;

    // Exact envelope: no extra fields can smuggle detail.
    expect(Object.keys(body).sort()).toEqual(["code", "error", "success"]);
    expect(body.error).toBe(
      "SRS learner-data operations are temporarily unavailable while a cross-learner ownership defect is being remediated."
    );

    for (const leak of [
      "CONTAINMENT VIOLATION",
      "at ", // stack frame
      "SELECT ",
      "postgres",
      "srs_cards",
      "stack",
      VICTIM,
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("10. the containment decision has no configuration switch", () => {
    const source = readFileSync("src/app/api/_shared/srsContainment.ts", "utf8");
    // No env var, header, cookie or query parameter may influence it.
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/headers\.get|searchParams|cookies\(/);
  });
});

/* ------------------------------------------------------------------ *
 * 8. Approved-public endpoints keep working
 * ------------------------------------------------------------------ */

describe("Phase 26F-E1: approved-public endpoints remain available", () => {
  it("8a. GET /api/srs/schedulers still serves the registry", async () => {
    const response = await schedulersGET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body).toHaveProperty("schedulers");
  });

  it("8b. POST /api/srs/preview still computes against the real pure scheduler", async () => {
    const response = await previewPOST(
      nextRequest(`${base}/api/srs/preview`, {
        method: "POST",
        body: { schedulerKey: "sm2", rating: "good" },
      })
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; preview?: unknown };
    expect(body.success).toBe(true);
    // Real calculation ran: the pure scheduler produced an outcome object.
    expect(body.preview).toBeTruthy();
  });

  it("8c. GET /api/knowledge/srs still serves global content counts", async () => {
    const response = await knowledgeGET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it("8d. public endpoints touch no learner service and no database", () => {
    for (const method of ["queryCards", "createCard", "gradeCard", "getDueQueue", "getStats", "listDecks"]) {
      expect((spies.srs as unknown as Record<string, { mock: { calls: unknown[] } }>)[method].mock.calls).toHaveLength(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Static coverage audit — catches a newly added, uncontained route
 * ------------------------------------------------------------------ */

const APPROVED_PUBLIC: Record<string, string[]> = {
  "src/app/api/srs/schedulers/route.ts": ["GET"],
  "src/app/api/srs/preview/route.ts": ["POST"],
  "src/app/api/knowledge/srs/route.ts": ["GET"],
};

function routeFiles(): string[] {
  const roots = ["src/app/api/srs", "src/app/api/knowledge"];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "route.ts") found.push(full);
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

describe("Phase 26F-E1: static route coverage audit", () => {
  it("every handler is either contained or explicitly approved as public", () => {
    const offenders: string[] = [];
    let containedHandlers = 0;

    for (const file of routeFiles()) {
      const source = readFileSync(file, "utf8");
      const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g)];

      for (let i = 0; i < handlers.length; i += 1) {
        const name = handlers[i][1];
        const start = handlers[i].index ?? 0;
        const end = i + 1 < handlers.length ? (handlers[i + 1].index ?? source.length) : source.length;
        const body = source.slice(start, end);
        const isContained = body.includes("srsContainmentActive()");
        const approved = (APPROVED_PUBLIC[file] ?? []).includes(name);

        if (isContained) containedHandlers += 1;
        if (!isContained && !approved) offenders.push(`${file} ${name}`);
        if (isContained && approved) offenders.push(`${file} ${name} (contained but approved public)`);
      }
    }

    expect(offenders, offenders.join(", ")).toEqual([]);
    expect(containedHandlers).toBe(31);
  });
});
