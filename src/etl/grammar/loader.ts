import { db } from "@/db";
import { grammarPatterns as grammarTable } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { CanonicalGrammarPattern } from "./types";

export interface GrammarBatchLoadResult {
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

export class GrammarLoader {
  /**
   * Loads a batch of canonical grammar patterns idempotently.
   */
  static async loadBatch(
    patterns: CanonicalGrammarPattern[],
    options: { dryRun?: boolean } = {},
  ): Promise<GrammarBatchLoadResult> {
    if (patterns.length === 0) {
      return { batchSize: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    if (options.dryRun) {
      return {
        batchSize: patterns.length,
        inserted: patterns.length,
        updated: 0,
        skipped: 0,
      };
    }

    const ids = patterns.map((p) => p.id);
    const existingRows = await db
      .select()
      .from(grammarTable)
      .where(inArray(grammarTable.id, ids));

    const existingMap = new Map(existingRows.map((r) => [r.id, r]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const pattern of patterns) {
      const existing = existingMap.get(pattern.id);

      if (!existing) {
        await db.insert(grammarTable).values(pattern);
        inserted++;
      } else {
        const isIdentical =
          existing.slug === pattern.slug &&
          existing.title === pattern.title &&
          existing.structure === pattern.structure &&
          existing.meaning === pattern.meaning &&
          existing.explanation === pattern.explanation &&
          existing.formation === pattern.formation &&
          existing.jlptLevel === pattern.jlptLevel &&
          existing.sourceRef === pattern.sourceRef &&
          areArraysEqual(existing.commonMistakes, pattern.commonMistakes) &&
          areArraysEqual(existing.tags, pattern.tags);

        if (isIdentical) {
          skipped++;
        } else {
          await db
            .update(grammarTable)
            .set({
              slug: pattern.slug,
              title: pattern.title,
              structure: pattern.structure,
              meaning: pattern.meaning,
              explanation: pattern.explanation,
              formation: pattern.formation,
              jlptLevel: pattern.jlptLevel,
              commonMistakes: pattern.commonMistakes,
              tags: pattern.tags,
              sourceRef: pattern.sourceRef,
            })
            .where(eq(grammarTable.id, pattern.id));
          updated++;
        }
      }
    }

    return {
      batchSize: patterns.length,
      inserted,
      updated,
      skipped,
    };
  }
}
