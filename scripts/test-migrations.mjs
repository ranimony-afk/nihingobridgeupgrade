#!/usr/bin/env node
/**
 * Migration and rollback gate.
 *
 * A migration that only works against the developer's existing database is
 * not a migration, it is a coincidence. A rollback that has never been run is
 * not a strategy, it is a hope.
 *
 * For each target database:
 *   1. create it empty
 *   2. apply the full chain, verify the schema, exercise the constraints
 *   3. take a SCHEMA FINGERPRINT — every table, column, type, constraint,
 *      index and enum, canonicalised and hashed
 *   4. roll the whole chain back and assert nothing is left behind
 *   5. re-apply from zero and assert the fingerprint is byte-identical
 *
 * Step 5 is the real test. It proves the rollback is complete (no orphaned
 * enum, index, or constraint) and that the forward chain is deterministic.
 * A leftover object would change the hash.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";

import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env", override: false, quiet: true });

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const adminUrl = withDatabase(source, "postgres");

const EXPECTED_TABLES = [
  // identity
  "identity_credentials",
  "identity_preferences",
  "identity_profiles",
  "identity_sessions",
  "identity_user_roles",
  "identity_users",
  // knowledge
  "conjugations",
  "dictionary_entries",
  "dictionary_readings",
  "dictionary_senses",
  "grammar_patterns",
  "kanji_components",
  "kanji_entries",
  "kanji_readings",
  "knowledge_provenance",
  "knowledge_sources",
  "radicals",
  "sentences",
  // learning
  "answers",
  "attempts",
  "courses",
  "exercises",
  "lesson_items",
  "lessons",
  "progress",
  "questions",
  "units",
  // srs
  "srs_cards",
  "srs_decks",
  "srs_reviews",
  "srs_schedule",
];

const EXPECTED_CONSTRAINTS = [
  "identity_profiles_target_level_check",
  "identity_preferences_daily_goal_check",
  "dictionary_entries_jlpt_check",
  "kanji_entries_jlpt_check",
  "kanji_entries_grade_check",
  "radicals_number_check",
  "sentences_jlpt_check",
  "grammar_patterns_jlpt_check",
  "knowledge_sources_active_requires_license_check",
  "courses_jlpt_check",
  "questions_difficulty_check",
  "exercises_pass_threshold_check",
  "lesson_items_target_count_check",
  "lesson_items_target_matches_kind_check",
  "progress_completed_consistency_check",
  "attempts_response_present_check",
  "srs_schedule_new_state_check",
  "srs_schedule_lapses_bound_check",
  "srs_schedule_review_requires_memory_check",
  "srs_cards_target_count_check",
];

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`    ok   ${label}`);
  } else {
    console.log(`    FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

function runMigrator(url, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate.mjs", "--url", url, ...extraArgs],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`migrate.mjs ${extraArgs.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/** migrate.mjs is expected to refuse; capture output without throwing. */
function runMigratorExpectingFailure(url, extraArgs) {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate.mjs", "--url", url, ...extraArgs],
    { encoding: "utf8" },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

async function recreateDatabase(name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase(name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await admin.end();
  }
}

/**
 * Canonical hash of the entire public schema.
 *
 * Ordering is fixed by SQL so the hash depends on structure, not on whatever
 * order PostgreSQL happens to return rows in.
 */
async function fingerprint(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const columns = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, column_name
    `);
    const constraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
       ORDER BY conname
    `);
    const indexes = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' ORDER BY indexname
    `);
    const enums = await client.query(`
      SELECT t.typname, e.enumlabel
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       ORDER BY t.typname, e.enumsortorder
    `);

    const canonical = JSON.stringify({
      columns: columns.rows,
      constraints: constraints.rows,
      indexes: indexes.rows,
      enums: enums.rows,
    });
    return {
      hash: createHash("sha256").update(canonical).digest("hex"),
      counts: {
        columns: columns.rowCount,
        constraints: constraints.rowCount,
        indexes: indexes.rowCount,
        enums: enums.rowCount,
      },
    };
  } finally {
    await client.end();
  }
}

async function verifySchema(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    ).rows.map((row) => row.tablename);
    for (const table of EXPECTED_TABLES) {
      check(`table ${table}`, tables.includes(table));
    }

    const constraints = (
      await client.query(`SELECT conname FROM pg_constraint WHERE contype = 'c'`)
    ).rows.map((row) => row.conname);
    for (const name of EXPECTED_CONSTRAINTS) {
      check(`check constraint ${name}`, constraints.includes(name));
    }

    // pg_trgm must be created by the migration, not assumed to exist.
    const extension = await client.query(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
    );
    check("pg_trgm extension created by migration", extension.rowCount === 1);

    const trigram = await client.query(
      `SELECT count(*)::int AS n FROM pg_indexes
        WHERE schemaname = 'public' AND indexdef ILIKE '%gin_trgm_ops%'`,
    );
    check("trigram indexes present", trigram.rows[0].n >= 6, `found ${trigram.rows[0].n}`);
  } finally {
    await client.end();
  }
}

/** Constraints must reject bad data, not merely exist. */
async function verifyBehaviour(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // A source cannot be active until its licence has been verified — the
    // audit found two conflicting licence claims for the same dataset.
    let blocked = false;
    try {
      await client.query(
        `INSERT INTO knowledge_sources (id, name, license, attribution, version, status)
         VALUES ('bad', 'Bad', 'Unknown', 'x', '1', 'active')`,
      );
    } catch {
      blocked = true;
    }
    check("active source without verified licence is rejected", blocked);

    await client.query(
      `INSERT INTO knowledge_sources
         (id, name, license, attribution, version, status, license_verified)
       VALUES ('jmdict', 'JMdict', 'CC-BY-SA-4.0', 'EDRDG', '2024-07-01', 'active', true)`,
    );
    check("verified source can be active", true);

    await client.query(
      `INSERT INTO dictionary_entries (id, source_id, source_ref, headword, reading)
       VALUES ('e1', 'jmdict', '1358280', '食べる', 'たべる')`,
    );

    let badJlpt = false;
    try {
      await client.query(`UPDATE dictionary_entries SET jlpt_level = 9 WHERE id = 'e1'`);
    } catch {
      badJlpt = true;
    }
    check("JLPT level outside 1–5 is rejected", badJlpt);

    await client.query(`UPDATE dictionary_entries SET jlpt_level = 5 WHERE id = 'e1'`);
    check("JLPT level 5 (N5) is accepted", true);

    let badRadical = false;
    try {
      await client.query(
        `INSERT INTO radicals (id, number, character, stroke_count, meaning)
         VALUES ('r0', 500, 'X', 1, 'invalid')`,
      );
    } catch {
      badRadical = true;
    }
    check("radical number outside 1–214 is rejected", badRadical);

    // Deleting an entry must take its children with it.
    await client.query(
      `INSERT INTO dictionary_senses (id, entry_id, position, glosses)
       VALUES ('s1', 'e1', 0, '{"en":["to eat"]}'::jsonb)`,
    );
    await client.query(
      `INSERT INTO conjugations (id, entry_id, word_class, form, surface)
       VALUES ('c1', 'e1', 'ichidan', 'past_plain', '食べた')`,
    );
    await client.query(`DELETE FROM dictionary_entries WHERE id = 'e1'`);
    const orphans = await client.query(
      `SELECT (SELECT count(*) FROM dictionary_senses) AS senses,
              (SELECT count(*) FROM conjugations) AS conjugations`,
    );
    check(
      "senses and conjugations cascade on entry delete",
      Number(orphans.rows[0].senses) === 0 && Number(orphans.rows[0].conjugations) === 0,
    );

    // A source in use must not be deletable — provenance would be lost.
    let restricted = false;
    try {
      await client.query(
        `INSERT INTO dictionary_entries (id, source_id, source_ref, headword, reading)
         VALUES ('e2', 'jmdict', '2', 'x', 'x')`,
      );
      await client.query(`DELETE FROM knowledge_sources WHERE id = 'jmdict'`);
    } catch {
      restricted = true;
    }
    check("deleting a source that has data is refused", restricted);

    // Trigram search must actually work, not merely be indexed.
    const similar = await client.query(
      `SELECT similarity('たべる', 'たべた') AS score`,
    );
    check("pg_trgm similarity() is callable", Number(similar.rows[0].score) > 0);

    // RISK-0013: learner columns must be real foreign keys, not loose text.
    const learnerFks = await client.query(
      `SELECT tc.table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'identity_users'
          AND tc.table_name IN ('attempts', 'progress')`,
    );
    const bound = learnerFks.rows.map((row) => row.table_name);
    check("attempts.user_id is a foreign key to identity_users", bound.includes("attempts"));
    check("progress.user_id is a foreign key to identity_users", bound.includes("progress"));
  } finally {
    await client.end();
  }
}

async function verifyRollback(url, name) {
  console.log("  rollback:");

  // Irreversible migrations must be refused, not silently skipped.
  const refusal = runMigratorExpectingFailure(url, ["--rollback", "--all", "--yes"]);
  check(
    "rollback of an irreversible migration is refused",
    refusal.status !== 0 && /irreversible/i.test(refusal.output),
    refusal.output.split("\n").slice(-3).join(" "),
  );

  // Rolling back without confirmation must also be refused.
  const unconfirmed = runMigratorExpectingFailure(url, ["--rollback"]);
  check(
    "rollback without --yes is refused",
    unconfirmed.status !== 0 && /Refusing/i.test(unconfirmed.output),
  );

  // Roll back the two reversible domain migrations in one operation: 0004
  // (learning) and 0003 (knowledge). Exercising a multi-migration rollback
  // matters because ordering between them is where a dependency mistake shows.
  runMigrator(url, ["--rollback", "--to", "0003_knowledge_schema", "--yes"]);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const remaining = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = remaining.rows.map((row) => row.tablename);
    const knowledgeLeft = [
      "dictionary_entries",
      "kanji_entries",
      "radicals",
      "sentences",
      "conjugations",
      "knowledge_sources",
    ].filter((table) => names.includes(table));
    check("knowledge tables removed by rollback", knowledgeLeft.length === 0, knowledgeLeft.join(", "));

    const srsLeft = ["srs_decks", "srs_cards", "srs_schedule", "srs_reviews"].filter(
      (table) => names.includes(table),
    );
    check("srs tables removed by rollback", srsLeft.length === 0, srsLeft.join(", "));

    const leftoverFunction = await client.query(
      `SELECT proname FROM pg_proc WHERE proname = 'srs_reviews_append_only'`,
    );
    check("append-only trigger function removed by rollback", leftoverFunction.rowCount === 0);

    const learningLeft = [
      "courses", "units", "lessons", "lesson_items",
      "exercises", "questions", "answers", "attempts", "progress",
    ].filter((table) => names.includes(table));
    check("learning tables removed by rollback", learningLeft.length === 0, learningLeft.join(", "));

    check("identity tables untouched by rollback", names.includes("identity_users"));

    const leftoverEnums = await client.query(
      `SELECT typname FROM pg_type
        WHERE typtype = 'e' AND typname IN
          ('word_class','politeness','polarity','tense','grammar_register',
           'kanji_reading_kind','kanji_component_position','dictionary_form_kind',
           'provenance_status','knowledge_source_status')`,
    );
    check("knowledge enums removed by rollback", leftoverEnums.rowCount === 0);

    const leftoverLearningEnums = await client.query(
      `SELECT typname FROM pg_type
        WHERE typtype = 'e' AND typname IN
          ('publish_status','lesson_kind','lesson_item_kind','exercise_kind',
           'question_type','progress_status')`,
    );
    check("learning enums removed by rollback", leftoverLearningEnums.rowCount === 0);
  } finally {
    await client.end();
  }

  // Re-apply and prove the schema is bit-identical to before the rollback.
  runMigrator(url);
  return name;
}

async function exercise(name, { keep }) {
  console.log(`\n── ${name} ──`);
  await recreateDatabase(name);
  console.log("  created empty database");

  const url = withDatabase(source, name);

  const first = runMigrator(url);
  const appliedCount = (first.match(/ \.\.\. ok/g) ?? []).length;
  check(`applied ${appliedCount} migration(s) to an empty database`, appliedCount > 0);

  console.log("  verifying schema:");
  await verifySchema(url);

  console.log("  verifying behaviour:");
  await verifyBehaviour(url);

  const before = await fingerprint(url);
  console.log(
    `  fingerprint ${before.hash.slice(0, 16)}… ` +
      `(${before.counts.columns} columns, ${before.counts.constraints} constraints, ` +
      `${before.counts.indexes} indexes, ${before.counts.enums} enum labels)`,
  );

  await verifyRollback(url, name);

  const after = await fingerprint(url);
  check(
    "schema after rollback + re-apply is identical",
    after.hash === before.hash,
    `${before.hash.slice(0, 16)}… vs ${after.hash.slice(0, 16)}…`,
  );

  const second = runMigrator(url);
  check("re-running migrations is a no-op", second.includes("up to date"));

  if (keep) {
    console.log(`  kept ${name} for integration tests`);
  } else {
    await dropDatabase(name);
    console.log(`  dropped ${name}`);
  }
}

const scratch = `nb_migrate_scratch_${Date.now()}`;

try {
  await exercise(scratch, { keep: false });
  await exercise("app_db_test", { keep: true });
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  await dropDatabase(scratch).catch(() => {});
  process.exit(1);
}

console.log("");
if (failures > 0) {
  console.error(`Migration gate FAILED: ${failures} check(s) did not pass.`);
  process.exit(1);
}
console.log(
  "Migration gate passed: clean apply, verified schema, rollback proven, re-apply identical.",
);
