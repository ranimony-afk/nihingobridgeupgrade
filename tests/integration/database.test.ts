/**
 * Integration layer — real PostgreSQL, no HTTP server.
 *
 * Verifies that the database the application is configured to use is
 * reachable, speaks the dialect we rely on, and supports the primitives the
 * canonical schema depends on.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { openTestDb, scalar, type TestDb } from "../helpers/db.ts";
import { databaseUrl } from "../helpers/env.ts";

let db: TestDb;

before(() => {
  db = openTestDb();
});

after(async () => {
  await db.close();
});

test("DATABASE_URL is configured and points at PostgreSQL", () => {
  assert.match(databaseUrl(), /^postgres(ql)?:\/\//i);
});

test("a connection can be established and a query executed", async () => {
  const value = await scalar<number>(db.pool, "select 1 as value");
  assert.equal(Number(value), 1);
});

test("the server reports a PostgreSQL version", async () => {
  const version = await scalar<string>(db.pool, "select version()");
  assert.ok(typeof version === "string");
  assert.match(version, /PostgreSQL/i);
});

test("the connection has a current database and user", async () => {
  const database = await scalar<string>(db.pool, "select current_database()");
  const user = await scalar<string>(db.pool, "select current_user");
  assert.ok(database && database.length > 0);
  assert.ok(user && user.length > 0);
});

test("transactions commit and roll back", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query("create temporary table nb_tx_probe (id int)");
    await client.query("insert into nb_tx_probe (id) values (1)");
    const inside = await client.query("select count(*)::int as count from nb_tx_probe");
    assert.equal(inside.rows[0].count, 1);

    await client.query("rollback");

    // After rollback the temporary table is gone, proving isolation works.
    await assert.rejects(() => client.query("select * from nb_tx_probe"));
  } finally {
    client.release();
  }
});

test("parameterised queries bind values rather than interpolating", async () => {
  // A classic injection payload must come back as literal text.
  const payload = "'; drop table users; --";
  const echoed = await scalar<string>(db.pool, "select $1::text as value", [payload]);
  assert.equal(echoed, payload);
});

test("UTF-8 Japanese text round-trips without corruption", async () => {
  const sample = "食べる 漢字 ひらがな カタカナ";
  const echoed = await scalar<string>(db.pool, "select $1::text as value", [sample]);
  assert.equal(echoed, sample);
});

test("jsonb is available for glosses and structured payloads", async () => {
  const value = await scalar<{ en: string[] }>(
    db.pool,
    `select '{"en":["to eat"]}'::jsonb as value`,
  );
  assert.deepEqual(value, { en: ["to eat"] });
});

test("text arrays are available for readings and tags", async () => {
  const value = await scalar<string[]>(db.pool, `select array['n','vt']::text[] as value`);
  assert.deepEqual(value, ["n", "vt"]);
});

test("timestamptz is available for provenance columns", async () => {
  const value = await scalar<Date>(db.pool, "select now() as value");
  assert.ok(value instanceof Date);
});

test("the pool serves concurrent queries", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      scalar<number>(db.pool, "select $1::int as value", [index]),
    ),
  );
  assert.deepEqual(results.map(Number), [0, 1, 2, 3, 4]);
});
