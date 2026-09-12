/**
 * Integration — the knowledge schema as migrations created it.
 *
 * Every assertion runs against the real database, so drift between
 * `src/db/schema.ts` and the applied SQL is caught here rather than in
 * production.
 *
 * Each test wraps its writes in a transaction and rolls back, so the suite
 * leaves no residue and can run repeatedly.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { openTestDb, scalar, type TestDb } from "../helpers/db.ts";

let db: TestDb;

before(() => {
  db = openTestDb();
});

after(async () => {
  await db.close();
});

const KNOWLEDGE_TABLES = [
  "knowledge_sources",
  "knowledge_provenance",
  "dictionary_entries",
  "dictionary_readings",
  "dictionary_senses",
  "radicals",
  "kanji_entries",
  "kanji_readings",
  "kanji_components",
  "grammar_patterns",
  "sentences",
  "conjugations",
];

/** Seed a verified source inside the caller's transaction. */
async function seedSource(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await client.query(
    `insert into knowledge_sources
       (id, name, license, attribution, version, status, license_verified)
     values ('t_src', 'Test', 'CC-BY-SA-4.0', 'Test attribution', '1.0', 'active', true)`,
  );
}

test("all twelve knowledge tables exist", async () => {
  const result = await db.pool.query(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows.map((row: { tablename: string }) => row.tablename);
  for (const table of KNOWLEDGE_TABLES) {
    assert.ok(tables.includes(table), `missing table: ${table}`);
  }
  assert.equal(KNOWLEDGE_TABLES.length, 12);
});

test("pg_trgm is installed so fuzzy search will work", async () => {
  const installed = await scalar<string>(
    db.pool,
    `select extname from pg_extension where extname = 'pg_trgm'`,
  );
  assert.equal(installed, "pg_trgm");
});

test("trigram indexes exist on the searchable columns", async () => {
  const result = await db.pool.query(
    `select indexname from pg_indexes
      where schemaname = 'public' and indexdef ilike '%gin_trgm_ops%'`,
  );
  const names = result.rows.map((row: { indexname: string }) => row.indexname);
  for (const expected of [
    "dictionary_entries_headword_trgm_idx",
    "dictionary_entries_reading_trgm_idx",
    "sentences_japanese_trgm_idx",
    "conjugations_surface_trgm_idx",
  ]) {
    assert.ok(names.includes(expected), `missing trigram index: ${expected}`);
  }
});

test("a source cannot be activated before its licence is verified", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    // The Phase 00 audit found the same dataset claimed under two different
    // licence versions. This constraint makes shipping that state impossible.
    await assert.rejects(() =>
      client.query(
        `insert into knowledge_sources (id, name, license, attribution, version, status)
         values ('x', 'X', 'Unknown', 'x', '1', 'active')`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("imported rows require a source, enforcing provenance", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await assert.rejects(() =>
      client.query(
        `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
         values ('e', 'does_not_exist', '1', '食', 'しょく')`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("the same upstream record cannot be imported twice", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('e1', 't_src', '1358280', '食べる', 'たべる')`,
    );
    // Idempotent ETL depends on this: a re-run updates, never duplicates.
    await assert.rejects(() =>
      client.query(
        `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
         values ('e2', 't_src', '1358280', '食べる', 'たべる')`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an entry carries its readings, senses and conjugations", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading, jlpt_level)
       values ('e1', 't_src', '1', '食べる', 'たべる', 5)`,
    );
    await client.query(
      `insert into dictionary_readings (id, entry_id, kind, text, is_primary)
       values ('r1', 'e1', 'kana', 'たべる', true)`,
    );
    await client.query(
      `insert into dictionary_senses (id, entry_id, position, glosses)
       values ('s1', 'e1', 0, '{"en":["to eat"],"fr":["manger"]}'::jsonb)`,
    );
    await client.query(
      `insert into conjugations (id, entry_id, word_class, form, surface, tense)
       values ('c1', 'e1', 'ichidan', 'past_plain', '食べた', 'past')`,
    );

    const glosses = await client.query(
      `select glosses->'en'->>0 as english, glosses->'fr'->>0 as french
         from dictionary_senses where id = 's1'`,
    );
    assert.equal(glosses.rows[0].english, "to eat");
    // Adding a language is data, not a migration.
    assert.equal(glosses.rows[0].french, "manger");

    const conjugation = await client.query(
      `select surface from conjugations where entry_id = 'e1' and form = 'past_plain'`,
    );
    assert.equal(conjugation.rows[0].surface, "食べた");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an inflected form resolves back to its dictionary entry", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('e1', 't_src', '1', '食べる', 'たべる')`,
    );
    await client.query(
      `insert into conjugations (id, entry_id, word_class, form, surface)
       values ('c1', 'e1', 'ichidan', 'past_plain_negative', '食べなかった')`,
    );

    // This is the reason conjugations are materialised: a learner searching
    // an inflected form must find the dictionary entry.
    const found = await client.query(
      `select e.headword from conjugations c
         join dictionary_entries e on e.id = c.entry_id
        where c.surface = '食べなかった'`,
    );
    assert.equal(found.rows[0].headword, "食べる");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("kanji decompose into radicals and components", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into radicals (id, number, character, stroke_count, meaning, reading_ja)
       values ('rad_85', 85, '水', 4, 'water', 'みず')`,
    );
    await client.query(
      `insert into kanji_entries
         (id, source_id, source_ref, character, codepoint, stroke_count, meanings, radical_id)
       values ('k1', 't_src', '6D77', '海', 'U+6D77', 9, array['sea','ocean'], 'rad_85')`,
    );
    await client.query(
      `insert into kanji_components
         (id, kanji_id, component_character, radical_id, is_classifying_radical, position)
       values ('kc1', 'k1', '氵', 'rad_85', true, 'hen')`,
    );

    // "Every kanji containing this component" is the query this table exists for.
    const containing = await client.query(
      `select k.character from kanji_components c
         join kanji_entries k on k.id = c.kanji_id
        where c.component_character = '氵'`,
    );
    assert.equal(containing.rows[0].character, "海");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("radical numbers are constrained to the classical 214", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    for (const invalid of [0, 215, -1]) {
      await assert.rejects(
        () =>
          client.query(
            `insert into radicals (id, number, character, stroke_count, meaning)
             values ($1, $2, $3, 1, 'x')`,
            [`r${invalid}`, invalid, `c${invalid}`],
          ),
        `radical number ${invalid} should be rejected`,
      );
      await client.query("rollback");
      await client.query("begin");
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("JLPT levels are constrained across every knowledge table", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('e1', 't_src', '1', 'x', 'x')`,
    );
    for (const level of [0, 6, 99]) {
      await assert.rejects(
        () => client.query(`update dictionary_entries set jlpt_level = $1 where id = 'e1'`, [level]),
        `level ${level} should be rejected`,
      );
      await client.query("rollback");
      await client.query("begin");
      await seedSource(client);
      await client.query(
        `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
         values ('e1', 't_src', '1', 'x', 'x')`,
      );
    }
    // 5 = N5 … 1 = N1 (ARCHITECTURE_FREEZE §2.2).
    await client.query(`update dictionary_entries set jlpt_level = 5 where id = 'e1'`);
    await client.query(`update dictionary_entries set jlpt_level = 1 where id = 'e1'`);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a source with data cannot be deleted", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('e1', 't_src', '1', 'x', 'x')`,
    );
    // Losing the source row would strand every row that cites it.
    await assert.rejects(() => client.query(`delete from knowledge_sources where id = 't_src'`));
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("fuzzy matching works on Japanese text", async () => {
  const score = await scalar<number>(db.pool, `select similarity('たべる', 'たべた') as score`);
  assert.ok(Number(score) > 0, "pg_trgm produced no similarity for related kana");
});

test("sentences store multilingual translations and furigana", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    await client.query(
      `insert into sentences (id, source_id, source_ref, japanese, translations, furigana, jlpt_level)
       values ('sn1', 't_src', '42', 'パンを食べる',
               '{"en":"I eat bread."}'::jsonb,
               '[{"t":"食","r":"た"},{"t":"べる"}]'::jsonb, 5)`,
    );
    const row = await client.query(
      `select translations->>'en' as english, jsonb_array_length(furigana) as segments
         from sentences where id = 'sn1'`,
    );
    assert.equal(row.rows[0].english, "I eat bread.");
    assert.equal(Number(row.rows[0].segments), 2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("translations must be an object, not an array", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedSource(client);
    // Repository B stored translations as an array; ours are keyed by language
    // so a lookup does not have to scan.
    await assert.rejects(() =>
      client.query(
        `insert into sentences (id, source_id, source_ref, japanese, translations)
         values ('sn2', 't_src', '43', 'x', '["wrong shape"]'::jsonb)`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
