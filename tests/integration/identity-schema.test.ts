/**
 * Integration — the identity schema as migrations actually created it.
 *
 * These assertions run against the real database, so they catch drift between
 * `src/db/schema.ts` and the SQL that was applied. A schema file that no longer
 * matches the deployed database is a silent, expensive class of bug.
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

const IDENTITY_TABLES = [
  "identity_users",
  "identity_credentials",
  "identity_sessions",
  "identity_user_roles",
  "identity_profiles",
  "identity_preferences",
];

test("every identity table exists", async () => {
  const result = await db.pool.query(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows.map((row: { tablename: string }) => row.tablename);
  for (const table of IDENTITY_TABLES) {
    assert.ok(tables.includes(table), `missing table: ${table}`);
  }
});

test("migrations are recorded in the journal", async () => {
  const count = await scalar<string>(
    db.pool,
    `select count(*) from drizzle.__drizzle_migrations`,
  );
  // Baseline, profiles/preferences, and the backfill.
  assert.ok(Number(count) >= 3, `expected >= 3 migrations, found ${count}`);
});

test("every user has exactly one profile and one preferences row", async () => {
  // The backfill plus transactional creation should make orphans impossible.
  const missing = await scalar<string>(
    db.pool,
    `select count(*) from identity_users u
      where not exists (select 1 from identity_profiles p where p.user_id = u.id)
         or not exists (select 1 from identity_preferences f where f.user_id = u.id)`,
  );
  assert.equal(Number(missing), 0, "found users without a profile or preferences");
});

test("profile rows are unique per user", async () => {
  const duplicates = await scalar<string>(
    db.pool,
    `select count(*) from (
       select user_id from identity_profiles group by user_id having count(*) > 1
     ) d`,
  );
  assert.equal(Number(duplicates), 0);
});

test("JLPT levels outside 1–5 are rejected by the database", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('t_jlpt', 'jlpt-check@test.invalid', 'T')`,
    );
    await client.query(`insert into identity_profiles (id, user_id) values ('t_jlpt_p', 't_jlpt')`);

    for (const bad of [0, 6, -1, 99]) {
      await assert.rejects(
        () =>
          client.query(`update identity_profiles set target_jlpt_level = $1 where id = 't_jlpt_p'`, [
            bad,
          ]),
        `level ${bad} should be rejected`,
      );
      await client.query("rollback to savepoint_none").catch(() => {});
      await client.query("begin").catch(() => {});
    }
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
});

test("valid JLPT levels 1–5 are accepted", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('t_ok', 'jlpt-ok@test.invalid', 'T')`,
    );
    await client.query(`insert into identity_profiles (id, user_id) values ('t_ok_p', 't_ok')`);

    for (const level of [1, 2, 3, 4, 5]) {
      await client.query(`update identity_profiles set target_jlpt_level = $1 where id = 't_ok_p'`, [
        level,
      ]);
    }
    const stored = await client.query(
      `select target_jlpt_level from identity_profiles where id = 't_ok_p'`,
    );
    assert.equal(stored.rows[0].target_jlpt_level, 5);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("preference bounds are enforced", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('t_pref', 'pref-check@test.invalid', 'T')`,
    );
    await client.query(`insert into identity_preferences (id, user_id) values ('t_pref_p', 't_pref')`);

    await assert.rejects(() =>
      client.query(`update identity_preferences set daily_goal_minutes = 0 where id = 't_pref_p'`),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("deleting a user cascades to profile, preferences, sessions and roles", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('t_cascade', 'cascade@test.invalid', 'T')`,
    );
    await client.query(`insert into identity_profiles (id, user_id) values ('t_c_prof', 't_cascade')`);
    await client.query(`insert into identity_preferences (id, user_id) values ('t_c_pref', 't_cascade')`);
    await client.query(
      `insert into identity_user_roles (id, user_id, role) values ('t_c_role', 't_cascade', 'learner')`,
    );

    await client.query(`delete from identity_users where id = 't_cascade'`);

    const remaining = await client.query(
      `select
         (select count(*) from identity_profiles where user_id = 't_cascade') as profiles,
         (select count(*) from identity_preferences where user_id = 't_cascade') as prefs,
         (select count(*) from identity_user_roles where user_id = 't_cascade') as roles`,
    );
    const row = remaining.rows[0];
    assert.equal(Number(row.profiles), 0);
    assert.equal(Number(row.prefs), 0);
    assert.equal(Number(row.roles), 0);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("profile and preference defaults match the documented contract", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('t_def', 'defaults@test.invalid', 'T')`,
    );
    await client.query(`insert into identity_profiles (id, user_id) values ('t_def_prof', 't_def')`);
    await client.query(`insert into identity_preferences (id, user_id) values ('t_def_pref', 't_def')`);

    const profile = await client.query(
      `select timezone, locale, visibility from identity_profiles where id = 't_def_prof'`,
    );
    assert.equal(profile.rows[0].timezone, "UTC");
    assert.equal(profile.rows[0].locale, "en");
    assert.equal(profile.rows[0].visibility, "private");

    const preferences = await client.query(
      `select theme, furigana_mode, show_romaji, daily_goal_minutes, srs_daily_new_limit
         from identity_preferences where id = 't_def_pref'`,
    );
    const row = preferences.rows[0];
    assert.equal(row.theme, "system");
    assert.equal(row.furigana_mode, "hover");
    assert.equal(row.show_romaji, false);
    assert.equal(row.daily_goal_minutes, 15);
    assert.equal(row.srs_daily_new_limit, 20);
  } finally {
    await client.query("rollback");
    client.release();
  }
});
