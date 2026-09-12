/**
 * JLPT Level Enricher
 *
 * Assigns JLPT levels (N5–N1) to dictionary entries, kanji entries,
 * and grammar patterns that lack a jlpt_level value.
 *
 * DATA SOURCE RELIABILITY: MEDIUM
 *   - Official JLPT does not publish vocabulary/kanji lists since 2010 revision
 *   - Community-compiled lists (OpenJLPT, Jonathan Waller's lists) are widely used
 *     but are approximations, not official
 *   - Kanji-level assignment is more reliable than vocabulary (Joyo kanji grades
 *     correlate well with JLPT levels)
 *   - Grammar-level assignment comes from textbook alignment (Genki, Tobira, etc.)
 *
 * Adapted from Repo B: etl/enrichers/jlpt_enricher.py, etl/enrichers/jlpt_tagger.py
 */

import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../adapters/db";
import type { EnrichmentResult } from "./types";

/**
 * Known JLPT vocabulary levels from community-compiled lists.
 * In production, this would be loaded from a file (etl/data/enrichment/jlpt/).
 * This is a structural placeholder — the actual word lists are ~10,000 entries.
 */
const JLPT_SAMPLE: Record<string, number> = {
  // N5 sample
  "食べる": 5, "飲む": 5, "行く": 5, "来る": 5, "見る": 5,
  "聞く": 5, "読む": 5, "書く": 5, "話す": 5, "買う": 5,
  // N4 sample
  "届ける": 4, "届く": 4, "集める": 4, "集まる": 4, "比べる": 4,
  // N3 sample
  "努力": 3, "経験": 3, "参加": 3, "相談": 3, "紹介": 3,
};

/**
 * Enrich dictionary entries that have no JLPT level set.
 * Matches headword against known JLPT vocabulary lists.
 */
export async function enrichDictionaryJlpt(): Promise<EnrichmentResult> {
  const start = Date.now();
  const db = getDb();
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch entries without JLPT level
    const entries = await db
      .select({ id: schema.dictionaryEntries.id, headword: schema.dictionaryEntries.headword })
      .from(schema.dictionaryEntries)
      .where(isNull(schema.dictionaryEntries.jlptLevel));

    for (const entry of entries) {
      const level = JLPT_SAMPLE[entry.headword];
      if (level) {
        await db
          .update(schema.dictionaryEntries)
          .set({ jlptLevel: level, updatedAt: new Date() })
          .where(eq(schema.dictionaryEntries.id, entry.id));
        enriched++;
      } else {
        skipped++;
      }
    }
  } catch (err) {
    errors++;
    console.error("[enrichment:jlpt] Dictionary enrichment error:", err);
  }

  return {
    enricher: "jlpt-dictionary",
    enriched,
    skipped,
    errors,
    durationMs: Date.now() - start,
    reliability: "medium",
    sourceNote:
      "Community-compiled JLPT vocabulary lists. Not official — " +
      "JLPT does not publish word lists since the 2010 format revision.",
  };
}

/**
 * Enrich kanji entries that have no JLPT level set.
 * Based on well-known kanji-to-JLPT-level mappings.
 */
export async function enrichKanjiJlpt(): Promise<EnrichmentResult> {
  const start = Date.now();
  const db = getDb();
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // KANJIDIC2 already includes JLPT level for many kanji.
    // This enricher fills in any gaps using community kanji lists.
    const kanji = await db
      .select({ id: schema.kanjiEntries.id, character: schema.kanjiEntries.character })
      .from(schema.kanjiEntries)
      .where(isNull(schema.kanjiEntries.jlptLevel));

    console.log(`[enrichment:jlpt] ${kanji.length} kanji entries without JLPT level`);
    skipped = kanji.length; // All skipped until JLPT kanji list files are provided
  } catch (err) {
    errors++;
    console.error("[enrichment:jlpt] Kanji enrichment error:", err);
  }

  return {
    enricher: "jlpt-kanji",
    enriched,
    skipped,
    errors,
    durationMs: Date.now() - start,
    reliability: "medium",
    sourceNote:
      "Community kanji-JLPT mappings. More reliable than vocabulary " +
      "because Joyo kanji grades correlate with JLPT levels.",
  };
}
