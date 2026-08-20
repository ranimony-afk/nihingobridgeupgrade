/**
 * JMdict Dictionary Import Pipeline (9-stage)
 *
 * Source → Raw → Parse → Normalize → Match → Enrich → Validate → Provenance → Postgres
 *
 * Adapted from Repo B's etl/pipelines/jmdict_pipeline.py.
 *
 * Usage: npx tsx etl/pipelines/jmdict.ts
 */

import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { Pipeline, type NormalizeResult, type LoadResult } from "./base";
import { getSource } from "../sources/registry";
import { downloadSource } from "../sources/download";
import { getDb, schema } from "../adapters/db";
import { validate, requireString } from "../validators/common";
import { enrichDictionaryJlpt } from "../enrichment/jlpt";
import { enrichFrequency } from "../enrichment/frequency";
import type { EnrichmentResult } from "../enrichment/types";
import type {
  JMdictEntryRaw,
  DictionaryEntryCanonical,
  DictionarySenseCanonical,
  DictionaryReadingCanonical,
} from "../types";

class JMdictPipeline extends Pipeline<JMdictEntryRaw, DictionaryEntryCanonical> {
  readonly name = "JMdict Dictionary Import";

  // ── Stage 2: RAW ──
  protected async stageRaw(): Promise<string> {
    const result = await downloadSource(
      this.config.jmdictUrl,
      this.config.jmdictFilename,
    );
    return result.filePath;
  }

  // ── Stage 3: PARSE ──
  protected async *stageParse(filePath: string): AsyncGenerator<JMdictEntryRaw> {
    // Structural placeholder — full XML SAX parser pending.
    // When implemented:
    //   1. Open .gz via zlib.createGunzip()
    //   2. Stream through SAX parser (sax-js or @xmldom)
    //   3. Yield one JMdictEntryRaw per <entry> element
    console.log(`       [parser] Would parse: ${filePath}`);
    console.log("       [parser] XML parser not yet implemented — yielding 0 records");
  }

  // ── Stage 4: NORMALIZE ──
  protected stageNormalize(raw: JMdictEntryRaw): NormalizeResult<DictionaryEntryCanonical> {
    const errors = validate([
      requireString(raw.entSeq, "entSeq", raw.entSeq),
      requireString(raw.entSeq, "reading", raw.readingElements[0]?.reb),
    ]);

    if (errors.length > 0) return { record: null, errors };

    const primaryKanji = raw.kanjiElements[0]?.keb;
    const primaryReading = raw.readingElements[0]!.reb;
    const headword = primaryKanji ?? primaryReading;

    const allPri = [
      ...raw.kanjiElements.flatMap((k) => k.kePri),
      ...raw.readingElements.flatMap((r) => r.rePri),
    ];
    const isCommon =
      allPri.some((p) => /^nf\d{2}$/.test(p)) ||
      allPri.includes("ichi1") ||
      allPri.includes("spec1");

    const allPos = [...new Set(raw.senses.flatMap((s) => s.pos))];

    const checksum = createHash("sha256")
      .update(JSON.stringify(raw))
      .digest("hex")
      .slice(0, 16);

    const id = `de-${raw.entSeq}`;

    const senses: DictionarySenseCanonical[] = raw.senses.map((s, idx) => {
      const glosses: Record<string, string[]> = {};
      for (const g of s.gloss) {
        if (!glosses[g.lang]) glosses[g.lang] = [];
        glosses[g.lang]!.push(g.text);
      }
      return {
        id: `ds-${raw.entSeq}-${idx}`,
        position: idx,
        glosses,
        pos: s.pos.length > 0 ? s.pos : null,
        field: s.field.length > 0 ? s.field : null,
        misc: s.misc.length > 0 ? s.misc : null,
        info: s.sInf.length > 0 ? s.sInf.join("; ") : null,
        dialect: s.dial.length > 0 ? s.dial : null,
      };
    });

    const readings: DictionaryReadingCanonical[] = raw.readingElements.map(
      (r, idx) => ({
        id: `dr-${raw.entSeq}-${idx}`,
        reading: r.reb,
        isPrimary: idx === 0,
        restrictions: r.reRestr.length > 0 ? r.reRestr : null,
        info: r.reInf.length > 0 ? r.reInf : null,
      }),
    );

    return {
      record: {
        id,
        source: "jmdict",
        sourceId: raw.entSeq,
        sourceVersion: this.source.version,
        importVersion: this.config.pipelineVersion,
        checksum,
        headword,
        reading: primaryReading,
        isCommon,
        jlptLevel: null,
        frequencyRank: null,
        pos: allPos.length > 0 ? allPos : null,
        senses,
        readings,
      },
      errors: [],
    };
  }

  // ── Stage 5: MATCH ──
  // Dictionary entries don't need cross-domain matching at import time.
  // Sentence → entry linking happens in the Tatoeba pipeline.

  // ── Stage 6: ENRICH ──
  protected async stageEnrich(): Promise<EnrichmentResult[]> {
    const results: EnrichmentResult[] = [];
    results.push(await enrichDictionaryJlpt());
    results.push(await enrichFrequency());
    return results;
  }

  // ── Stage 9: POSTGRES ──
  protected async stagePostgres(batch: DictionaryEntryCanonical[]): Promise<LoadResult> {
    const db = getDb();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const entry of batch) {
      const existing = await db
        .select({ id: schema.dictionaryEntries.id, checksum: schema.dictionaryEntries.checksum })
        .from(schema.dictionaryEntries)
        .where(
          and(
            eq(schema.dictionaryEntries.source, entry.source),
            eq(schema.dictionaryEntries.sourceId, entry.sourceId),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0]!.checksum === entry.checksum) {
        skipped++;
        continue;
      }

      const isUpdate = existing.length > 0;
      const entryId = isUpdate ? existing[0]!.id : entry.id;

      if (isUpdate) {
        await db.delete(schema.dictionarySenses).where(eq(schema.dictionarySenses.entryId, entryId));
        await db.delete(schema.dictionaryReadings).where(eq(schema.dictionaryReadings.entryId, entryId));
        await db
          .update(schema.dictionaryEntries)
          .set({
            headword: entry.headword,
            reading: entry.reading,
            isCommon: entry.isCommon,
            jlptLevel: entry.jlptLevel,
            frequencyRank: entry.frequencyRank,
            pos: entry.pos,
            checksum: entry.checksum,
            sourceVersion: entry.sourceVersion,
            importVersion: entry.importVersion,
            importedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.dictionaryEntries.id, entryId));
        updated++;
      } else {
        await db.insert(schema.dictionaryEntries).values({
          id: entry.id,
          source: entry.source,
          sourceId: entry.sourceId,
          sourceVersion: entry.sourceVersion,
          importVersion: entry.importVersion,
          headword: entry.headword,
          reading: entry.reading,
          isCommon: entry.isCommon,
          jlptLevel: entry.jlptLevel,
          frequencyRank: entry.frequencyRank,
          pos: entry.pos,
          checksum: entry.checksum,
        });
        inserted++;
      }

      if (entry.senses.length > 0) {
        await db.insert(schema.dictionarySenses).values(
          entry.senses.map((s) => ({
            id: s.id,
            entryId,
            position: s.position,
            glosses: s.glosses,
            pos: s.pos,
            field: s.field,
            misc: s.misc,
            info: s.info,
            dialect: s.dialect,
          })),
        );
      }

      if (entry.readings.length > 0) {
        await db.insert(schema.dictionaryReadings).values(
          entry.readings.map((r) => ({
            id: r.id,
            entryId,
            reading: r.reading,
            isPrimary: r.isPrimary,
            restrictions: r.restrictions,
            info: r.info,
          })),
        );
      }
    }

    return { inserted, updated, skipped };
  }
}

// ── CLI ──
if (process.argv[1]?.endsWith("jmdict.ts") || process.argv[1]?.endsWith("jmdict.js")) {
  const pipeline = new JMdictPipeline(getSource("jmdict"));
  pipeline.run().then((report) => {
    process.exit(report.status === "failed" ? 1 : 0);
  });
}

export { JMdictPipeline };
