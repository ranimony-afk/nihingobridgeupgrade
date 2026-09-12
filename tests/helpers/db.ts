/**
 * Database helper for integration tests.
 *
 * Opens a small, short-lived pool against the real DATABASE_URL. Tests that
 * use it must close it in an `after` hook so the process exits cleanly.
 */

import { Pool } from "pg";

import { databaseUrl } from "./env.ts";

export interface TestDb {
  pool: Pool;
  close(): Promise<void>;
}

/** Open a pool sized for tests (2 connections is plenty). */
export function openTestDb(): TestDb {
  const pool = new Pool({
    connectionString: databaseUrl(),
    max: 2,
    // Fail fast instead of hanging a suite when the database is unreachable.
    connectionTimeoutMillis: 5_000,
  });

  return {
    pool,
    async close() {
      await pool.end();
    },
  };
}

/** Run a scalar query and return the first column of the first row. */
export async function scalar<T = unknown>(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await pool.query(sql, params);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const firstKey = Object.keys(row)[0];
  return firstKey === undefined ? null : (row[firstKey] as T);
}

/** True when the named PostgreSQL extension is installed. */
export async function hasExtension(pool: Pool, name: string): Promise<boolean> {
  const value = await scalar<string>(
    pool,
    "select extname from pg_extension where extname = $1",
    [name],
  );
  return value === name;
}
