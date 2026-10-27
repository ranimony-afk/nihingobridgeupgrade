import { pool } from "@/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { classifyDatabaseTarget } from "@/etl/dictionary/targetClassification";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

/**
 * Explicit first-party fixture setup for development and tests only.
 * Loopback is not sufficient authorization: the operator must also classify
 * the target as disposable and name the exact database. Never call this from
 * a learner-facing read path.
 */
function classifyPlainDisposableUrl(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Dictionary fixture setup requires a valid disposable database target");
  }
  // node-postgres accepts query parameters such as ?host= or ?port= that can
  // override the URL authority, while missing fields can fall back to PG* env
  // variables. Require explicit credentials and port, and refuse options and
  // multi-segment paths so the classifier and driver agree about the target.
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username || !url.password || !url.port || Number(url.port) < 1 ||
    url.search || url.hash || !/^\/[^/]+$/.test(url.pathname)
  ) {
    throw new Error("Dictionary fixture setup requires a plain disposable database URL without options");
  }
  return classifyDatabaseTarget({
    connectionString,
    declaredClass: process.env.NIHONGO_DB_TARGET_CLASS,
    expectedDatabase: process.env.NIHONGO_DB_EXPECTED_DATABASE,
  });
}

export async function seedDictionaryFixturesForDisposableDatabase(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dictionary fixture setup is unavailable in production");
  }
  // node-postgres passes PGOPTIONS through as server startup settings. They
  // can change search_path or role even when the target URL is explicit.
  if (process.env.PGOPTIONS) {
    throw new Error("Dictionary fixture setup requires PGOPTIONS to be unset");
  }

  const declaredUrl = process.env.DATABASE_URL ?? "";
  let target;
  let declaredPassword: string;
  try {
    target = classifyPlainDisposableUrl(declaredUrl);
    declaredPassword = decodeURIComponent(new URL(declaredUrl).password);
  } catch {
    throw new Error("Dictionary fixture setup requires a plain, valid disposable database target");
  }

  if (target.classification !== "DISPOSABLE" || target.decision !== "ALLOW") {
    throw new Error("Dictionary fixture setup requires an explicitly classified disposable database");
  }

  // The application pool is cached. Refuse a changed environment that would
  // classify one target while the already-created pool points somewhere else.
  const activePoolOptions = pool.options;
  const activeTarget = classifyPlainDisposableUrl(activePoolOptions.connectionString ?? "");
  if (
    activeTarget.decision !== "ALLOW" || activeTarget.identityHash !== target.identityHash ||
    activePoolOptions.connectionString !== declaredUrl
  ) {
    throw new Error("Dictionary fixture setup refused a mismatched database pool");
  }
  if (activePoolOptions.options) {
    throw new Error("Dictionary fixture setup refused database startup options");
  }

  // Verify the actual checked-out client too: a cached client may have been
  // opened with different PGOPTIONS before the environment was changed.
  const client = await pool.connect();
  try {
    const actual = (client as typeof client & {
      connectionParameters?: {
        host?: string; port?: number; database?: string; user?: string; password?: string; options?: string;
      };
    }).connectionParameters;
    if (
      !actual || actual.host !== target.host || String(actual.port) !== target.port ||
      actual.database !== target.database || actual.user !== target.user ||
      actual.password !== declaredPassword || actual.options
    ) {
      throw new Error("Dictionary fixture setup refused a mismatched or configured database client");
    }

    await drizzle(client).transaction(async (tx) => {
      // Do not inherit an altered search_path or role from a reused session.
      await tx.execute(sql`SET LOCAL search_path TO public`);
      const identity = await tx.execute<{ database: string; current_user: string; session_user: string }>(
        sql`SELECT pg_catalog.current_database() AS database, CURRENT_USER AS current_user, SESSION_USER AS session_user`
      );
      const actualIdentity = identity.rows[0];
      if (
        actualIdentity?.database !== target.database ||
        actualIdentity.current_user !== target.user || actualIdentity.session_user !== target.user
      ) {
        throw new Error("Dictionary fixture setup refused a mismatched database identity");
      }
      await KnowledgeCorpusService.ensureSeeded(tx);
      await KnowledgeService.ensureSeeded(tx);
    });
  } finally {
    // A setup client is disposable; never return potentially altered session
    // state to the shared pool, including after BEGIN/rollback failure.
    client.release(true);
  }
}
