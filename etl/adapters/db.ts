/**
 * Database adapter — provides Drizzle access for ETL pipelines.
 *
 * ETL scripts import this instead of @/db to avoid Next.js bundling.
 * Uses the same DATABASE_URL but creates its own pool.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    const url =
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
    _pool = new Pool({ connectionString: url, max: 10 });
  }
  return _pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export { schema };
