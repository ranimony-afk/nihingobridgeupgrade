/**
 * Load stage: transactional, idempotent upsert keyed on (source, literal).
 * Rule 3: no DROP/TRUNCATE. Child rows are replaced per changed character only.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { kanjiCharacters, kanjiMeanings, kanjiReadings } from "@/db/schema";
import type { NormalizedCharacter } from "../transforms/kanjidic-transform";
import type { LoadResult } from "./jmdict-loader";

export type { LoadResult };

export async function upsertKanjiBatch(
  batch: NormalizedCharacter[],
  importRunId: number | null,
): Promise<LoadResult> {
  if (batch.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

  const source = batch[0].source;
  const literals = batch.map((c) => c.literal);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: kanjiCharacters.id,
        literal: kanjiCharacters.literal,
        contentHash: kanjiCharacters.contentHash,
      })
      .from(kanjiCharacters)
      .where(
        and(
          eq(kanjiCharacters.source, source),
          inArray(kanjiCharacters.literal, literals),
        ),
      );

    const existingMap = new Map(existing.map((e) => [e.literal, e]));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const changed: { kanjiId: number; character: NormalizedCharacter }[] = [];

    for (const c of batch) {
      const prior = existingMap.get(c.literal);
      if (prior && prior.contentHash === c.contentHash) {
        unchanged += 1;
        continue;
      }

      const [row] = await tx
        .insert(kanjiCharacters)
        .values({
          source: c.source,
          literal: c.literal,
          importRunId,
          codepointUcs: c.codepointUcs,
          strokeCount: c.strokeCount,
          strokeMiscounts: c.strokeMiscounts,
          radicalClassical: c.radicalClassical,
          radicalNelson: c.radicalNelson,
          grade: c.grade,
          frequencyRank: c.frequencyRank,
          jlptOld: c.jlptOld,
          variants: c.variants,
          dictionaryRefs: c.dictionaryRefs,
          queryCodes: c.queryCodes,
          nanori: c.nanori,
          contentHash: c.contentHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [kanjiCharacters.source, kanjiCharacters.literal],
          set: {
            importRunId,
            codepointUcs: c.codepointUcs,
            strokeCount: c.strokeCount,
            strokeMiscounts: c.strokeMiscounts,
            radicalClassical: c.radicalClassical,
            radicalNelson: c.radicalNelson,
            grade: c.grade,
            frequencyRank: c.frequencyRank,
            jlptOld: c.jlptOld,
            variants: c.variants,
            dictionaryRefs: c.dictionaryRefs,
            queryCodes: c.queryCodes,
            nanori: c.nanori,
            contentHash: c.contentHash,
            updatedAt: new Date(),
          },
        })
        .returning({ id: kanjiCharacters.id });

      if (prior) updated += 1;
      else inserted += 1;
      changed.push({ kanjiId: row.id, character: c });
    }

    if (changed.length > 0) {
      const ids = changed.map((c) => c.kanjiId);
      await tx.delete(kanjiReadings).where(inArray(kanjiReadings.kanjiId, ids));
      await tx.delete(kanjiMeanings).where(inArray(kanjiMeanings.kanjiId, ids));

      const readingRows = changed.flatMap(({ kanjiId, character }) =>
        character.readings.map((r) => ({
          kanjiId,
          type: r.type,
          value: r.value,
          position: r.position,
        })),
      );
      const meaningRows = changed.flatMap(({ kanjiId, character }) =>
        character.meanings.map((m) => ({
          kanjiId,
          language: m.language,
          value: m.value,
          position: m.position,
        })),
      );

      if (readingRows.length > 0) await tx.insert(kanjiReadings).values(readingRows);
      if (meaningRows.length > 0) await tx.insert(kanjiMeanings).values(meaningRows);
    }

    return { inserted, updated, unchanged };
  });
}
