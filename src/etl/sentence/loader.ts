import { db } from "@/db";
import {
  exampleSentences as sentenceTable,
  knowledgeSources as sourceTable,
} from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { TATOEBA_KNOWLEDGE_SOURCE, type CanonicalExampleSentence } from "./types";

export interface SentenceBatchLoadResult {
  batchSize: number;
  inserted: number;
  updated: number;
  skipped: number;
}

function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class SentenceLoader {
  /**
   * Ensures the knowledge_sources row for Tatoeba is registered.
   */
  static async ensureSource(recordCount: number = 0): Promise<void> {
    const existing = await db
      .select({ id: sourceTable.id })
      .from(sourceTable)
      .where(eq(sourceTable.id, TATOEBA_KNOWLEDGE_SOURCE.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(sourceTable).values({
        id: TATOEBA_KNOWLEDGE_SOURCE.id,
        name: TATOEBA_KNOWLEDGE_SOURCE.name,
        version: TATOEBA_KNOWLEDGE_SOURCE.version,
        license: TATOEBA_KNOWLEDGE_SOURCE.license,
        url: TATOEBA_KNOWLEDGE_SOURCE.url,
        description: TATOEBA_KNOWLEDGE_SOURCE.description,
        domain: TATOEBA_KNOWLEDGE_SOURCE.domain,
        recordCount,
      });
    } else {
      await db
        .update(sourceTable)
        .set({
          recordCount: sql`GREATEST(${sourceTable.recordCount}, ${recordCount})`,
        })
        .where(eq(sourceTable.id, TATOEBA_KNOWLEDGE_SOURCE.id));
    }
  }

  /**
   * Loads a batch of canonical example sentences idempotently.
   */
  static async loadBatch(
    entries: CanonicalExampleSentence[],
    options: { dryRun?: boolean } = {},
  ): Promise<SentenceBatchLoadResult> {
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
      .select()
      .from(sentenceTable)
      .where(inArray(sentenceTable.id, ids));

    const existingMap = new Map(existingRows.map((r) => [r.id, r]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of entries) {
      const existing = existingMap.get(entry.id);

      if (!existing) {
        await db.insert(sentenceTable).values(entry);
        inserted++;
      } else {
        const isIdentical =
          existing.japanese === entry.japanese &&
          existing.reading === entry.reading &&
          existing.english === entry.english &&
          existing.jlptLevel === entry.jlptLevel &&
          existing.grammarId === entry.grammarId &&
          existing.sourceRef === entry.sourceRef &&
          areArraysEqual(existing.dictionaryEntryIds, entry.dictionaryEntryIds) &&
          areArraysEqual(existing.kanjiCharacters, entry.kanjiCharacters) &&
          areArraysEqual(existing.tags, entry.tags);

        if (isIdentical) {
          skipped++;
        } else {
          await db
            .update(sentenceTable)
            .set({
              japanese: entry.japanese,
              reading: entry.reading,
              english: entry.english,
              jlptLevel: entry.jlptLevel,
              grammarId: entry.grammarId,
              dictionaryEntryIds: entry.dictionaryEntryIds,
              kanjiCharacters: entry.kanjiCharacters,
              tags: entry.tags,
              sourceRef: entry.sourceRef,
            })
            .where(eq(sentenceTable.id, entry.id));
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
