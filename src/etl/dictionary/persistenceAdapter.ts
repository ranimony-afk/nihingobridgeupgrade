/**
 * Dictionary Persistence Adapter — Phase 14.2, safety contract tightened in 14.3D-R.
 *
 * Default conflict policy is abort. Identical rows are skipped. Absent rows are
 * inserted. Differing rows are updated only when conflictPolicy is explicitly
 * "update". Drizzle writes for one batch run inside a single transaction.
 */

import { db } from "@/db";
import { dictionaryEntries as dictionaryTable } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type {
  DictionaryPersistenceAdapter,
  PersistenceBatchResult,
  PersistenceCandidate,
} from "./types";
import {
  areArraysEqual,
  areSensesEqual,
  planPersistence,
  resolveConflictPolicy,
  type ConflictPolicy,
} from "./persistencePlan";

export { areArraysEqual, areSensesEqual };

export interface PersistenceWriteOptions {
  dryRun?: boolean;
  conflictPolicy?: ConflictPolicy;
  /** Test-only fault injection. The CLI cannot set this. */
  injectFailureAfterWrites?: boolean;
}

function conflictAbortError(ids: string[]): Error {
  return new Error(`[CONFLICT] ABORT: ${ids.join(",")} differs from the persisted canonical payload`);
}

/**
 * In-Memory persistence adapter for tests, CI, and dry-run validation.
 * Zero database connection required.
 */
export class InMemoryDictionaryPersistenceAdapter
  implements DictionaryPersistenceAdapter
{
  private store = new Map<string, PersistenceCandidate>();

  async upsertBatch(
    candidates: PersistenceCandidate[],
    options: PersistenceWriteOptions = {},
  ): Promise<PersistenceBatchResult> {
    if (candidates.length === 0) {
      return { batchSize: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    if (options.dryRun) {
      return {
        batchSize: candidates.length,
        inserted: candidates.length,
        updated: 0,
        skipped: 0,
      };
    }

    const policy = resolveConflictPolicy(options.conflictPolicy);
    const plan = planPersistence(candidates, this.store);
    if (policy === "abort" && plan.conflicts.length > 0) {
      throw conflictAbortError(plan.conflicts.map((row) => row.id));
    }
    if (options.injectFailureAfterWrites) {
      throw new Error("injected persistence failure");
    }

    for (const candidate of plan.inserts) {
      this.store.set(candidate.id, { ...candidate });
    }
    if (policy === "update") {
      for (const candidate of plan.conflicts) {
        this.store.set(candidate.id, { ...candidate });
      }
    }

    return {
      batchSize: candidates.length,
      inserted: plan.inserts.length,
      updated: policy === "update" ? plan.conflicts.length : 0,
      skipped: plan.identical.length,
    };
  }

  async getExistingByIds(
    ids: string[]
  ): Promise<Map<string, PersistenceCandidate>> {
    const result = new Map<string, PersistenceCandidate>();
    for (const id of ids) {
      const entry = this.store.get(id);
      if (entry) {
        result.set(id, { ...entry });
      }
    }
    return result;
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Production Drizzle PostgreSQL persistence adapter.
 * One upsertBatch call is one transaction. A thrown error rolls the batch back.
 */
export class DrizzleDictionaryPersistenceAdapter
  implements DictionaryPersistenceAdapter
{
  async upsertBatch(
    candidates: PersistenceCandidate[],
    options: PersistenceWriteOptions = {},
  ): Promise<PersistenceBatchResult> {
    if (candidates.length === 0) {
      return { batchSize: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    if (options.dryRun) {
      return {
        batchSize: candidates.length,
        inserted: candidates.length,
        updated: 0,
        skipped: 0,
      };
    }

    const policy = resolveConflictPolicy(options.conflictPolicy);

    return db.transaction(async (tx) => {
      const ids = candidates.map((candidate) => candidate.id);
      const existingRows = await tx
        .select({
          id: dictionaryTable.id,
          headword: dictionaryTable.headword,
          reading: dictionaryTable.reading,
          romaji: dictionaryTable.romaji,
          jlptLevel: dictionaryTable.jlptLevel,
          isCommon: dictionaryTable.isCommon,
          frequencyRank: dictionaryTable.frequencyRank,
          partsOfSpeech: dictionaryTable.partsOfSpeech,
          senses: dictionaryTable.senses,
          kanjiCharacters: dictionaryTable.kanjiCharacters,
          tags: dictionaryTable.tags,
          sourceRef: dictionaryTable.sourceRef,
        })
        .from(dictionaryTable)
        .where(inArray(dictionaryTable.id, ids));

      const existingMap = new Map(existingRows.map((row) => [row.id, {
        ...row,
        partsOfSpeech: (row.partsOfSpeech as string[]) ?? [],
        senses: (row.senses as CanonicalSense[]) ?? [],
        kanjiCharacters: (row.kanjiCharacters as string[]) ?? [],
        tags: (row.tags as string[]) ?? [],
      }]));
      const plan = planPersistence(candidates, existingMap);
      if (policy === "abort" && plan.conflicts.length > 0) {
        throw conflictAbortError(plan.conflicts.map((row) => row.id));
      }

      for (const candidate of plan.inserts) {
        await tx.insert(dictionaryTable).values(candidate);
      }
      if (policy === "update") {
        for (const candidate of plan.conflicts) {
          await tx
            .update(dictionaryTable)
            .set({
              headword: candidate.headword,
              reading: candidate.reading,
              romaji: candidate.romaji,
              jlptLevel: candidate.jlptLevel,
              isCommon: candidate.isCommon,
              frequencyRank: candidate.frequencyRank,
              partsOfSpeech: candidate.partsOfSpeech,
              senses: candidate.senses,
              kanjiCharacters: candidate.kanjiCharacters,
              tags: candidate.tags,
              sourceRef: candidate.sourceRef,
            })
            .where(eq(dictionaryTable.id, candidate.id));
        }
      }
      if (options.injectFailureAfterWrites) {
        throw new Error("injected persistence failure");
      }

      return {
        batchSize: candidates.length,
        inserted: plan.inserts.length,
        updated: policy === "update" ? plan.conflicts.length : 0,
        skipped: plan.identical.length,
      };
    });
  }

  async getExistingByIds(
    ids: string[]
  ): Promise<Map<string, PersistenceCandidate>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .select()
      .from(dictionaryTable)
      .where(inArray(dictionaryTable.id, ids));
    return new Map(rows.map((r) => [r.id, r as PersistenceCandidate]));
  }

  async count(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryTable);
    return row?.count ?? 0;
  }
}

type CanonicalSense = { glosses: string[]; note?: string | null };
