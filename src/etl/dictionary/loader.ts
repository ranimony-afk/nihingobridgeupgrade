import { db } from "@/db";
import {
  dictionaryEntries as dictionaryTable,
  knowledgeSources as sourceTable,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { JMDICT_KNOWLEDGE_SOURCE, type CanonicalDictionaryEntry } from "./types";

export interface BatchLoadResult {
  batchSize: number;
  inserted: number;
  updated: number;
  skipped: number;
}

function areSensesEqual(
  a: Array<{ glosses: string[]; note?: string | null }>,
  b: Array<{ glosses: string[]; note?: string | null }>,
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

function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class DictionaryLoader {
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
    options: { dryRun?: boolean } = {},
  ): Promise<BatchLoadResult> {
    if (entries.length === 0) {
      return { batchSize: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    if (options.dryRun) {
      return {
        batchSize: entries.length,
        inserted: entries.length,
        updated: 0,
        skipped: 0,
      };
    }

    const ids = entries.map((e) => e.id);
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

    for (const entry of entries) {
      const existing = existingMap.get(entry.id);

      if (!existing) {
        await db.insert(dictionaryTable).values(entry);
        inserted++;
      } else {
        // Semantic comparison tolerant of JSONB object key ordering
        const isIdentical =
          existing.headword === entry.headword &&
          existing.reading === entry.reading &&
          existing.romaji === entry.romaji &&
          existing.jlptLevel === entry.jlptLevel &&
          existing.isCommon === entry.isCommon &&
          existing.frequencyRank === entry.frequencyRank &&
          existing.sourceRef === entry.sourceRef &&
          areArraysEqual(existing.partsOfSpeech, entry.partsOfSpeech) &&
          areArraysEqual(existing.kanjiCharacters, entry.kanjiCharacters) &&
          areArraysEqual(existing.tags, entry.tags) &&
          areSensesEqual(existing.senses, entry.senses);

        if (isIdentical) {
          skipped++;
        } else {
          await db
            .update(dictionaryTable)
            .set({
              headword: entry.headword,
              reading: entry.reading,
              romaji: entry.romaji,
              jlptLevel: entry.jlptLevel,
              isCommon: entry.isCommon,
              frequencyRank: entry.frequencyRank,
              partsOfSpeech: entry.partsOfSpeech,
              senses: entry.senses,
              kanjiCharacters: entry.kanjiCharacters,
              tags: entry.tags,
              sourceRef: entry.sourceRef,
            })
            .where(eq(dictionaryTable.id, entry.id));
          updated++;
        }
      }
    }

    return {
      batchSize: entries.length,
      inserted,
      updated,
      skipped,
    };
  }
}
