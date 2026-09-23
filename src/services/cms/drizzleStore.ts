import "server-only";

import { and, asc, desc, eq, ilike } from "drizzle-orm";
import type { db } from "@/db";
import {
  cmsAuditLog,
  cmsContentItems,
  cmsContentVersions,
  dictionaryEntries,
  exampleSentences,
  grammarPatterns,
  jlptTests,
  kanjiEntries,
  kanjiRadicals,
  questions,
} from "@/db/schema";
import { TranslationService } from "@/services/translation/translationService";
import type {
  CmsAuditInsert,
  CmsAuditRecord,
  CmsContentType,
  CmsDatabase,
  CmsItemInsert,
  CmsItemRecord,
  CmsStore,
  ListContentItemsFilter,
  VerifiedTranslationWrite,
  CmsVersionInsert,
  CmsVersionRecord,
} from "./types";
import { CmsError } from "./errors";

/**
 * Drizzle implementation of the CmsStore port — Phase 13.3B.
 *
 * First repository use of db.transaction(): each workflow mutation runs
 * inside one transaction (item update + version snapshot + audit event),
 * so partial states (status changed without audit, version without status)
 * are impossible. The ONLY canonical-table access is the publication-guard
 * existence check — the adapter never writes outside the three CMS tables.
 */

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: unknown } | null)?.code ??
    (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === "23505";
}

async function existsById(
  executor: Executor,
  table:
    | typeof dictionaryEntries
    | typeof kanjiEntries
    | typeof kanjiRadicals
    | typeof grammarPatterns
    | typeof exampleSentences
    | typeof jlptTests
    | typeof questions,
  id: string
): Promise<boolean> {
  const rows = await executor
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return rows.length > 0;
}

function storeFor(executor: Executor): CmsStore {
  return {
    async getContentItem(id: string): Promise<CmsItemRecord | null> {
      const rows = await executor
        .select()
        .from(cmsContentItems)
        .where(eq(cmsContentItems.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async listContentItems(
      filter: ListContentItemsFilter
    ): Promise<CmsItemRecord[]> {
      const conditions = [
        ...(filter.contentType !== undefined
          ? [eq(cmsContentItems.contentType, filter.contentType)]
          : []),
        ...(filter.status !== undefined
          ? [eq(cmsContentItems.status, filter.status)]
          : []),
        // LIKE metacharacters are escaped: q is always a literal substring.
        ...(filter.q !== undefined
          ? [
              ilike(
                cmsContentItems.title,
                `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
              ),
            ]
          : []),
      ];
      return executor
        .select()
        .from(cmsContentItems)
        .where(
          conditions.length > 0 ? and(...conditions) : undefined
        )
        .orderBy(desc(cmsContentItems.updatedAt))
        .limit(filter.limit)
        .offset(filter.offset);
    },

    async insertContentItem(row: CmsItemInsert): Promise<void> {
      await executor.insert(cmsContentItems).values(row);
    },

    async updateContentItem(
      id: string,
      patch: Partial<CmsItemInsert> & { updatedAt: Date }
    ): Promise<void> {
      await executor
        .update(cmsContentItems)
        .set(patch)
        .where(eq(cmsContentItems.id, id));
    },

    async insertContentVersion(row: CmsVersionInsert): Promise<void> {
      try {
        await executor.insert(cmsContentVersions).values(row);
      } catch (error) {
        // Two writers racing past the optimistic check with the same
        // version number: the unique(content_item_id, version_number)
        // constraint is the final arbiter — surface it as a 409 conflict
        // rather than a 500.
        if (isUniqueViolation(error)) {
          throw CmsError.versionConflict(row.versionNumber, row.versionNumber);
        }
        throw error;
      }
    },

    async listContentVersions(itemId: string): Promise<CmsVersionRecord[]> {
      return executor
        .select()
        .from(cmsContentVersions)
        .where(eq(cmsContentVersions.contentItemId, itemId))
        .orderBy(asc(cmsContentVersions.versionNumber));
    },

    async upsertVerifiedTranslation(
      input: VerifiedTranslationWrite
    ): Promise<{ id: string }> {
      // Single-writer rule: the SQL lives in TranslationService; the CMS
      // adapter only supplies this transaction's executor so the write
      // commits atomically with publication. Always verified_human.
      const row = await TranslationService.addTranslation(
        {
          entityType: input.entityType,
          entityId: input.entityId,
          language: input.language,
          translatedText: input.translatedText,
          secondaryText: input.secondaryText,
          contextNotes: input.contextNotes,
          sourceType: "verified_human",
          sourceRef: input.sourceRef,
          isVerified: true,
        },
        executor
      );
      return { id: row.id };
    },

    async insertAuditEvent(row: CmsAuditInsert): Promise<void> {
      await executor.insert(cmsAuditLog).values(row);
    },

    async listAuditEvents(itemId: string): Promise<CmsAuditRecord[]> {
      return executor
        .select()
        .from(cmsAuditLog)
        .where(eq(cmsAuditLog.contentItemId, itemId))
        .orderBy(asc(cmsAuditLog.occurredAt));
    },

    async canonicalEntityExists(
      contentType: CmsContentType,
      entityId: string
    ): Promise<boolean> {
      switch (contentType) {
        case "dictionary":
          return existsById(executor, dictionaryEntries, entityId);
        case "kanji":
          return existsById(executor, kanjiEntries, entityId);
        case "radical":
          return existsById(executor, kanjiRadicals, entityId);
        case "grammar":
          return existsById(executor, grammarPatterns, entityId);
        case "sentence":
          return existsById(executor, exampleSentences, entityId);
        case "jlpt":
          // `jlpt` overlays may reference a mock test or a bank question.
          return (
            (await existsById(executor, jlptTests, entityId)) ||
            (await existsById(executor, questions, entityId))
          );
        case "article":
        case "learning_resource":
          // No canonical tables exist for these types; validation rejects
          // non-null entityId before this is ever consulted.
          return false;
        case "translation":
          // Translation items never reach the generic publication guard
          // (publish()/schedule() reject them); their linkage validates
          // via the proposal's own entityType at verification. Fail closed.
          return false;
      }
    },
  };
}

/** Build the production CmsDatabase over a Drizzle node-postgres client. */
export function createDrizzleCmsStore(database: Database): CmsDatabase {
  const root = storeFor(database);
  return {
    ...root,
    async transaction<T>(fn: (tx: CmsStore) => Promise<T>): Promise<T> {
      return database.transaction(async (tx) => fn(storeFor(tx)));
    },
  };
}
