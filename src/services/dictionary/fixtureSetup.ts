import { pool } from "@/db";
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
  // variables. Require an explicit user and port, and refuse all options and
  // multi-segment paths so the classifier and driver agree about the target.
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username || !url.port || Number(url.port) < 1 ||
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

  let target;
  try {
    target = classifyPlainDisposableUrl(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Dictionary fixture setup requires a plain, valid disposable database target");
  }

  if (target.classification !== "DISPOSABLE" || target.decision !== "ALLOW") {
    throw new Error("Dictionary fixture setup requires an explicitly classified disposable database");
  }

  // The application pool is cached. Refuse a changed environment that would
  // classify one target while the already-created pool points somewhere else.
  const activeTarget = classifyPlainDisposableUrl(pool.options.connectionString ?? "");
  if (activeTarget.decision !== "ALLOW" || activeTarget.identityHash !== target.identityHash) {
    throw new Error("Dictionary fixture setup refused a mismatched database pool");
  }

  await KnowledgeCorpusService.ensureSeeded();
  await KnowledgeService.ensureSeeded();
}
