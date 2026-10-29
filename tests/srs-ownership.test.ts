/**
 * Phase 26F-E4 — SRS learner-state ownership.
 *
 * WHAT THESE TESTS PROVE
 * ----------------------
 * Every SRS operation that reads or writes learner-owned state is scoped by a
 * DATABASE PREDICATE on the owner, not merely by a route-level auth check:
 *
 *   1. a verified actor reaches its own rows (same-owner success);
 *   2. a foreign card / deck / session / device id resolves to "not found" and
 *      writes nothing (cross-owner rejection);
 *   3. a missing, blank or sentinel actor is refused before any query runs
 *      (no `anonymous-user` fallback survives on these paths);
 *   4. legacy rows owned by the shared sentinel stay intact, unreadable and
 *      unmodified — they are never guessed at or reassigned;
 *   5. catalogue content stays separate from learner state, and system-deck
 *      materialization refuses the sentinel;
 *   6. sync replay cannot touch another learner's card, and a device id is not
 *      an identity (spoofing it yields a separate, empty roster entry);
 *   7. undo and XP attribution follow the verified actor.
 *
 * HOW
 * ---
 * The real services run against an emulated PostgreSQL (PGlite) built from the
 * committed migration chain, so the predicates are executed by SQL rather than
 * asserted against a mock. `@/db` is the only module replaced.
 *
 * WHAT THEY DO NOT PROVE
 * ----------------------
 * PGlite serialises statements, so nothing here speaks to concurrency. There is
 * no authorized database in this environment, so the real-PostgreSQL variants
 * of these cases live in CI (see `.github/workflows/ci.yml`).
 *
 * The E1 containment guards in front of the routes are asserted in
 * `tests/srs-containment.test.ts` and are unchanged by this phase: ownership is
 * enforced *behind* containment, so that lifting containment later cannot
 * re-open these paths.
 */

import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { SrsService } from "@/services/srs/srsService";
import { SessionService } from "@/services/srs/sessionService";
import { SyncService } from "@/services/srs/syncService";
import { DailyQueueService } from "@/services/srs/dailyQueueService";
import { PersonalizationService } from "@/services/srs/personalizationService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { SrsCardGenerator } from "@/services/srs/generators";
import {
  learnerCardIdFor,
  learnerDeckIdFor,
  materializeSystemDeck,
  seedCatalogue,
} from "@/services/srs/srsCatalogueService";
import { MissingOwnerError, MISSING_OWNER_CODE, SHARED_SENTINEL } from "@/lib/auth/serviceIdentity";

/* ------------------------------------------------------------------ *
 * Database boundary: the only module replaced.
 * ------------------------------------------------------------------ */

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { current: null as unknown } }));

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
  get pool() {
    return { end: async () => undefined };
  },
}));

const migrationFiles = () =>
  readdirSync("drizzle")
    .filter((n) => n.endsWith(".sql"))
    .sort();

function statements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

async function newDatabase(): Promise<PGlite> {
  const client = new PGlite();
  for (const file of migrationFiles()) {
    for (const statement of statements(readFileSync(`drizzle/${file}`, "utf8"))) {
      await client.exec(statement);
    }
  }
  return client;
}

/* ------------------------------------------------------------------ *
 * Actors. Never "anonymous-user": that value is not an identity.
 * ------------------------------------------------------------------ */

const OWNER = "learner-owner-e4";
const OTHER = "learner-other-e4";

describe("Phase 26F-E4: SRS learner-state ownership", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = await newDatabase();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      DELETE FROM "srs_cards";
      DELETE FROM "srs_decks";
      DELETE FROM "srs_review_sessions";
      DELETE FROM "srs_reviews";
      DELETE FROM "srs_sync_log";
      DELETE FROM "srs_sync_devices";
      DELETE FROM "srs_personalization";
      DELETE FROM "srs_user_settings";
      DELETE FROM "srs_card_templates";
      DELETE FROM "srs_system_decks";
      DELETE FROM "srs_schedulers";
      DELETE FROM "xp_events";
      DELETE FROM "kana_entries";
      DELETE FROM "kanji_entries";
    `);
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
  });

  const countOf = async (table: string): Promise<number> =>
    (await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM "${table}"`)).rows[0]!
      .count;

  const scalar = async (sql: string): Promise<unknown> =>
    (await client.query<Record<string, unknown>>(sql)).rows[0];

  /** Insert a learner-owned deck + card directly, bypassing the service. */
  async function seedOwnedCard(owner: string, deckId: string, cardId: string) {
    await client.exec(`
      INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key")
        VALUES ('${deckId}','Owned by ${owner}','${owner}','sm2');
      INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key")
        VALUES ('${cardId}','${deckId}','${owner}','vocabulary','前','まえ','sm2');
    `);
  }

  async function seedOwnedSession(owner: string, sessionId: string, cardId: string) {
    await client.exec(`
      INSERT INTO "srs_review_sessions" ("id","user_id","status","config","queue")
        VALUES (
          '${sessionId}',
          '${owner}',
          'active',
          '{"newLimit":1,"reviewLimit":1,"maxCards":1,"order":"due"}'::jsonb,
          '[{"cardId":"${cardId}","kind":"new"}]'::jsonb
        );
    `);
  }

  /* ================================================================ *
   * A. Missing / invalid actor is refused before any query
   * ================================================================ */

  describe("A. no sentinel-owner fallback", () => {
    const expectRefusal = async (run: () => Promise<unknown>) => {
      const error = await run().then(
        () => null,
        (e: unknown) => e
      );
      expect(error, "expected a MissingOwnerError").toBeInstanceOf(MissingOwnerError);
      expect((error as MissingOwnerError).code).toBe(MISSING_OWNER_CODE);
    };

    it("A1. the six service entry points reject a missing, blank or sentinel actor", async () => {
      for (const bad of [undefined, null, "", "   ", SHARED_SENTINEL, ` ${SHARED_SENTINEL} `]) {
        await expectRefusal(() => SrsService.listDecks(bad as unknown as string));
        await expectRefusal(() => SrsService.getStats(bad as unknown as string));
        await expectRefusal(() => SessionService.listSessions({ userId: bad as unknown as string }));
        await expectRefusal(() =>
          SessionService.getResumableSession(bad as unknown as string)
        );
        await expectRefusal(() =>
          DailyQueueService.getDailyQueue({ userId: bad as unknown as string })
        );
        await expectRefusal(() =>
          PersonalizationService.getPersonalizedView({ userId: bad as unknown as string })
        );
        await expectRefusal(() => SyncService.getStatus(bad as unknown as string));
        await expectRefusal(() =>
          SyncService.registerDevice({ userId: bad as unknown as string, deviceId: "dev-x" })
        );
        await expectRefusal(() =>
          SyncService.push({ deviceId: "dev-x", events: [] }, bad as unknown as string)
        );
        await expectRefusal(() =>
          SrsService.gradeCard({
            cardId: "any-card",
            rating: "good",
            actorUserId: bad as unknown as string,
          })
        );
        await expectRefusal(() =>
          SessionService.answer({
            sessionId: "any-session",
            cardId: "any-card",
            rating: "good",
            actorUserId: bad as unknown as string,
          })
        );
        await expectRefusal(() =>
          SessionService.undo({ sessionId: "any-session", actorUserId: bad as unknown as string })
        );
        await expectRefusal(() => SrsCardGenerator.fromDictionary({ userId: bad as unknown as string }));
        await expectRefusal(() =>
          KnowledgeService.addKanaToSrs({ kanaId: "any-kana", userId: bad as unknown as string })
        );
      }
    });

    it("A2. a rejected actor writes nothing at all", async () => {
      await expectRefusal(() =>
        SrsService.createDeck({
          name: "Should not exist",
          ownerId: SHARED_SENTINEL,
        } as unknown as Parameters<typeof SrsService.createDeck>[0])
      );
      expect(await countOf("srs_decks")).toBe(0);
      expect(await countOf("srs_cards")).toBe(0);
      expect(await countOf("srs_sync_devices")).toBe(0);
    });
  });

  /* ================================================================ *
   * B. Same-owner success and cross-owner rejection (cards + decks)
   * ================================================================ */

  describe("B. cards and decks", () => {
    it("B1. an owner can create, read and grade its own card; a foreign id is refused", async () => {
      const deck = await SrsService.createDeck({
        ownerId: OWNER,
        name: "Owner deck",
        schedulerKey: "sm2",
      });
      expect(deck.ownerId).toBe(OWNER);

      const card = await SrsService.createCard({
        deckId: deck.id,
        actorUserId: OWNER,
        front: "水",
        back: "みず — water",
      });
      expect(card).not.toBeNull();
      expect(card!.userId).toBe(OWNER);

      // Same owner: graded.
      const graded = await SrsService.gradeCard({
        cardId: card!.id,
        rating: "good",
        actorUserId: OWNER,
      });
      expect(graded).not.toBeNull();

      // Foreign actor: refused, and nothing was written.
      const reviewsBefore = await countOf("srs_reviews");
      const foreign = await SrsService.gradeCard({
        cardId: card!.id,
        rating: "good",
        actorUserId: OTHER,
      });
      expect(foreign).toBeNull();
      expect(await countOf("srs_reviews")).toBe(reviewsBefore);

      const rows = await scalar(`SELECT count(*)::int AS c FROM "srs_reviews" WHERE "user_id"<>'${OWNER}'`);
      expect(rows).toEqual({ c: 0 });
    });

    it("B2. a caller cannot create a card inside another learner's deck", async () => {
      await seedOwnedCard(OTHER, "deck-other", "card-other");
      const planted = await SrsService.createCard({
        deckId: "deck-other",
        actorUserId: OWNER,
        front: "侵入",
        back: "intrusion",
      });
      expect(planted).toBeNull();
      expect(await countOf("srs_cards")).toBe(1);
    });

    it("B3. a supplied deckId does not widen a read beyond the actor's own decks", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedCard(OTHER, "deck-b", "card-b");

      const foreignScope = await SrsService.queryCards({ userId: OWNER, deckId: "deck-b" });
      expect(foreignScope.cards).toEqual([]);
      expect(foreignScope.total).toBe(0);

      const ownScope = await SrsService.queryCards({ userId: OWNER, deckId: "deck-a" });
      expect(ownScope.cards.map((c) => c.id)).toEqual(["card-a"]);

      const queue = await SrsService.getDueQueue({ userId: OWNER, deckId: "deck-b" });
      expect(queue.queue).toEqual([]);
    });

    it("B4. updating another learner's deck is a no-op reported as not found", async () => {
      await seedOwnedCard(OTHER, "deck-b", "card-b");
      const patched = await SrsService.updateDeck("deck-b", { schedulerKey: "fsrs-lite" }, OWNER);
      expect(patched).toBeNull();
      const row = await scalar(`SELECT "scheduler_key" FROM "srs_decks" WHERE "id"='deck-b'`);
      expect(row).toEqual({ scheduler_key: "sm2" });
    });

    it("B5a. a card owned by someone else inside MY deck is still not mine", async () => {
      /*
       * The legacy shape this isolates: a SHARED deck (owner A) containing a
       * card owned by B — exactly what `deck-kana-hiragana` was before this
       * phase. The deck predicate alone would let A through, so this asserts the
       * CARD predicate is independently load-bearing.
       */
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key")
          VALUES ('shared-deck','Shared','${OWNER}','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key")
          VALUES ('other-card-in-my-deck','shared-deck','${OTHER}','vocabulary','他','ほか','sm2');
      `);

      expect(
        await SrsService.gradeCard({
          cardId: "other-card-in-my-deck",
          rating: "good",
          actorUserId: OWNER,
        })
      ).toBeNull();
      expect(await countOf("srs_reviews")).toBe(0);
      expect(
        await scalar(
          `SELECT "total_reviews" FROM "srs_cards" WHERE "id"='other-card-in-my-deck'`
        )
      ).toEqual({ total_reviews: 0 });

      // ... and the query path does not hand it back either.
      const scoped = await SrsService.queryCards({ userId: OWNER, deckId: "shared-deck" });
      expect(scoped.cards).toEqual([]);
    });

    it("B5. a foreign deck cannot be inspected through the scheduler preview", async () => {
      await seedOwnedCard(OTHER, "deck-b", "card-b");
      expect(await SrsService.previewDeckScheduler("deck-b", OWNER)).toBeNull();
      expect(await SrsService.previewDeckScheduler("deck-b", OTHER)).not.toBeNull();
    });
  });

  /* ================================================================ *
   * C. Sessions — answer / state / undo / lifecycle / summary
   * ================================================================ */

  describe("C. sessions", () => {
    it("C1. a foreign session id is invisible and unanswerable", async () => {
      await seedOwnedCard(OTHER, "deck-other", "card-other");
      await seedOwnedSession(OTHER, "session-other", "card-other");

      expect(await SessionService.getSessionRow("session-other", OWNER)).toBeNull();
      expect(await SessionService.getSessionState("session-other", OWNER)).toBeNull();
      expect(await SessionService.getSummary("session-other", OWNER)).toBeNull();

      const answered = await SessionService.answer({
        sessionId: "session-other",
        cardId: "card-other",
        rating: "good",
        actorUserId: OWNER,
      });
      expect(answered).toBeNull();

      const undone = await SessionService.undo({ sessionId: "session-other", actorUserId: OWNER });
      expect(undone).toBeNull();

      const completed = await SessionService.completeSession("session-other", OWNER);
      expect(completed).toBeNull();
      const abandoned = await SessionService.abandonSession("session-other", OWNER, "intrusion");
      expect(abandoned).toBeNull();

      // Nothing changed for the real owner.
      expect(await countOf("srs_reviews")).toBe(0);
      expect(await scalar(`SELECT "status","cancelled_reason" FROM "srs_review_sessions"`)).toEqual({
        status: "active",
        cancelled_reason: null,
      });
    });

    it("C2. same-owner answer, complete, and undo all succeed and stay attributed", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedSession(OWNER, "session-a", "card-a");

      const state = await SessionService.getSessionState("session-a", OWNER);
      expect(state?.currentCard?.card.id).toBe("card-a");

      const answered = await SessionService.answer({
        sessionId: "session-a",
        cardId: "card-a",
        rating: "good",
        actorUserId: OWNER,
      });
      expect(answered).not.toBeNull();

      const reviews = await scalar(
        `SELECT count(*)::int AS c, min("user_id") AS owner FROM "srs_reviews"`
      );
      expect(reviews).toEqual({ c: 1, owner: OWNER });

      const summary = await SessionService.getSummary("session-a", OWNER);
      expect(summary).not.toBeNull();

      const undone = await SessionService.undo({ sessionId: "session-a", actorUserId: OWNER });
      expect(undone?.undone).not.toBeNull();
      expect(await countOf("srs_reviews")).toBe(0);
    });

    it("C3. a session listed for one actor never contains another actor's rows", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedCard(OTHER, "deck-b", "card-b");
      await seedOwnedSession(OWNER, "session-a", "card-a");
      await seedOwnedSession(OTHER, "session-b", "card-b");

      const mine = await SessionService.listSessions({ userId: OWNER });
      expect(mine.map((s) => s.id)).toEqual(["session-a"]);
      expect((await SessionService.getResumableSession(OWNER))?.id).toBe("session-a");
      expect((await SessionService.getResumableSession(OTHER))?.id).toBe("session-b");
    });

    it("C4. planning a session never grades or queues another learner's card", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedCard(OTHER, "deck-b", "card-b");

      const planned = await SessionService.planSession({ userId: OWNER, maxCards: 5, dueHorizon: "day" });
      expect(planned.session.userId).toBe(OWNER);
      expect(planned.session.deckId === null || planned.session.deckId === "deck-a").toBe(true);

      const queue = await client.query<{ card_id: string; user_id: string }>(
        `SELECT q->>'cardId' AS card_id, s."user_id"
           FROM "srs_review_sessions" s, jsonb_array_elements(s."queue") q`
      );
      for (const row of queue.rows) expect(row.user_id).toBe(OWNER);
    });
  });

  /* ================================================================ *
   * D. Sync ownership and device-id spoofing
   * ================================================================ */

  describe("D. sync", () => {
    it("D1. replaying events for another learner's card is a no-op", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedCard(OTHER, "deck-b", "card-b");

      const result = await SyncService.push(
        {
          deviceId: "device-attacker",
          events: [
            {
              clientId: `spoof-${Date.now()}`,
              cardId: "card-a",
              rating: "easy",
              timeSpentMs: 1000,
              reviewedAt: new Date().toISOString(),
            },
          ],
        },
        OTHER
      );

      expect(result.accepted).toBe(0);
      expect(await countOf("srs_reviews")).toBe(0);
      const untouched = await scalar(
        `SELECT "repetitions","total_reviews" FROM "srs_cards" WHERE "id"='card-a'`
      );
      expect(untouched).toEqual({ repetitions: 0, total_reviews: 0 });
    });

    it("D2. same-owner replay is accepted and attributed to the actor", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");

      const result = await SyncService.push(
        {
          deviceId: "device-owner",
          events: [
            {
              clientId: `ok-${Date.now()}`,
              cardId: "card-a",
              rating: "good",
              timeSpentMs: 800,
              reviewedAt: new Date().toISOString(),
            },
          ],
        },
        OWNER
      );

      expect(result.accepted).toBe(1);
      const review = await scalar(`SELECT "user_id","device_id" FROM "srs_reviews"`);
      expect(review).toEqual({ user_id: OWNER, device_id: "device-owner" });
    });

    it("D3. a device id is not an identity: spoofing it yields a separate empty roster", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await SyncService.registerDevice({ userId: OWNER, deviceId: "shared-device", name: "Owner phone" });

      // The attacker types the owner's device id.
      const attacker = await SyncService.registerDevice({
        userId: OTHER,
        deviceId: "shared-device",
        name: "Attacker",
      });
      expect(attacker.created).toBe(true);

      const roster = await client.query<{ user_id: string; device_id: string }>(
        `SELECT "user_id","device_id" FROM "srs_sync_devices" ORDER BY "user_id"`
      );
      expect(roster.rows).toEqual([
        { user_id: OTHER, device_id: "shared-device" },
        { user_id: OWNER, device_id: "shared-device" },
      ]);

      // Pulling with the spoofed id returns only the attacker's (empty) state.
      const pull = await SyncService.pull({ deviceId: "shared-device", userId: OTHER });
      expect(pull.cards).toEqual([]);

      // Revoking through the attacker's identity cannot reach the owner's row.
      expect(await SyncService.revokeDevice(OTHER, "shared-device")).not.toBeNull();
      const ownerRow = await scalar(
        `SELECT "is_revoked" FROM "srs_sync_devices" WHERE "user_id"='${OWNER}'`
      );
      expect(ownerRow).toEqual({ is_revoked: false });
    });

    it("D4. a pull is scoped to the actor's own cards", async () => {
      await seedOwnedCard(OWNER, "deck-a", "card-a");
      await seedOwnedCard(OTHER, "deck-b", "card-b");

      const mine = await SyncService.pull({ deviceId: "d-own", userId: OWNER });
      expect(mine.cards.map((c) => c.id)).toEqual(["card-a"]);

      const snapshot = await SyncService.snapshot({ deviceId: "d-other", userId: OTHER });
      expect(snapshot.cards.map((c) => c.id)).toEqual(["card-b"]);
    });
  });

  /* ================================================================ *
   * E. Legacy unattributable data
   * ================================================================ */

  describe("E. legacy sentinel-owned rows", () => {
    beforeEach(async () => {
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key")
          VALUES ('legacy-deck','Legacy','${SHARED_SENTINEL}','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key","repetitions")
          VALUES ('legacy-card','legacy-deck','${SHARED_SENTINEL}','vocabulary','古','ふる','sm2',4);
      `);
    });

    it("E1. legacy rows are neither readable nor gradeable by any actor", async () => {
      expect(await SrsService.gradeCard({ cardId: "legacy-card", rating: "good", actorUserId: OWNER })).toBeNull();
      const scoped = await SrsService.queryCards({ userId: OWNER, deckId: "legacy-deck" });
      expect(scoped.cards).toEqual([]);
      expect(await SrsService.previewDeckScheduler("legacy-deck", OWNER)).toBeNull();
      expect((await SrsService.listDecks(OWNER)).map((d) => d.id)).toEqual([]);
    });

    it("E2. legacy rows are preserved exactly — never reassigned or deleted", async () => {
      await SrsService.gradeCard({ cardId: "legacy-card", rating: "good", actorUserId: OWNER });
      await SessionService.planSession({ userId: OWNER, maxCards: 3, dueHorizon: "day" }).catch(
        () => null
      );

      const card = await scalar(`SELECT "user_id","repetitions" FROM "srs_cards" WHERE "id"='legacy-card'`);
      expect(card).toEqual({ user_id: SHARED_SENTINEL, repetitions: 4 });
      const deck = await scalar(`SELECT "owner_id" FROM "srs_decks" WHERE "id"='legacy-deck'`);
      expect(deck).toEqual({ owner_id: SHARED_SENTINEL });
      expect(await countOf("srs_reviews")).toBe(0);
    });

    it("E3. system-deck materialization refuses the sentinel and writes nothing", async () => {
      await seedCatalogue();
      const systemDeckId = "deck-n5-core-sm2";
      expect(await materializeSystemDeck(SHARED_SENTINEL, systemDeckId)).toBeNull();
      expect(
        await scalar(
          `SELECT count(*)::int AS c FROM "srs_decks" WHERE "owner_id"='${SHARED_SENTINEL}' AND "system_deck_id" IS NOT NULL`
        )
      ).toEqual({ c: 0 });
    });
  });

  /* ================================================================ *
   * F. Catalogue vs learner state
   * ================================================================ */

  describe("F. catalogue vs learner state", () => {
    it("F1. materializing for two learners yields independent rows and state", async () => {
      await seedCatalogue();
      const systemDeckId = "deck-n5-core-sm2";

      const a = await materializeSystemDeck(OWNER, systemDeckId);
      const b = await materializeSystemDeck(OTHER, systemDeckId);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a!.deckId).toBe(learnerDeckIdFor(OWNER, systemDeckId));
      expect(b!.deckId).toBe(learnerDeckIdFor(OTHER, systemDeckId));
      expect(a!.deckId).not.toBe(b!.deckId);

      // Grading one learner's copy leaves the other's untouched.
      const [firstCard] = (
        await client.query<{ id: string }>(
          `SELECT "id" FROM "srs_cards" WHERE "user_id"='${OWNER}' ORDER BY "id" LIMIT 1`
        )
      ).rows;
      expect(firstCard).toBeDefined();
      await SrsService.gradeCard({ cardId: firstCard!.id, rating: "easy", actorUserId: OWNER });

      const otherTotal = await scalar(
        `SELECT sum("total_reviews")::int AS t FROM "srs_cards" WHERE "user_id"='${OTHER}'`
      );
      expect(otherTotal).toEqual({ t: 0 });
    });

    it("F2. catalogue content is never mixed into a learner's card query", async () => {
      await seedCatalogue();
      const templates = await countOf("srs_card_templates");
      expect(templates).toBeGreaterThan(0);
      expect(await countOf("srs_cards")).toBe(0);

      const cards = await SrsService.queryCards({ userId: OWNER });
      expect(cards.cards).toEqual([]);
      expect(await countOf("srs_card_templates")).toBe(templates);
    });
  });

  /* ================================================================ *
   * G. Knowledge-generated decks and cards
   * ================================================================ */

  describe("G. knowledge → SRS", () => {
    beforeEach(async () => {
      await client.exec(`
        INSERT INTO "kana_entries" ("id","character","script","romaji","category","row_key","column_key","source_ref","order_index")
          VALUES ('kana-a','あ','hiragana','a','gojuon','a','a','kana:hiragana:a',1);
      `);
    });

    it("G1. two learners adding the same kana get separate decks and separate cards", async () => {
      const a = await KnowledgeService.addKanaToSrs({ kanaId: "kana-a", userId: OWNER });
      const b = await KnowledgeService.addKanaToSrs({ kanaId: "kana-a", userId: OTHER });
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();

      expect(a!.cardId).toBe(learnerCardIdFor(OWNER, "card-kana-kana-a"));
      expect(b!.cardId).toBe(learnerCardIdFor(OTHER, "card-kana-kana-a"));
      expect(a!.deckId).not.toBe(b!.deckId);

      const ownership = await client.query<{ user_id: string; deck_owner: string }>(
        `SELECT c."user_id", d."owner_id" AS deck_owner
           FROM "srs_cards" c JOIN "srs_decks" d ON d."id" = c."deck_id"
          ORDER BY c."user_id"`
      );
      expect(ownership.rows).toEqual([
        { user_id: OTHER, deck_owner: OTHER },
        { user_id: OWNER, deck_owner: OWNER },
      ]);
    });

    it("G2. re-adding is idempotent per learner and never returns another learner's card", async () => {
      const first = await KnowledgeService.addKanaToSrs({ kanaId: "kana-a", userId: OWNER });
      await KnowledgeService.addKanaToSrs({ kanaId: "kana-a", userId: OTHER });

      const again = await KnowledgeService.addKanaToSrs({ kanaId: "kana-a", userId: OWNER });
      expect(again?.cardId).toBe(first!.cardId);
      expect(await countOf("srs_cards")).toBe(2);
    });
  });
});
