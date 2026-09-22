import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Canonical server-only database client.
 *
 * Import graph: only route handlers, force-dynamic server pages, and
 * `src/services/*` modules import this file. The `server-only` marker turns
 * any accidental client-component import into an immediate, explicit build
 * error instead of a leaked credential or a confusing runtime failure.
 *
 * Lazy by design:
 * - The PostgreSQL pool is created on first query, not at module
 *   evaluation. Build workers (and Vercel) may import route/page modules
 *   during `next build` without a configured `DATABASE_URL`; nothing in
 *   this repository queries the database at build time.
 * - Configuration validation is NOT weakened: the moment a query is
 *   attempted without `DATABASE_URL`, the original error is thrown.
 *
 * Implementation note: `drizzle()` inspects `client.constructor` at wrap
 * time (`isConfig` in drizzle-orm) to distinguish a client from a config
 * object. When no database is configured, the proxy therefore still
 * answers `constructor` truthfully (`Pool`) and defers the configuration
 * error to the first real pool method call (`query` / `connect` / `end`).
 */

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/** Module-level singleton for production (global cache is for dev HMR). */
let productionPool: Pool | undefined;

function createPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // The Supabase transaction pooler presents a certificate chain that does
    // not terminate in a root inside the Node.js trust store, so full chain
    // verification fails with SELF_SIGNED_CERT_IN_CHAIN.
    //
    // This must stay an explicit Pool option rather than a DSN parameter:
    // `pg` builds its config with
    //     Object.assign({}, config, parse(connectionString))
    // so any `sslmode` in DATABASE_URL overwrites this option. DATABASE_URL
    // therefore carries no sslmode / sslrootcert / sslcert / sslkey.
    //
    // TLS remains enabled; only server-certificate authentication is relaxed
    // (libpq `require` semantics). This is scoped to the database connection
    // and is not a global bypass such as NODE_TLS_REJECT_UNAUTHORIZED.
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

/** Real cached pool when configured; `undefined` when DATABASE_URL is absent. */
function resolvePool(): Pool | undefined {
  if (!process.env.DATABASE_URL) return undefined;

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool ??= createPool();
    return globalForDb.__arenaNextJsPostgresqlPool;
  }
  productionPool ??= createPool();
  return productionPool;
}

function throwUnconfigured(): never {
  throw new Error("DATABASE_URL is required");
}

/** Pool methods that constitute real database access. */
const ACCESS_METHODS = new Set<PropertyKey>(["query", "connect", "end", "release"]);

export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const realPool = resolvePool();

    if (!realPool) {
      // Unconfigured build/import-time path: satisfy introspection, defer
      // the failure to the first real access.
      if (property === "constructor") return Pool;
      if (ACCESS_METHODS.has(property)) return throwUnconfigured;
      return undefined;
    }

    const value = Reflect.get(realPool, property);
    return typeof value === "function" ? value.bind(realPool) : value;
  },
});

export const db = drizzle(pool);
