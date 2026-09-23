import "server-only";

import { db } from "@/db";
import { CmsService } from "./cmsService";
import type { CmsDatabase } from "./types";
import { createDrizzleCmsStore } from "./drizzleStore";

/**
 * Request-scoped CmsService factory — Phase 13.5A.
 *
 * CMS API routes are thin adapters: they obtain the service here and call
 * exactly one workflow method. Production wires the Drizzle adapter over
 * the three CMS tables (canonical tables stay read-only inside the
 * publication guard); deterministic tests inject the in-memory fake via
 * the override below. The production store is built lazily so importing
 * this module never touches the database.
 */

let databaseOverride: CmsDatabase | null = null;

/** Test seam (mirrors setActorResolver): inject a CmsDatabase double. */
export function setCmsDatabaseOverride(database: CmsDatabase): void {
  databaseOverride = database;
}

/** Restore production wiring. Used for test isolation. */
export function resetCmsDatabaseOverride(): void {
  databaseOverride = null;
}

/** The CmsService for the current request. Cheap: the service holds no state. */
export function getCmsService(): CmsService {
  return new CmsService(
    databaseOverride ?? createDrizzleCmsStore(db)
  );
}
