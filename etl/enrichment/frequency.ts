/**
 * Frequency Rank Enricher
 *
 * Assigns frequency_rank to dictionary entries based on word frequency
 * corpus data (e.g., Innocent Corpus, Leeds Internet Corpus).
 *
 * DATA SOURCE RELIABILITY: HIGH
 *   - Frequency data comes from large, well-documented corpora
 *   - Innocent Corpus: ~5.4 billion characters from novels and light novels
 *   - Leeds Internet Corpus: web-crawled Japanese text
 *   - Frequency rankings are objective (based on occurrence counts)
 *   - Minor variation between corpora but top-10K words are highly consistent
 *
 * Adapted from Repo B: etl/enrichers/frequency_enricher.py
 */

import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../adapters/db";
import type { EnrichmentResult } from "./types";

/**
 * Load frequency data from a file and enrich dictionary entries.
 *
 * Expected file format: TSV with columns (rank, headword, reading, frequency_count)
 * or Yomitan/Innocent Corpus JSON format.
 *
 * In production, the frequency data file path comes from config.
 * This is a structural implementation — the actual corpus file must be provided.
 */
export async function enrichFrequency(): Promise<EnrichmentResult> {
  const start = Date.now();
  const db = getDb();
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Count how many entries lack frequency data
    const unranked = await db
      .select({ id: schema.dictionaryEntries.id })
      .from(schema.dictionaryEntries)
      .where(isNull(schema.dictionaryEntries.frequencyRank))
      .limit(1);

    if (unranked.length === 0) {
      console.log("[enrichment:frequency] All entries already have frequency ranks");
    } else {
      console.log("[enrichment:frequency] Frequency corpus file not yet loaded — skipping");
      // When frequency data file is available:
      //   1. Parse the corpus file into a Map<string, number> (headword → rank)
      //   2. For each unranked dictionary entry, look up its headword
      //   3. UPDATE dictionary_entries SET frequency_rank = ? WHERE id = ?
      //   4. Also try matching by reading for kana-only entries
    }

    skipped = unranked.length;
  } catch (err) {
    errors++;
    console.error("[enrichment:frequency] Error:", err);
  }

  return {
    enricher: "frequency",
    enriched,
    skipped,
    errors,
    durationMs: Date.now() - start,
    reliability: "high",
    sourceNote:
      "Word frequency rankings from Japanese text corpora. " +
      "Highly reliable — based on objective occurrence counts in billions of characters.",
  };
}
