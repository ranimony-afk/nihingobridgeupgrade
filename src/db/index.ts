import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";

const globalForDb = globalThis as typeof globalThis & {
  __nihongoBridgePostgresPool?: Pool;
};

const databaseHost = new URL(env.DATABASE_URL).hostname;
const useSsl =
  env.NODE_ENV === "production" &&
  databaseHost !== "localhost" &&
  databaseHost !== "127.0.0.1";

export const pool =
  globalForDb.__nihongoBridgePostgresPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: useSsl ? { rejectUnauthorized: true } : undefined,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.__nihongoBridgePostgresPool = pool;
}

export const db = drizzle(pool);
