/**
 * Dictionary Loader — Phase 14.2.
 *
 * Provides batch persistence utilities for dictionary entries.
 * Reuses the DictionaryPersistenceAdapter foundation while preserving
 * full backward compatibility with existing tests and scripts.
 */

import { db } from "@/db";
import { knowledgeSources as sourceTable } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  type BatchLoadResult,
  type CanonicalDictionaryEntry,
  type DictionaryPersistenceAdapter,
  JMDICT_KNOWLEDGE_SOURCE,
} from "./types";
import {
  DrizzleDictionaryPersistenceAdapter,
} from "./persistenceAdapter";

export { type BatchLoadResult } from "./types";

export class DictionaryLoader {
  private static defaultAdapter: DictionaryPersistenceAdapter =
    new DrizzleDictionaryPersistenceAdapter();

  /**
   * Sets a custom persistence adapter (e.g. InMemoryDictionaryPersistenceAdapter for tests).
   */
  static setAdapter(adapter: DictionaryPersistenceAdapter): void {
    this.defaultAdapter = adapter;
  }

  /**
   * Resets to the default production adapter.
   */
  static resetAdapter(): void {
    this.defaultAdapter = new DrizzleDictionaryPersistenceAdapter();
  }

  /**
   * Ensures the knowledge_sources row for JMdict is present before importing.
   */
  static async ensureSource(recordCount: number = 0): Promise<void> {
    const existing = await db
      .select({ id: sourceTable.id })
      .from(sourceTable)
      .where(eq(sourceTable.id, JMDICT_KNOWLEDGE_SOURCE.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(sourceTable).values({
        id: JMDICT_KNOWLEDGE_SOURCE.id,
        name: JMDICT_KNOWLEDGE_SOURCE.name,
        version: JMDICT_KNOWLEDGE_SOURCE.version,
        license: JMDICT_KNOWLEDGE_SOURCE.license,
        url: JMDICT_KNOWLEDGE_SOURCE.url,
        description: JMDICT_KNOWLEDGE_SOURCE.description,
        domain: JMDICT_KNOWLEDGE_SOURCE.domain,
        recordCount,
      });
    } else {
      await db
        .update(sourceTable)
        .set({
          recordCount: sql`GREATEST(${sourceTable.recordCount}, ${recordCount})`,
        })
        .where(eq(sourceTable.id, JMDICT_KNOWLEDGE_SOURCE.id));
    }
  }

  /**
   * Loads a batch of canonical dictionary entries idempotently.
   * Compares existing records to update or skip unchanged rows.
   */
  static async loadBatch(
    entries: CanonicalDictionaryEntry[],
    options: { dryRun?: boolean; adapter?: DictionaryPersistenceAdapter; conflictPolicy?: "abort" | "update" } = {}
  ): Promise<BatchLoadResult> {
    const adapter = options.adapter || this.defaultAdapter;
    return await adapter.upsertBatch(entries, {
      dryRun: options.dryRun,
      conflictPolicy: options.conflictPolicy ?? "abort",
    });
  }
}
