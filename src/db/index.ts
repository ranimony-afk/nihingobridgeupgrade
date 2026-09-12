import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { serverEnv } from "@/config/env";

// Configuration is read through the validated config module so there is
// exactly one place that touches process.env. A missing or malformed
// DATABASE_URL fails here with the full, aggregated diagnostic.
const { database } = serverEnv();

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: database.url,
    max: database.poolMax,
    ...(database.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
