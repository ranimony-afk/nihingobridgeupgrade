/**
 * Load stage: transactional, idempotent upsert keyed on (source, source_id).
 *
 * Rule 3 compliance: this module never issues DROP/TRUNCATE. Child rows for a
 * re-imported entry are replaced within that entry's scope only, which is
 * standard upsert semantics for a versioned upstream dictionary.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionaryKanji,
  dictionaryReadings,
  dictionarySenses,
} from "@/db/schema";
import type { NormalizedEntry } from "../transforms/jmdict-transform";

export type LoadResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

export async function upsertBatch(
  batch: NormalizedEntry[],
  importRunId: number | null,
): Promise<LoadResult> {
  if (batch.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

  const source = batch[0].source;
  const ids = batch.map((e) => e.sourceId);

  return db.transaction(async (tx) => {
    // Look up what already exists so we can classify insert vs update, and
    // skip rewriting children when the content hash is identical.
    const existing = await tx
      .select({
        id: dictionaryEntries.id,
        sourceId: dictionaryEntries.sourceId,
        contentHash: dictionaryEntries.contentHash,
      })
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.source, source),
          inArray(dictionaryEntries.sourceId, ids),
        ),
      );

    const existingMap = new Map(existing.map((e) => [e.sourceId, e]));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    const entryIdsNeedingChildren: { entryId: number; entry: NormalizedEntry }[] = [];

    for (const entry of batch) {
      const prior = existingMap.get(entry.sourceId);

      if (prior && prior.contentHash === entry.contentHash) {
        unchanged += 1;
        continue;
      }

      const [row] = await tx
        .insert(dictionaryEntries)
        .values({
          source: entry.source,
          sourceId: entry.sourceId,
          importRunId,
          headword: entry.headword,
          primaryReading: entry.primaryReading,
          isCommon: entry.isCommon,
          contentHash: entry.contentHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dictionaryEntries.source, dictionaryEntries.sourceId],
          set: {
            importRunId,
            headword: entry.headword,
            primaryReading: entry.primaryReading,
            isCommon: entry.isCommon,
            contentHash: entry.contentHash,
            updatedAt: new Date(),
          },
        })
        .returning({ id: dictionaryEntries.id });

      if (prior) updated += 1;
      else inserted += 1;

      entryIdsNeedingChildren.push({ entryId: row.id, entry });
    }

    // Replace children only for entries whose content actually changed.
    if (entryIdsNeedingChildren.length > 0) {
      const changedIds = entryIdsNeedingChildren.map((e) => e.entryId);
      await tx.delete(dictionaryKanji).where(inArray(dictionaryKanji.entryId, changedIds));
      await tx
        .delete(dictionaryReadings)
        .where(inArray(dictionaryReadings.entryId, changedIds));
      await tx
        .delete(dictionarySenses)
        .where(inArray(dictionarySenses.entryId, changedIds));

      const kanjiRows = entryIdsNeedingChildren.flatMap(({ entryId, entry }) =>
        entry.kanji.map((k) => ({
          entryId,
          text: k.text,
          common: k.common,
          priorityTags: k.priorityTags,
          infoTags: k.infoTags,
          position: k.position,
        })),
      );
      const readingRows = entryIdsNeedingChildren.flatMap(({ entryId, entry }) =>
        entry.readings.map((r) => ({
          entryId,
          text: r.text,
          common: r.common,
          noKanji: r.noKanji,
          priorityTags: r.priorityTags,
          infoTags: r.infoTags,
          position: r.position,
        })),
      );
      const senseRows = entryIdsNeedingChildren.flatMap(({ entryId, entry }) =>
        entry.senses
          .filter((s) => s.glosses.length > 0)
          .map((s) => ({
            entryId,
            position: s.position,
            glosses: s.glosses,
            partsOfSpeech: s.partsOfSpeech,
            fields: s.fields,
            misc: s.misc,
            dialects: s.dialects,
            info: s.info,
          })),
      );

      if (kanjiRows.length > 0) await tx.insert(dictionaryKanji).values(kanjiRows);
      if (readingRows.length > 0) await tx.insert(dictionaryReadings).values(readingRows);
      if (senseRows.length > 0) await tx.insert(dictionarySenses).values(senseRows);
    }

    return { inserted, updated, unchanged };
  });
}
