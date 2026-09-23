/**
 * Dictionary Persistence Adapter — Phase 14.2.
 *
 * Provides a clean storage abstraction separating ETL transformation
 * from database persistence. Supports:
 * 1. InMemoryDictionaryPersistenceAdapter: in-memory storage for offline testing and dry-runs.
 * 2. DrizzleDictionaryPersistenceAdapter: production database adapter (used in Phase 14.3).
 */

import { db } from "@/db";
import { dictionaryEntries as dictionaryTable } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type {
  DictionaryPersistenceAdapter,
  PersistenceBatchResult,
  PersistenceCandidate,
} from "./types";

/**
 * Checks semantic equality between two senses arrays.
 */
export function areSensesEqual(
  a: Array<{ glosses: string[]; note?: string | null }>,
  b: Array<{ glosses: string[]; note?: string | null }>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sA = a[i];
    const sB = b[i];
    if ((sA.note || null) !== (sB.note || null)) return false;
    if (sA.glosses.length !== sB.glosses.length) return false;
    for (let j = 0; j < sA.glosses.length; j++) {
      if (sA.glosses[j] !== sB.glosses[j]) return false;
    }
  }
  return true;
}

/**
 * Checks equality between two string arrays.
 */
export function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
    options: { dryRun?: boolean } = {}
  ): Promise<PersistenceBatchResult> {
    if (candidates.length === 0) {
      return { batchSize: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    if (options.dryRun) {
      throw new Error(
        "Database safety violation: DrizzleDictionaryPersistenceAdapter must never be invoked with dryRun=true."
      );
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const existing = this.store.get(candidate.id);
      if (!existing) {
        this.store.set(candidate.id, { ...candidate });
        inserted++;
      } else {
        const isIdentical =
          existing.headword === candidate.headword &&
          existing.reading === candidate.reading &&
          existing.romaji === candidate.romaji &&
          existing.jlptLevel === candidate.jlptLevel &&
          existing.isCommon === candidate.isCommon &&
          existing.frequencyRank === candidate.frequencyRank &&
          existing.sourceRef === candidate.sourceRef &&
          areArraysEqual(existing.partsOfSpeech, candidate.partsOfSpeech) &&
          areArraysEqual(existing.kanjiCharacters, candidate.kanjiCharacters) &&
          areArraysEqual(existing.tags, candidate.tags) &&
          areSensesEqual(existing.senses, candidate.senses);

        if (isIdentical) {
          skipped++;
        } else {
          this.store.set(candidate.id, { ...candidate });
          updated++;
        }
      }
    }

    return {
      batchSize: candidates.length,
      inserted,
      updated,
      skipped,
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
 * Used during real ingestion in Phase 14.3.
 */
export class DrizzleDictionaryPersistenceAdapter
  implements DictionaryPersistenceAdapter
{
  async upsertBatch(
    candidates: PersistenceCandidate[],
    options: { dryRun?: boolean } = {}
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

    const ids = candidates.map((c) => c.id);
    const existingRows = await db
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

    const existingMap = new Map(existingRows.map((r) => [r.id, r]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const toInsert: PersistenceCandidate[] = [];

    for (const candidate of candidates) {
      const existing = existingMap.get(candidate.id);

      if (!existing) {
        toInsert.push(candidate);
      } else {
        const isIdentical =
          existing.headword === candidate.headword &&
          existing.reading === candidate.reading &&
          existing.romaji === candidate.romaji &&
          existing.jlptLevel === candidate.jlptLevel &&
          existing.isCommon === candidate.isCommon &&
          existing.frequencyRank === candidate.frequencyRank &&
          existing.sourceRef === candidate.sourceRef &&
          areArraysEqual(existing.partsOfSpeech, candidate.partsOfSpeech) &&
          areArraysEqual(existing.kanjiCharacters, candidate.kanjiCharacters) &&
          areArraysEqual(existing.tags, candidate.tags) &&
          areSensesEqual(existing.senses, candidate.senses);

        if (isIdentical) {
          skipped++;
        } else {
          await db
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
          updated++;
        }
      }
    }

    if (toInsert.length > 0) {
      await db.insert(dictionaryTable).values(toInsert);
      inserted = toInsert.length;
    }

    return {
      batchSize: candidates.length,
      inserted,
      updated,
      skipped,
    };
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
