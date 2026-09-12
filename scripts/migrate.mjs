#!/usr/bin/env node
/**
 * Migration runner — forward and rollback.
 *
 * Migrations, not `drizzle-kit push`, are the only mechanism that changes a
 * deployed schema (DATABASE_OWNERSHIP §6).
 *
 * ROLLBACK MODEL
 * --------------
 * drizzle-kit generates forward SQL only. Each migration therefore has a
 * hand-written partner in drizzle/rollback/<tag>.down.sql, and every down
 * script declares its own safety metadata in a header:
 *
 *   @reversible: yes | no
 *   @drops-data: <description>
 *
 * DATABASE_OWNERSHIP forbids DROP without an authorising decision. A reviewed
 * down script IS that authorisation, recorded at write time rather than
 * improvised during an incident — which is exactly when improvising is worst.
 *
 * Usage:
 *   node scripts/migrate.mjs                     apply pending
 *   node scripts/migrate.mjs --status            list state
 *   node scripts/migrate.mjs --baseline <tag>    record without executing
 *   node scripts/migrate.mjs --rollback          roll back the last migration
 *   node scripts/migrate.mjs --rollback --to <tag>   roll back down to (and
 *                                                    including) <tag>
 *   node scripts/migrate.mjs --rollback --all    roll back everything
 *   ... add --yes to skip the confirmation prompt (required in scripts)
 *   node scripts/migrate.mjs --url <dsn>         target a specific database
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { config as loadDotenv } from "dotenv";
import pg from "pg";

loadDotenv({ path: ".env", override: false, quiet: true });

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
const ROLLBACK_DIR = path.join(MIGRATIONS_DIR, "rollback");
const JOURNAL = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(name);

const databaseUrl = arg("--url") ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set and --url was not supplied.");
  process.exit(1);
}

function splitStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !/^(--[^\n]*\n?)*$/.test(statement));
}

/** Read a down script and the safety metadata declared in its header. */
async function loadRollback(tag) {
  const file = path.join(ROLLBACK_DIR, `${tag}.down.sql`);
  let sql;
  try {
    sql = await readFile(file, "utf8");
  } catch {
    return null;
  }

  const reversible = !/^--\s*@reversible:\s*no\b/im.test(sql);
  const dropsData = /^--\s*@drops-data:\s*(.+)$/im.exec(sql)?.[1]?.trim() ?? null;
  const reason = /^--\s*@reason:\s*(.+)$/im.exec(sql)?.[1]?.trim() ?? null;

  return { file, sql, reversible, dropsData, reason, statements: splitStatements(sql) };
}

async function loadMigrations() {
  const journal = JSON.parse(await readFile(JOURNAL, "utf8"));
  return Promise.all(
    journal.entries.map(async (entry) => {
      const sql = await readFile(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
      return {
        tag: entry.tag,
        when: entry.when,
        hash: createHash("sha256").update(sql).digest("hex"),
        statements: splitStatements(sql),
      };
    }),
  );
}

async function ensureJournalTable(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function appliedHashes(client) {
  const result = await client.query(`SELECT hash FROM "drizzle"."__drizzle_migrations"`);
  return new Set(result.rows.map((row) => row.hash));
}

/** Count rows in tables a down script will drop, so the operator sees the cost. */
async function countRowsAtRisk(client, statements) {
  const tables = statements
    .map((statement) => /DROP TABLE IF EXISTS "([^"]+)"/i.exec(statement)?.[1])
    .filter(Boolean);

  const counts = [];
  for (const table of tables) {
    try {
      const result = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
      if (result.rows[0].n > 0) counts.push({ table, rows: result.rows[0].n });
    } catch {
      // Table absent: nothing at risk.
    }
  }
  return counts;
}

async function runForward(client, migrations, applied) {
  const pending = migrations.filter((migration) => !applied.has(migration.hash));
  if (pending.length === 0) {
    console.log(`Database is up to date (${migrations.length} migrations).`);
    return;
  }

  console.log(`Applying ${pending.length} migration(s):`);
  for (const migration of pending) {
    process.stdout.write(`  ${migration.tag} ... `);
    await client.query("BEGIN");
    try {
      for (const statement of migration.statements) await client.query(statement);
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, migration.when],
      );
      await client.query("COMMIT");
      console.log("ok");
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw error;
    }
  }
  console.log("Migrations complete.");
}

async function runRollback(client, migrations, applied) {
  // Newest first: a rollback undoes in reverse order.
  const appliedInOrder = migrations.filter((migration) => applied.has(migration.hash)).reverse();

  if (appliedInOrder.length === 0) {
    console.log("Nothing to roll back.");
    return;
  }

  const target = arg("--to");
  let selected;
  if (hasFlag("--all")) {
    selected = appliedInOrder;
  } else if (target) {
    const index = appliedInOrder.findIndex((migration) => migration.tag === target);
    if (index === -1) {
      throw new Error(`Migration "${target}" is not applied, so it cannot be rolled back.`);
    }
    selected = appliedInOrder.slice(0, index + 1);
  } else {
    selected = [appliedInOrder[0]];
  }

  // Resolve and vet every down script before executing any of them.
  const plan = [];
  for (const migration of selected) {
    const rollback = await loadRollback(migration.tag);
    if (!rollback) {
      throw new Error(
        `No rollback script for "${migration.tag}". ` +
          `Expected drizzle/rollback/${migration.tag}.down.sql`,
      );
    }
    if (!rollback.reversible) {
      throw new Error(
        `"${migration.tag}" is declared irreversible.\n` +
          `  Reason: ${rollback.reason ?? "see the down script"}\n` +
          `  Roll back the migration below it instead, or restore from backup.`,
      );
    }
    plan.push({ migration, rollback });
  }

  console.log(`Rollback plan (${plan.length} migration(s), newest first):`);
  let atRisk = 0;
  for (const { migration, rollback } of plan) {
    const counts = await countRowsAtRisk(client, rollback.statements);
    atRisk += counts.reduce((total, entry) => total + entry.rows, 0);
    console.log(`  ${migration.tag}`);
    if (rollback.dropsData) console.log(`      drops: ${rollback.dropsData}`);
    for (const entry of counts) console.log(`      ${entry.table}: ${entry.rows} row(s)`);
  }

  if (!hasFlag("--yes")) {
    console.error(
      `\nRefusing to roll back without --yes.` +
        (atRisk > 0 ? ` ${atRisk} row(s) would be destroyed.` : ""),
    );
    process.exitCode = 1;
    return;
  }

  for (const { migration, rollback } of plan) {
    process.stdout.write(`  rolling back ${migration.tag} ... `);
    await client.query("BEGIN");
    try {
      for (const statement of rollback.statements) await client.query(statement);
      await client.query(`DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = $1`, [
        migration.hash,
      ]);
      await client.query("COMMIT");
      console.log("ok");
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw error;
    }
  }
  console.log("Rollback complete.");
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const { rows } = await client.query("select current_database() as db");
  console.log(`Database: ${rows[0].db}`);

  try {
    await ensureJournalTable(client);
    const migrations = await loadMigrations();
    const applied = await appliedHashes(client);

    if (hasFlag("--status")) {
      for (const migration of migrations) {
        const state = applied.has(migration.hash) ? "applied" : "pending";
        const rollback = await loadRollback(migration.tag);
        const note = !rollback
          ? " (no rollback script)"
          : rollback.reversible
            ? ""
            : " (irreversible)";
        console.log(`  [${state.padEnd(7)}] ${migration.tag}${note}`);
      }
      return;
    }

    const baselineTag = arg("--baseline");
    if (baselineTag) {
      const migration = migrations.find((entry) => entry.tag === baselineTag);
      if (!migration) throw new Error(`Unknown migration tag: ${baselineTag}`);
      if (applied.has(migration.hash)) {
        console.log(`Already recorded: ${migration.tag}`);
        return;
      }
      await client.query(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, migration.when],
      );
      console.log(`Baselined (recorded, not executed): ${migration.tag}`);
      return;
    }

    if (hasFlag("--rollback")) {
      await runRollback(client, migrations, applied);
      return;
    }

    await runForward(client, migrations, applied);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(`\nMigration error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
