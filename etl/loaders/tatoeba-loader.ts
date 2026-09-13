/**
 * Load stage: idempotent upsert of sentences, plus translation links.
 * Rule 3: no DROP/TRUNCATE anywhere.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sentenceLinks, sentences } from "@/db/schema";
import type { NormalizedSentence } from "../transforms/tatoeba-transform";
import type { LoadResult } from "./jmdict-loader";

export type { LoadResult };

export async function upsertSentenceBatch(
  batch: NormalizedSentence[],
  importRunId: number | null,
): Promise<LoadResult> {
  if (batch.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

  const source = batch[0].source;
  const ids = batch.map((s) => s.sourceId);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: sentences.id,
        sourceId: sentences.sourceId,
        contentHash: sentences.contentHash,
      })
      .from(sentences)
      .where(and(eq(sentences.source, source), inArray(sentences.sourceId, ids)));

    const existingMap = new Map(existing.map((e) => [e.sourceId, e]));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const s of batch) {
      const prior = existingMap.get(s.sourceId);
      if (prior && prior.contentHash === s.contentHash) {
        unchanged += 1;
        continue;
      }

      const values = {
        source: s.source,
        sourceId: s.sourceId,
        importRunId,
        lang: s.lang,
        text: s.text,
        ownerUsername: s.ownerUsername,
        ownerUnknown: s.ownerUnknown,
        attribution: s.attribution,
        license: s.license,
        charLength: s.charLength,
        contentHash: s.contentHash,
        updatedAt: new Date(),
      };

      await tx
        .insert(sentences)
        .values(values)
        .onConflictDoUpdate({
          target: [sentences.source, sentences.sourceId],
          set: {
            importRunId: values.importRunId,
            lang: values.lang,
            text: values.text,
            ownerUsername: values.ownerUsername,
            ownerUnknown: values.ownerUnknown,
            attribution: values.attribution,
            license: values.license,
            charLength: values.charLength,
            contentHash: values.contentHash,
            updatedAt: values.updatedAt,
          },
        });

      if (prior) updated += 1;
      else inserted += 1;
    }

    return { inserted, updated, unchanged };
  });
}

export type LinkLoadResult = {
  linked: number;
  skippedDangling: number;
};

/**
 * Insert translation links, filtering out pairs whose endpoints were not
 * ingested. Tatoeba's links.csv references the full corpus, so on any
 * language-filtered subset most links legitimately dangle — inserting them
 * blind would fail the foreign key en masse.
 */
export async function insertSentenceLinks(
  pairs: { sourceId: string; translationSourceId: string }[],
  source: string,
): Promise<LinkLoadResult> {
  if (pairs.length === 0) return { linked: 0, skippedDangling: 0 };

  const referenced = new Set<string>();
  for (const p of pairs) {
    referenced.add(p.sourceId);
    referenced.add(p.translationSourceId);
  }

  const rows = await db
    .select({ id: sentences.id, sourceId: sentences.sourceId })
    .from(sentences)
    .where(
      and(eq(sentences.source, source), inArray(sentences.sourceId, [...referenced])),
    );

  const idMap = new Map(rows.map((r) => [r.sourceId, r.id]));

  const values: { sentenceId: number; translationId: number }[] = [];
  let skippedDangling = 0;

  for (const p of pairs) {
    const a = idMap.get(p.sourceId);
    const b = idMap.get(p.translationSourceId);
    if (a === undefined || b === undefined) {
      skippedDangling += 1;
      continue;
    }
    values.push({ sentenceId: a, translationId: b });
  }

  if (values.length === 0) return { linked: 0, skippedDangling };

  await db.insert(sentenceLinks).values(values).onConflictDoNothing();

  return { linked: values.length, skippedDangling };
}
