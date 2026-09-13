import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazily created Postgres pool + Drizzle client.
 *
 * Nothing here touches the network or reads `process.env` at module scope:
 *  - `next build` imports every module, and a missing `DATABASE_URL` must not
 *    fail the (Vercel) build — only a request that actually needs data.
 *  - Serverless runtimes create connections per invocation, not at cold-boot.
 */

const globalForDb = globalThis as typeof globalThis & {
  __nihongoBridgePool?: Pool;
  __nihongoBridgeDb?: NodePgDatabase;
};

export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL is not set. Add it to .env (local) or to the Vercel project environment variables.";

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Hosted Postgres (Supabase, Neon, RDS, …) requires TLS; localhost does not. */
function sslConfig(url: string): { rejectUnauthorized: boolean } | undefined {
  if (/[?&]sslmode=disable/.test(url)) return undefined;
  const isLocal = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  if (isLocal && !/[?&]sslmode=/.test(url)) return undefined;
  return { rejectUnauthorized: false };
}

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(MISSING_DATABASE_URL_MESSAGE);

  if (!globalForDb.__nihongoBridgePool) {
    const pool = new Pool({
      connectionString: url,
      ssl: sslConfig(url),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    // Never let a pool-level error crash the serverless function.
    pool.on("error", (error) => {
      console.error("[db] pool error", error.message);
    });
    globalForDb.__nihongoBridgePool = pool;
  }
  return globalForDb.__nihongoBridgePool;
}

export function getDb(): NodePgDatabase {
  if (!globalForDb.__nihongoBridgeDb) {
    globalForDb.__nihongoBridgeDb = drizzle(getPool());
  }
  return globalForDb.__nihongoBridgeDb;
}

/**
 * `pool` keeps the historical import style (`pool.query(...)`) working, but the
 * real pool is only created on first property access.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    if (typeof property === "symbol" || property === "then") return undefined;
    if (property === "options") return { max: Number(process.env.DATABASE_POOL_MAX ?? 5) };
    const instance = getPool();
    const value = Reflect.get(instance, property, receiver) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * `db` is the Drizzle client used by every repository. The client (and the pool
 * behind it) are created on first use, never during module evaluation.
 */
export const db = new Proxy({} as NodePgDatabase, {
  has(_target, property) {
    // Drizzle probes the client to decide how to build its session.
    return typeof property === "string" && property !== "then";
  },
  get(_target, property, receiver) {
    if (typeof property === "symbol" || property === "then") return undefined;
    const instance = getDb();
    const value = Reflect.get(instance, property, receiver) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
