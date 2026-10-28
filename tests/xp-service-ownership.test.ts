/**
 * Phase 26F-E3 — XP and analytics service-boundary ownership.
 *
 * THE DEFECTS UNDER TEST (re-verified in source at c9216e1):
 *
 *   xpService.award          `const userId = payload.userId || "anonymous-user"`
 *   xpService.getTotalXp     `userId = "anonymous-user"`
 *   xpService.getLevel       `userId = "anonymous-user"`
 *   xpService.getSummary     `userId = "anonymous-user"`
 *   xpService.getLedger      `params.userId || "anonymous-user"`
 *   xpService.awardDailyStreak `userId = "anonymous-user"`
 *   xpService.findEventOwner   `userId?: string` — omitting it scanned EVERY learner
 *   xpService.revokeByDedupeKey `userId?: string` — omitting it revoked the key
 *                               across every learner holding it
 *   analyticsService.trackStudyEvent    `params.userId || "anonymous-user"`
 *   analyticsService.getUserProgressSummary `userId = "anonymous-user"`
 *   dailyQueueService.getSettings       `userId = "anonymous-user"`
 *
 * A default or `||` fallback is an identity-selection mechanism: a missing,
 * empty or sentinel id silently became the shared legacy account, and an
 * optional narrowing argument turned a forgot-to-pass-it mistake into a
 * cross-learner scan.
 *
 * THE CONTRACT NOW: every owner-scoped method validates with `requireOwner`
 * before its first query, rejects missing/blank/sentinel ids, and scopes the
 * statement to that owner. Idempotency and per-user dedupe are unchanged.
 *
 * Layering:
 *   - REAL: the service methods, `requireOwner`, PGlite with the production DDL
 *     from `drizzle/0000_absurd_emma_frost.sql` plus the Phase 26A per-user
 *     dedupe migration, so the predicates execute as real SQL.
 *   - `getTotalXp("")` is asserted with NO database installed: the only way to
 *     get `MissingOwnerError` instead of a TypeError is for the guard to run
 *     before the first query.
 *   - PGlite does not model concurrency; nothing here claims it does.
 */
import { readFileSync, readdirSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { current: null as unknown } }));

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

import { XpService } from "@/services/gamification/xpService";
import { AnalyticsService } from "@/services/analytics/analyticsService";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import {
  MISSING_OWNER_CODE,
  MissingOwnerError,
  SHARED_SENTINEL,
  requireOwner,
} from "@/lib/auth/serviceIdentity";

const ALICE = "xp-learner-alice";
const BOB = "xp-learner-bob";

/* ================================================================== *
 * 0. Identity is refused before any database access
 * ================================================================== */

describe("Phase 26F-E3: a missing owner is rejected before the first query", () => {
  beforeEach(() => {
    /* Deliberately install NO database. If any guard ran after a query, these
     * calls would raise a TypeError from touching `null` instead. */
    dbHolder.current = null;
  });

  it("1. every owner-scoped read rejects a blank actor before querying", async () => {
    for (const blank of ["", "   ", undefined, null, 42]) {
      await expect(
        XpService.getTotalXp(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        XpService.getLevel(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        XpService.getSummary(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        XpService.getLedger({ userId: blank as unknown as string })
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        XpService.awardDailyStreak(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        AnalyticsService.getUserProgressSummary(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);

      await expect(
        DailyQueueService.getSettings(blank as unknown as string)
      ).rejects.toBeInstanceOf(MissingOwnerError);
    }
  });

  it("2. the shared sentinel is rejected as an identity, not accepted as one", async () => {
    for (const sentinel of [SHARED_SENTINEL, ` ${SHARED_SENTINEL} `]) {
      await expect(XpService.getTotalXp(sentinel)).rejects.toBeInstanceOf(
        MissingOwnerError
      );
      await expect(
        XpService.award({
          payload: {
            eventType: "content.read",
            userId: sentinel,
            sourceType: "vocabulary",
            sourceId: "x",
          },
        })
      ).rejects.toBeInstanceOf(MissingOwnerError);
    }
  });

  it("3. an award with no usable owner writes nothing and is not fatal for callers", async () => {
    /* `awardSafe` is the fire-and-forget path: it must swallow the rejection and
     * report "no award", never write against a guessed identity. */
    await expect(
      XpService.awardSafe({
        payload: {
          eventType: "content.read",
          userId: SHARED_SENTINEL,
          sourceType: "vocabulary",
          sourceId: "x",
        },
      })
    ).resolves.toBeNull();
  });

  it("4. requireOwner returns an accepted id unchanged (no trimming into a match)", () => {
    expect(requireOwner(ALICE, "test")).toBe(ALICE);
    // A padded id is NOT normalised into the real one.
    expect(requireOwner(` ${ALICE} `, "test")).toBe(` ${ALICE} `);
    expect(requireOwner(` ${ALICE} `, "test")).not.toBe(ALICE);
  });

  it("5. the rejection carries no SQL, table name or caller value", async () => {
    const error: unknown = await XpService.getTotalXp("").then(
      () => null,
      (rejection: unknown) => rejection
    );
    expect(error).toBeInstanceOf(MissingOwnerError);
    const missing = error as MissingOwnerError;
    const text = `${missing.message} ${JSON.stringify(Object.entries(missing))}`.toLowerCase();
    for (const leak of ["select", "xp_events", "postgres", "drizzle", "$1", "anonymous"]) {
      expect(text).not.toContain(leak);
    }
    expect((error as MissingOwnerError).code).toBe(MISSING_OWNER_CODE);
  });
});

/* ================================================================== *
 * Real SQL
 * ================================================================== */

const MIGRATION = readFileSync("drizzle/0000_absurd_emma_frost.sql", "utf8");

function tableDdl(table: string): string {
  const start = MIGRATION.indexOf(`CREATE TABLE "${table}" (`);
  if (start === -1) throw new Error(`no DDL for ${table}`);
  const end = MIGRATION.indexOf(");", start);
  return MIGRATION.slice(start, end + 2);
}

const TABLES = [
  "xp_rules",
  "xp_events",
  "srs_user_settings",
  "srs_reviews",
  "user_analytics",
  "questions",
  "jlpt_tests",
  "jlpt_test_questions",
  "test_sessions",
  "test_answers",
];

function perUserDedupeMigration(): string | null {
  const file = readdirSync("drizzle").filter((n) => /^0004_.*\.sql$/.test(n)).sort()[0];
  return file ? readFileSync(`drizzle/${file}`, "utf8") : null;
}

describe("Phase 26F-E3: real SQL — XP and analytics rows belong to one learner", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    for (const table of TABLES) await client.exec(tableDdl(table));
    const migration = perUserDedupeMigration();
    if (migration) {
      for (const statement of migration.split("--> statement-breakpoint")) {
        const sql = statement.trim();
        if (sql) await client.exec(sql);
      }
    }
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
  }, 120_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      `DELETE FROM "xp_events"; DELETE FROM "srs_reviews"; DELETE FROM "user_analytics";
       DELETE FROM "test_answers"; DELETE FROM "test_sessions"; DELETE FROM "srs_user_settings";`
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Award one event and return the result. */
  function award(userId: string, sourceId: string, dedupeKey?: string) {
    return XpService.award({
      payload: {
        eventType: "content.read",
        userId,
        sourceType: "vocabulary",
        sourceId,
      },
      dedupeKey: dedupeKey ?? `content.read:${sourceId}`,
    });
  }

  async function rows(): Promise<Array<{ user_id: string; dedupe_key: string | null; revoked_at: Date | null }>> {
    const result = await client.query<{ user_id: string; dedupe_key: string | null; revoked_at: Date | null }>(
      `SELECT user_id, dedupe_key, revoked_at FROM "xp_events" ORDER BY user_id, dedupe_key`
    );
    return result.rows;
  }

  /* ---------------- reads ---------------- */

  it("6. XP reads return only the caller's own ledger", async () => {
    await award(ALICE, "a1");
    await award(BOB, "b1");
    await award(BOB, "b2");

    expect(await XpService.getTotalXp(ALICE)).toBeGreaterThan(0);
    const aliceTotal = await XpService.getTotalXp(ALICE);
    const bobTotal = await XpService.getTotalXp(BOB);
    expect(bobTotal).toBeGreaterThan(aliceTotal);

    const aliceSummary = await XpService.getSummary(ALICE);
    expect(aliceSummary.userId).toBe(ALICE);
    expect(aliceSummary.totalXp).toBe(aliceTotal);

    const aliceLedger = await XpService.getLedger({ userId: ALICE });
    expect(aliceLedger.entries.length).toBeGreaterThan(0);
    expect(aliceLedger.total).toBe(aliceLedger.entries.length);

    // Bob's ids never appear in Alice's view.
    const aliceIds = aliceLedger.entries.map((e) => e.sourceId);
    expect(aliceIds).not.toContain("b1");
    expect(aliceIds).not.toContain("b2");
  });

  it("7. an empty ledger is the honest answer for an owner with no events", async () => {
    await award(BOB, "b1");
    expect(await XpService.getTotalXp(ALICE)).toBe(0);
    expect((await XpService.getLedger({ userId: ALICE })).total).toBe(0);
  });

  /* ---------------- awards ---------------- */

  it("8. an award lands on the owner it names, and nobody else", async () => {
    const result = await award(ALICE, "a1");
    expect(result.awarded).toBe(true);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.user_id).toBe(ALICE);
    expect(await XpService.getTotalXp(BOB)).toBe(0);
  });

  it("9. replaying the same key for the same owner stays idempotent", async () => {
    const first = await award(ALICE, "a1", "content.read:a1");
    const second = await award(ALICE, "a1", "content.read:a1");

    expect(first.awarded).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.awarded).toBe(false);

    const all = await rows();
    expect(all).toHaveLength(1);

    // The total is not double-counted.
    expect(await XpService.getTotalXp(ALICE)).toBe(first.points);
  });

  it("10. the same key for two learners stays two independent events", async () => {
    const a = await award(ALICE, "shared", "content.read:shared");
    const b = await award(BOB, "shared", "content.read:shared");

    expect(a.awarded).toBe(true);
    expect(b.awarded).toBe(true);
    expect(b.duplicate).toBe(false);

    const all = await rows();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.user_id))).toEqual(new Set([ALICE, BOB]));
  });

  /* ---------------- revocation ---------------- */

  it("11. revocation is scoped: revoking your key leaves the other learner's intact", async () => {
    await award(ALICE, "shared", "content.read:shared");
    await award(BOB, "shared", "content.read:shared");

    const revoked = await XpService.revokeByDedupeKey({
      dedupeKey: "content.read:shared",
      ownerUserId: ALICE,
    });
    expect(revoked.revoked).toBe(true);
    expect(revoked.points).toBeGreaterThan(0);

    const all = await rows();
    const aliceRow = all.find((r) => r.user_id === ALICE);
    const bobRow = all.find((r) => r.user_id === BOB);
    expect(aliceRow?.revoked_at).not.toBeNull();
    expect(bobRow?.revoked_at).toBeNull();

    // Bob still holds his points; Alice's are gone.
    expect(await XpService.getTotalXp(BOB)).toBeGreaterThan(0);
    expect(await XpService.getTotalXp(ALICE)).toBe(0);
  });

  it("12. a revoke with no owner is rejected and changes no row", async () => {
    await award(ALICE, "a1", "content.read:a1");
    const before = await rows();

    await expect(
      XpService.revokeByDedupeKey({ dedupeKey: "content.read:a1", ownerUserId: "" })
    ).rejects.toBeInstanceOf(MissingOwnerError);
    await expect(
      XpService.revokeByDedupeKey({
        dedupeKey: "content.read:a1",
        ownerUserId: SHARED_SENTINEL,
      })
    ).rejects.toBeInstanceOf(MissingOwnerError);

    expect(await rows()).toEqual(before);
  });

  it("13. the scoped ownership probe never reveals another learner's id", async () => {
    await award(BOB, "b1", "content.read:b1");

    // Alice does not own this key: the scoped probe says so without naming Bob.
    expect(await XpService.findEventOwner("content.read:b1", ALICE)).toBeNull();
    // Bob owns it.
    expect(await XpService.findEventOwner("content.read:b1", BOB)).toBe(BOB);
    // The existence probe is a separate, explicitly-named method.
    expect(await XpService.findEventOwnerUnscoped("content.read:b1")).toBe(BOB);
    expect(await XpService.findEventOwnerUnscoped("content.read:nobody")).toBeNull();
  });

  it("14. the ownership probe rejects a blank actor", async () => {
    await expect(XpService.findEventOwner("any-key", "")).rejects.toBeInstanceOf(
      MissingOwnerError
    );
  });

  /* ---------------- daily streak ---------------- */

  it("15. the daily streak is awarded to the verified owner only", async () => {
    // A review today gives the learner a streak of 1.
    await client.query(
      `INSERT INTO "srs_reviews"
         (id, card_id, deck_id, user_id, rating, due_at, scheduler_key, scheduler_version, reviewed_at)
       VALUES ('rev-alice-today','card-a','deck-a',$1,'good', now(),'sm2','1.0.0', now())`,
      [ALICE]
    );

    const result = await XpService.awardDailyStreak(ALICE);
    expect(result?.awarded).toBe(true);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.user_id).toBe(ALICE);
    expect(all[0]?.dedupe_key).toContain(`streak:${ALICE}:`);

    // Bob has no review, so no streak and no event.
    expect(await XpService.awardDailyStreak(BOB)).toBeNull();
    expect(await rows()).toHaveLength(1);
  });

  /* ---------------- analytics ---------------- */

  it("16. a study event is recorded against the actor, never the sentinel", async () => {
    await AnalyticsService.trackStudyEvent({
      userId: ALICE,
      itemType: "vocabulary",
      itemId: "de-mizu",
    });

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.user_id).toBe(ALICE);
    // The dedupe key also names the actor, so two learners cannot collide.
    expect(all[0]?.dedupe_key).toContain(ALICE);

    // Replay is still idempotent.
    const replay = await AnalyticsService.trackStudyEvent({
      userId: ALICE,
      itemType: "vocabulary",
      itemId: "de-mizu",
    });
    expect(replay.awarded).toBe(false);
    expect(await rows()).toHaveLength(1);
  });

  it("17. the progress summary aggregates only the actor's own data", async () => {
    await AnalyticsService.trackStudyEvent({
      userId: ALICE,
      itemType: "kanji",
      itemId: "k-1",
    });
    await AnalyticsService.trackStudyEvent({
      userId: BOB,
      itemType: "kanji",
      itemId: "k-b1",
    });
    await client.query(
      `INSERT INTO "test_sessions"
         (id, user_id, quiz_type, jlpt_level, status, is_timed,
          time_limit_seconds, time_remaining_seconds, started_at)
       VALUES ('s-bob-only', $1, 'custom_quiz', 'N5', 'completed', false, 60, 60, now())`,
      [BOB]
    );

    const summary = await AnalyticsService.getUserProgressSummary(ALICE);
    expect(summary.userId).toBe(ALICE);
    // Bob's session is not counted in Alice's attempts.
    expect(summary.studyMetrics.quizAttempts).toBe(0);
    // Alice's own kanji study is counted.
    expect(summary.studyMetrics.kanjiStudied).toBe(1);

    const text = JSON.stringify(summary);
    expect(text).not.toContain(BOB);
    expect(text).not.toContain("s-bob-only");
  });

  /* ---------------- legacy data ---------------- */

  it("18. legacy sentinel rows are readable as data but never as an identity", async () => {
    // A pre-existing row under the shared sentinel (as the old fallback wrote).
    await client.query(
      `INSERT INTO "xp_events"
         (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
       VALUES ('xp-legacy-1', $1, 'content.read', 'content.read', '1.0.0', 5, 'vocabulary', 'legacy:1')`,
      [SHARED_SENTINEL]
    );

    // No caller can act as that account…
    await expect(XpService.getTotalXp(SHARED_SENTINEL)).rejects.toBeInstanceOf(
      MissingOwnerError
    );
    await expect(
      XpService.revokeByDedupeKey({ dedupeKey: "legacy:1", ownerUserId: SHARED_SENTINEL })
    ).rejects.toBeInstanceOf(MissingOwnerError);

    // …and the legacy row is untouched: not deleted, not reassigned, not revoked.
    const result = await client.query<{ user_id: string; revoked_at: Date | null }>(
      `SELECT user_id, revoked_at FROM "xp_events" WHERE id = 'xp-legacy-1'`
    );
    expect(result.rows[0]?.user_id).toBe(SHARED_SENTINEL);
    expect(result.rows[0]?.revoked_at).toBeNull();
  });

  it("19. a sentinel award through the fire-and-forget path writes NO row", async () => {
    /* Stronger than the no-database assertion in test 3: here a real ledger is
     * installed, so the only reason no row appears is that the sentinel was
     * refused as an identity. Under the old `|| "anonymous-user"` fallback this
     * call wrote a row owned by the shared account. */
    const result = await XpService.awardSafe({
      payload: {
        eventType: "content.read",
        userId: SHARED_SENTINEL,
        sourceType: "vocabulary",
        sourceId: "sentinel-attempt",
      },
      dedupeKey: "content.read:sentinel-attempt",
    });

    expect(result).toBeNull();
    expect(await rows()).toHaveLength(0);
  });

  it("19b. a real learner's totals never include the sentinel's legacy points", async () => {
    await client.query(
      `INSERT INTO "xp_events"
         (id, user_id, event_type, rule_key, rule_version, points, source_type, dedupe_key)
       VALUES ('xp-legacy-2', $1, 'content.read', 'content.read', '1.0.0', 500, 'vocabulary', 'legacy:2')`,
      [SHARED_SENTINEL]
    );
    await award(ALICE, "a1");

    const aliceTotal = await XpService.getTotalXp(ALICE);
    expect(aliceTotal).toBeGreaterThan(0);
    expect(aliceTotal).toBeLessThan(500);
  });

  /* ---------------- settings ---------------- */

  it("20. day-window settings are read for the actor, not a shared account", async () => {
    await client.query(
      `INSERT INTO "srs_user_settings" (user_id, timezone, day_cutoff_hour)
       VALUES ($1, 'Asia/Tokyo', 4)`,
      [ALICE]
    );

    const aliceSettings = await DailyQueueService.getSettings(ALICE);
    expect(aliceSettings.timezone).toBe("Asia/Tokyo");
    expect(aliceSettings.dayCutoffHour).toBe(4);

    // An owner with no stored settings gets the documented defaults, not Alice's.
    const bobSettings = await DailyQueueService.getSettings(BOB);
    expect(bobSettings.timezone).not.toBe("Asia/Tokyo");
  });
});
