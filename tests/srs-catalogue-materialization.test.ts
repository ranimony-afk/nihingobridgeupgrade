/**
 * Phase 26F-B — SRS catalogue / learner-state separation.
 *
 * Scope of what these tests prove:
 *   1. The additive migration applies to a real (emulated) PostgreSQL and
 *      leaves existing rows untouched.
 *   2. Catalogue content (`srs_system_decks` / `srs_card_templates`) is a
 *      separate storage class from learner state (`srs_decks` / `srs_cards`).
 *   3. Materialization gives each learner independent rows and independent
 *      scheduling state, idempotently.
 *
 * Scope of what these tests do NOT prove — stated so nobody over-reads them:
 *   - They do NOT show the critical SRS vulnerability is fixed.
 *     `SrsService.gradeCard` still grades any card id it is handed, and
 *     no route is authorized yet. Legacy shared rows stay shared.
 *   - PGlite serialises statements, so these tests say NOTHING about
 *     concurrent-write behaviour. Only real PostgreSQL could show that, and no
 *     authorized database is configured in this environment.
 */

import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";

import {
  CURRICULUM_SYSTEM_DECKS,
  curriculumTemplates,
  learnerCardIdFor,
  learnerDeckIdFor,
  materializeSystemDeck,
  seedCatalogue,
  templateIdForLegacyCard,
} from "@/services/srs/srsCatalogueService";
import { srsCardTemplates, srsCards, srsDecks, srsSystemDecks } from "@/db/schema";

/* ------------------------------------------------------------------ *
 * Database boundary: the only module replaced.
 * ------------------------------------------------------------------ */

const { dbHolder } = vi.hoisted(() => ({ dbHolder: { current: null as unknown } }));

vi.mock("@/db", () => ({
  get db() {
    return dbHolder.current;
  },
}));

/* ------------------------------------------------------------------ *
 * Migration helpers — the committed SQL is the only source of DDL.
 * ------------------------------------------------------------------ */

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

/** Apply every committed migration in filename order. */
async function applyChain(client: PGlite, upto?: RegExp): Promise<void> {
  for (const file of migrationFiles()) {
    if (upto && !upto.test(file)) break;
    for (const statement of statements(readFileSync(`drizzle/${file}`, "utf8"))) {
      await client.exec(statement);
    }
  }
}

async function newDatabase(upto?: RegExp): Promise<PGlite> {
  const client = new PGlite();
  await applyChain(client, upto);
  return client;
}

const MIGRATION_0005 = () => {
  const file = migrationFiles().filter((n) => /^0005_/.test(n))[0];
  if (!file) throw new Error("no drizzle/0005_*.sql migration exists");
  return { file, sql: readFileSync(`drizzle/${file}`, "utf8") };
};

/* ================================================================== *
 * A. Migration
 * ================================================================== */

describe("Phase 26F-B: the additive migration", () => {
  it("1. the committed chain applies in order and ends with the catalogue migration", async () => {
    const files = migrationFiles();
    expect(files.some((f) => /^0004_/.test(f)), "26A migration present").toBe(true);
    const latest = files.at(-1)!;
    expect(latest).toMatch(/^0005_/);

    const client = await newDatabase();
    try {
      const tables = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('srs_system_decks','srs_card_templates')
         ORDER BY table_name`
      );
      expect(tables.rows.map((r) => r.table_name)).toEqual([
        "srs_card_templates",
        "srs_system_decks",
      ]);
    } finally {
      await client.close();
    }
  });

  it("2. existing rows survive the migration unchanged", async () => {
    // Build at the pre-0005 state, seed representative legacy rows, then migrate.
    const client = await newDatabase(/^(0000|0001|0002|0003|0004)_/);
    try {
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key")
          VALUES ('legacy-deck','Legacy','anonymous-user','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key","repetitions","due_at")
          VALUES ('legacy-card','legacy-deck','anonymous-user','vocabulary','題','こたえ','sm2',7, now());
        INSERT INTO "srs_reviews" ("id","card_id","deck_id","user_id","rating","due_at","scheduler_key","scheduler_version")
          VALUES ('legacy-review','legacy-card','legacy-deck','anonymous-user','good', now(),'sm2','1.0');
      `);

      const { statements: post = [] } = {};
      void post;
      for (const statement of statements(MIGRATION_0005().sql)) {
        await client.exec(statement);
      }

      const cards = await client.query<{
        id: string;
        user_id: string;
        repetitions: number;
        template_id: string | null;
      }>(`SELECT id, user_id, repetitions, template_id FROM "srs_cards" WHERE id = 'legacy-card'`);
      expect(cards.rows).toEqual([
        { id: "legacy-card", user_id: "anonymous-user", repetitions: 7, template_id: null },
      ]);

      const decks = await client.query<{ id: string; owner_id: string; system_deck_id: string | null }>(
        `SELECT id, owner_id, system_deck_id FROM "srs_decks" WHERE id = 'legacy-deck'`
      );
      expect(decks.rows).toEqual([
        { id: "legacy-deck", owner_id: "anonymous-user", system_deck_id: null },
      ]);

      const reviews = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "srs_reviews" WHERE id = 'legacy-review'`
      );
      expect(reviews.rows[0]!.count).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("3. the migration does not drop the legacy defaults", async () => {
    const client = await newDatabase();
    try {
      const defaults = await client.query<{ table_name: string; column_name: string; column_default: string | null }>(
        `SELECT table_name, column_name, column_default FROM information_schema.columns
         WHERE table_schema='public'
           AND ((table_name='srs_decks' AND column_name='owner_id')
             OR (table_name='srs_cards' AND column_name='user_id'))
         ORDER BY table_name`
      );
      expect(defaults.rows.map((r) => [r.table_name, r.column_name, r.column_default])).toEqual([
        ["srs_cards", "user_id", "'anonymous-user'::text"],
        ["srs_decks", "owner_id", "'anonymous-user'::text"],
      ]);
    } finally {
      await client.close();
    }
  });

  it("4. multiple NULL template ids remain valid for one learner", async () => {
    const client = await newDatabase();
    try {
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('d1','D','learner-a','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key")
          VALUES ('c1','d1','learner-a','vocabulary','a','1','sm2'),
                 ('c2','d1','learner-a','vocabulary','b','2','sm2'),
                 ('c3','d1','learner-a','vocabulary','c','3','sm2');
      `);
      const rows = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "srs_cards" WHERE "template_id" IS NULL`
      );
      expect(rows.rows[0]!.count).toBe(3);
    } finally {
      await client.close();
    }
  });

  it("5. duplicate (user_id, template_id) materialization is prevented", async () => {
    const client = await newDatabase();
    try {
      await client.exec(`
        INSERT INTO "srs_system_decks" ("id","name","scheduler_key") VALUES ('sd','SD','sm2');
        INSERT INTO "srs_card_templates" ("id","system_deck_id","card_type","front","back")
          VALUES ('tpl','sd','vocabulary','x','y');
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('d1','D','learner-a','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","template_id","card_type","front","back","scheduler_key")
          VALUES ('c1','d1','learner-a','tpl','vocabulary','x','y','sm2');
      `);
      await expect(
        client.exec(`
          INSERT INTO "srs_cards" ("id","deck_id","user_id","template_id","card_type","front","back","scheduler_key")
            VALUES ('c2','d1','learner-a','tpl','vocabulary','x','y','sm2');
        `)
      ).rejects.toThrow(/duplicate key|unique/i);

      // ...but a DIFFERENT learner may hold the same template.
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('d2','D','learner-b','sm2');
        INSERT INTO "srs_cards" ("id","deck_id","user_id","template_id","card_type","front","back","scheduler_key")
          VALUES ('c3','d2','learner-b','tpl','vocabulary','x','y','sm2');
      `);
      const perLearner = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "srs_cards" WHERE "template_id" = 'tpl'`
      );
      expect(perLearner.rows[0]!.count).toBe(2);
    } finally {
      await client.close();
    }
  });

  it("6. a learner may hold only one materialized copy of a system deck", async () => {
    const client = await newDatabase();
    try {
      await client.exec(`
        INSERT INTO "srs_system_decks" ("id","name","scheduler_key") VALUES ('sd','SD','sm2');
        INSERT INTO "srs_decks" ("id","name","owner_id","system_deck_id","scheduler_key")
          VALUES ('d1','D','learner-a','sd','sm2');
      `);
      await expect(
        client.exec(`
          INSERT INTO "srs_decks" ("id","name","owner_id","system_deck_id","scheduler_key")
            VALUES ('d2','D','learner-a','sd','sm2');
        `)
      ).rejects.toThrow(/duplicate key|unique/i);
    } finally {
      await client.close();
    }
  });

  it("7. template links are real foreign keys, not free-text", async () => {
    const client = await newDatabase();
    try {
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('d1','D','learner-a','sm2');
      `);
      await expect(
        client.exec(`
          INSERT INTO "srs_cards" ("id","deck_id","user_id","template_id","card_type","front","back","scheduler_key")
            VALUES ('c1','d1','learner-a','tpl-does-not-exist','vocabulary','x','y','sm2');
        `)
      ).rejects.toThrow(/foreign key|violates/i);

      await expect(
        client.exec(`
          INSERT INTO "srs_decks" ("id","name","owner_id","system_deck_id","scheduler_key")
            VALUES ('d2','D','learner-a','sd-does-not-exist','sm2');
        `)
      ).rejects.toThrow(/foreign key|violates/i);
    } finally {
      await client.close();
    }
  });

  it("8. re-applying the migration fails clearly and leaves no partial corruption", async () => {
    const client = await newDatabase();
    try {
      await client.exec(`
        INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('keep','K','learner-a','sm2');
      `);
      const before = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "srs_decks"`
      );

      await expect(
        (async () => {
          for (const statement of statements(MIGRATION_0005().sql)) await client.exec(statement);
        })()
      ).rejects.toThrow(/already exists|duplicate/i);

      const after = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "srs_decks"`
      );
      expect(after.rows[0]!.count).toBe(before.rows[0]!.count);

      const tables = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN ('srs_system_decks','srs_card_templates')`
      );
      expect(tables.rows[0]!.count).toBe(2);
    } finally {
      await client.close();
    }
  });

  it("9. the schema declarations and the migration SQL agree structurally", async () => {
    const client = await newDatabase();
    try {
      for (const table of [srsSystemDecks, srsCardTemplates] as const) {
        const declared = Object.values(getTableColumns(table));
        const actual = await client.query<{
          column_name: string;
          is_nullable: string;
          data_type: string;
          column_default: string | null;
        }>(
          `SELECT column_name, is_nullable, data_type, column_default
             FROM information_schema.columns
            WHERE table_schema='public' AND table_name = $1`,
          [table === srsSystemDecks ? "srs_system_decks" : "srs_card_templates"]
        );

        const byName = new Map(actual.rows.map((r) => [r.column_name, r]));
        expect([...byName.keys()].sort()).toEqual(declared.map((c) => c.name).sort());

        for (const column of declared) {
          const row = byName.get(column.name)!;
          expect(row.is_nullable, `${column.name} nullability`).toBe(
            column.notNull ? "NO" : "YES"
          );
        }
      }

      // The two new learner-state columns exist, nullable, and are NOT NULL-free.
      const added = await client.query<{ table_name: string; column_name: string; is_nullable: string }>(
        `SELECT table_name, column_name, is_nullable FROM information_schema.columns
          WHERE table_schema='public'
            AND ((table_name='srs_decks' AND column_name='system_deck_id')
              OR (table_name='srs_cards' AND column_name='template_id'))`
      );
      expect(added.rows).toEqual([
        { table_name: "srs_cards", column_name: "template_id", is_nullable: "YES" },
        { table_name: "srs_decks", column_name: "system_deck_id", is_nullable: "YES" },
      ]);
      expect(srsCards.templateId.notNull).toBe(false);
      expect(srsDecks.systemDeckId.notNull).toBe(false);
    } finally {
      await client.close();
    }
  });
});

/* ================================================================== *
 * B/C/D. Seeding, materialization, compatibility
 * ================================================================== */

describe("Phase 26F-B: catalogue seeding and learner materialization", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = await newDatabase();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // Fresh, empty catalogue + learner state per test; schema is kept.
    await client.exec(`
      DELETE FROM "srs_cards";
      DELETE FROM "srs_decks";
      DELETE FROM "srs_card_templates";
      DELETE FROM "srs_system_decks";
      DELETE FROM "srs_reviews";
      DELETE FROM "kana_entries";
      DELETE FROM "kanji_entries";
    `);
    dbHolder.current = drizzle(client) as unknown as typeof import("@/db").db;
  });

  const countOf = async (table: string) =>
    (
      await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${table}"`
      )
    ).rows[0]!.count;

  it("10. seeding writes catalogue content only — never learner state", async () => {
    const result = await seedCatalogue();

    expect(result.systemDeckIds).toEqual(
      expect.arrayContaining(CURRICULUM_SYSTEM_DECKS.map((d) => d.id))
    );
    expect(await countOf("srs_system_decks")).toBe(CURRICULUM_SYSTEM_DECKS.length);
    expect(await countOf("srs_card_templates")).toBeGreaterThan(0);

    // The whole point: seeding no longer creates learner-owned rows.
    expect(await countOf("srs_decks")).toBe(0);
    expect(await countOf("srs_cards")).toBe(0);
  });

  it("11. seeded templates carry content and no scheduling state", async () => {
    await seedCatalogue();

    const templateCols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='srs_card_templates'`
    );
    const names = templateCols.rows.map((r) => r.column_name);
    for (const scheduling of ["repetitions", "due_at", "ease_factor", "interval_days", "total_reviews"]) {
      expect(names, `templates must not carry ${scheduling}`).not.toContain(scheduling);
    }

    const rows = await client.query<{ front: string; system_deck_id: string }>(
      `SELECT front, system_deck_id FROM "srs_card_templates" ORDER BY id LIMIT 5`
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.front.length > 0)).toBe(true);
  });

  it("12. repeated seeding is safe and adds nothing", async () => {
    const first = await seedCatalogue();
    const decks = await countOf("srs_system_decks");
    const templates = await countOf("srs_card_templates");

    const second = await seedCatalogue();
    expect(second.systemDecksInserted).toBe(0);
    expect(second.templatesInserted).toBe(0);
    expect(await countOf("srs_system_decks")).toBe(decks);
    expect(await countOf("srs_card_templates")).toBe(templates);

    const third = await seedCatalogue();
    expect(third.templatesInserted).toBe(0);
    expect(first.templatesInserted).toBeGreaterThan(0);
  });

  it("13. a partially seeded catalogue is repaired without duplicating what exists", async () => {
    await seedCatalogue();
    const fullDecks = await countOf("srs_system_decks");
    const fullTemplates = await countOf("srs_card_templates");

    // Simulate an interrupted seed: one deck is entirely absent, and a slice of
    // another deck's templates was never written. (Templates go first — the
    // catalogue FK deliberately refuses to orphan them.)
    await client.exec(`DELETE FROM "srs_card_templates" WHERE "system_deck_id" = 'deck-n5-core-sm2'`);
    await client.exec(`DELETE FROM "srs_card_templates" WHERE "system_deck_id" = 'deck-n5-curriculum-ladder'`);
    await client.exec(`DELETE FROM "srs_system_decks" WHERE "id" = 'deck-n5-curriculum-ladder'`);

    expect(await countOf("srs_system_decks")).toBe(fullDecks - 1);

    const repaired = await seedCatalogue();
    expect(repaired.systemDecksInserted).toBe(1);
    expect(repaired.templatesInserted).toBeGreaterThan(0);
    expect(await countOf("srs_system_decks")).toBe(fullDecks);
    expect(await countOf("srs_card_templates")).toBe(fullTemplates);
  });

  it("14. the kana and kanji catalogue families are covered once their sources exist", async () => {
    await seedCatalogue();
    const before = await countOf("srs_system_decks");

    await client.exec(`
      INSERT INTO "kana_entries" ("id","character","script","romaji","category","row_key","column_key","source_ref","order_index")
        VALUES ('hira-a','あ','hiragana','a','gojuon','a','a','kana:hiragana:a',1);
      INSERT INTO "kanji_entries" ("id","character","meaning","stroke_count","jlpt_level","source_ref")
        VALUES ('kanji-1','日','day',4,'N5','kanjidic2:1');
    `);

    await seedCatalogue();

    const decks = await client.query<{ id: string }>(
      `SELECT id FROM "srs_system_decks" ORDER BY id`
    );
    const ids = decks.rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["deck-kana-hiragana", "deck-kanji-n5"]));
    expect(ids.length).toBe(before + 2);

    const kanaTpl = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "srs_card_templates" WHERE "system_deck_id"='deck-kana-hiragana'`
    );
    expect(kanaTpl.rows[0]!.count).toBe(1);

    // 'katakana' has no source rows, so no katakana deck is invented.
    expect(ids).not.toContain("deck-kana-katakana");
  });

  it("15. curriculum templates mirror the legacy seeded cards one-for-one", async () => {
    const { SrsService } = await import("@/services/srs/srsService");
    await SrsService.ensureSeeded();

    const legacy = await client.query<{
      id: string;
      deck_id: string;
      front: string;
      back: string;
      card_type: string;
    }>(
      `SELECT id, deck_id, front, back, card_type FROM "srs_cards"
        WHERE "template_id" IS NULL ORDER BY id`
    );
    const templates = await client.query<{
      id: string;
      system_deck_id: string;
      front: string;
      back: string;
      card_type: string;
    }>(`SELECT id, system_deck_id, front, back, card_type FROM "srs_card_templates" ORDER BY id`);

    const byTemplateId = new Map(templates.rows.map((t) => [t.id, t]));
    expect(legacy.rows.length).toBeGreaterThan(0);

    for (const card of legacy.rows) {
      const template = byTemplateId.get(templateIdForLegacyCard(card.id));
      expect(template, `no template for legacy card ${card.id}`).toBeDefined();
      expect(template!.system_deck_id).toBe(card.deck_id);
      expect(template!.front).toBe(card.front);
      expect(template!.back).toBe(card.back);
      expect(template!.card_type).toBe(card.card_type);
    }

    // Every curriculum template is exactly one legacy card: no orphans either way.
    const curriculumIds = new Set(curriculumTemplates().map((t) => t.id));
    for (const template of templates.rows) {
      if (!curriculumIds.has(template.id)) continue;
      const legacyId = template.id.replace(/^tpl-/, "");
      expect(legacy.rows.some((c) => c.id === legacyId)).toBe(true);
    }
  });

  it("16. materialization gives one learner their own deck and cards", async () => {
    await seedCatalogue();
    const result = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");

    expect(result).not.toBeNull();
    expect(result!.userId).toBe("learner-a");
    expect(result!.cardsCreated).toBe(result!.cardsTotal);
    expect(result!.cardsTotal).toBeGreaterThan(0);

    const deck = await client.query<{ owner_id: string; system_deck_id: string }>(
      `SELECT owner_id, system_deck_id FROM "srs_decks" WHERE id = $1`,
      [result!.deckId]
    );
    expect(deck.rows[0]).toEqual({
      owner_id: "learner-a",
      system_deck_id: "deck-n5-core-sm2",
    });

    const cards = await client.query<{ user_id: string; template_id: string }>(
      `SELECT user_id, template_id FROM "srs_cards" WHERE "deck_id" = $1`,
      [result!.deckId]
    );
    expect(cards.rows.every((c) => c.user_id === "learner-a")).toBe(true);
    expect(cards.rows.every((c) => c.template_id !== null)).toBe(true);
  });

  it("17. learner card ids are opaque and never the template id", async () => {
    await seedCatalogue();
    const result = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");

    const rows = await client.query<{ id: string; template_id: string }>(
      `SELECT id, template_id FROM "srs_cards" WHERE "deck_id" = $1`,
      [result!.deckId]
    );
    for (const row of rows.rows) {
      expect(row.id).not.toBe(row.template_id);
      expect(row.id.startsWith("card-m-")).toBe(true);
      // Deterministic and per-learner.
      expect(row.id).toBe(learnerCardIdFor("learner-a", row.template_id));
      expect(learnerCardIdFor("learner-b", row.template_id)).not.toBe(row.id);
    }
  });

  it("18. two learners receive separate rows and independent scheduling state", async () => {
    await seedCatalogue();
    const a = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");
    const b = await materializeSystemDeck("learner-b", "deck-n5-core-sm2");

    expect(a!.deckId).not.toBe(b!.deckId);
    expect(a!.deckId).toBe(learnerDeckIdFor("learner-a", "deck-n5-core-sm2"));
    expect(b!.deckId).toBe(learnerDeckIdFor("learner-b", "deck-n5-core-sm2"));

    const total = await countOf("srs_cards");
    expect(total).toBe(a!.cardsTotal + b!.cardsTotal);

    // Grade-equivalent mutation on ONE learner's card.
    const [cardA] = (
      await client.query<{ id: string; template_id: string }>(
        `SELECT id, template_id FROM "srs_cards" WHERE "user_id"='learner-a' ORDER BY id LIMIT 1`
      )
    ).rows;
    await client.exec(`
      UPDATE "srs_cards" SET "repetitions" = 9, "interval_days" = 42, "due_at" = now() + interval '30 days'
       WHERE "id" = '${cardA!.id}';
    `);

    const other = await client.query<{ repetitions: number; interval_days: number }>(
      `SELECT repetitions, interval_days FROM "srs_cards"
        WHERE "user_id"='learner-b' AND "template_id" = $1`,
      [cardA!.template_id]
    );
    expect(other.rows[0]).toEqual({ repetitions: 0, interval_days: 0 });

    // The shared template row carries no scheduling state at all.
    const template = await client.query<{ id: string }>(
      `SELECT id FROM "srs_card_templates" WHERE id = $1`,
      [cardA!.template_id]
    );
    expect(template.rows.length).toBe(1);
  });

  it("19. repeated materialization never duplicates cards", async () => {
    await seedCatalogue();
    const first = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");
    const cardsAfterFirst = await countOf("srs_cards");

    const second = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");
    const third = await materializeSystemDeck("learner-a", "deck-n5-core-sm2");

    expect(second!.cardsCreated).toBe(0);
    expect(third!.cardsCreated).toBe(0);
    expect(second!.cardsTotal).toBe(first!.cardsTotal);
    expect(await countOf("srs_cards")).toBe(cardsAfterFirst);
    expect(await countOf("srs_decks")).toBe(1);
  });

  it("20. materialization refuses an unusable or shared-sentinel actor", async () => {
    await seedCatalogue();
    expect(await materializeSystemDeck("", "deck-n5-core-sm2")).toBeNull();
    expect(await materializeSystemDeck("   ", "deck-n5-core-sm2")).toBeNull();
    expect(await materializeSystemDeck("anonymous-user", "deck-n5-core-sm2")).toBeNull();
    expect(await materializeSystemDeck("learner-a", "deck-does-not-exist")).toBeNull();

    expect(await countOf("srs_decks")).toBe(0);
    expect(await countOf("srs_cards")).toBe(0);
  });

  it("21. legacy rows and review history survive seeding and materialization", async () => {
    await client.exec(`
      INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key") VALUES ('legacy-deck','L','anonymous-user','sm2');
      INSERT INTO "srs_cards" ("id","deck_id","user_id","card_type","front","back","scheduler_key","repetitions","due_at")
        VALUES ('legacy-card','legacy-deck','anonymous-user','vocabulary','題','こたえ','sm2',7, now());
      INSERT INTO "srs_reviews" ("id","card_id","deck_id","user_id","rating","due_at","scheduler_key","scheduler_version")
        VALUES ('legacy-review','legacy-card','legacy-deck','anonymous-user','good', now(),'sm2','1.0');
    `);

    await seedCatalogue();
    await materializeSystemDeck("learner-a", "deck-n5-core-sm2");

    const legacyCard = await client.query<{
      id: string;
      user_id: string;
      repetitions: number;
      template_id: string | null;
      deck_id: string;
    }>(`SELECT id, user_id, repetitions, template_id, deck_id FROM "srs_cards" WHERE id='legacy-card'`);
    expect(legacyCard.rows[0]).toEqual({
      id: "legacy-card",
      user_id: "anonymous-user",
      repetitions: 7,
      template_id: null,
      deck_id: "legacy-deck",
    });

    const legacyDeck = await client.query<{ owner_id: string; system_deck_id: string | null }>(
      `SELECT owner_id, system_deck_id FROM "srs_decks" WHERE id='legacy-deck'`
    );
    expect(legacyDeck.rows[0]).toEqual({ owner_id: "anonymous-user", system_deck_id: null });

    const review = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "srs_reviews" WHERE id='legacy-review'`
    );
    expect(review.rows[0]!.count).toBe(1);
  });

  it("22. ambiguous legacy rows are never reclassified or reassigned", async () => {
    // A learner-created deck that MIMICS a system deck id must stay untouched.
    await client.exec(`
      INSERT INTO "srs_system_decks" ("id","name","scheduler_key") VALUES ('deck-n5-core-sm2','Catalogue','sm2');
      INSERT INTO "srs_decks" ("id","name","owner_id","scheduler_key")
        VALUES ('deck-n5-core-sm2','Impostor','anonymous-user','sm2');
    `);

    await seedCatalogue();

    const deck = await client.query<{ owner_id: string; system_deck_id: string | null }>(
      `SELECT owner_id, system_deck_id FROM "srs_decks" WHERE id='deck-n5-core-sm2'`
    );
    expect(deck.rows[0]).toEqual({ owner_id: "anonymous-user", system_deck_id: null });
  });
});
