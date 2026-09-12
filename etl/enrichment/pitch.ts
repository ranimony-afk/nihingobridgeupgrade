/**
 * Pitch Accent Enricher
 *
 * Annotates dictionary entries with pitch accent patterns (高低 patterns).
 *
 * DATA SOURCE RELIABILITY: ⚠️ LOW TO MEDIUM — SOURCE-DEPENDENT
 *
 *   AVAILABLE OPEN SOURCES:
 *   - Kanjium pitch accent data: CC-BY-SA-4.0, ~100K entries
 *     https://github.com/mifunetoshiro/kanjium
 *     Quality: community-contributed, good for common words but incomplete
 *   - wadoku.de pitch data: extracted from Wadoku entries that include
 *     accent notation. Limited to words that have pitch marked.
 *
 *   NOT AVAILABLE (licensing prevents use):
 *   - NHK Nihongo Hatsuon Accent Jiten (NHK accent dictionary)
 *     The gold standard but copyrighted. Cannot be redistributed.
 *   - OJAD (Online Japanese Accent Dictionary)
 *     Academic resource, not licensed for bulk extraction.
 *
 *   RELIABILITY ASSESSMENT:
 *   - Pitch accent is inherently variable (regional dialects, speech styles)
 *   - Even the NHK dictionary marks multiple acceptable patterns for many words
 *   - Community data may contain errors for less common words
 *   - For a learning platform, approximate data is acceptable with a disclaimer
 *
 * DECISION: Include only when a CC-licensed pitch dataset is provided.
 *   Do NOT generate pitch data computationally — it's not predictable from spelling.
 */

import type { EnrichmentResult } from "./types";

/**
 * Pitch accent pattern representation.
 *
 * Pattern is a number indicating where the pitch drops:
 *   0 = 平板 (heiban) — no drop, pitch rises after first mora
 *   1 = 頭高 (atamadaka) — drops after first mora
 *   N = drops after Nth mora (nakadaka or odaka)
 */
export interface PitchAccent {
  /** The word reading in hiragana */
  reading: string;
  /** Mora count */
  moraCount: number;
  /** Accent pattern number */
  pattern: number;
  /** Visual pattern string: "LH", "HLL", "LHH", etc. */
  visual: string;
}

/**
 * Generate visual pitch pattern from accent number and mora count.
 *
 * @param pattern - Accent pattern number (0 = heiban)
 * @param moraCount - Number of morae in the word
 * @returns String like "LHH" or "HLL"
 */
export function pitchVisual(pattern: number, moraCount: number): string {
  if (moraCount <= 0) return "";

  const result: string[] = [];
  for (let i = 0; i < moraCount; i++) {
    if (pattern === 0) {
      // Heiban: LHHH...
      result.push(i === 0 ? "L" : "H");
    } else if (pattern === 1) {
      // Atamadaka: HLLL...
      result.push(i === 0 ? "H" : "L");
    } else {
      // Nakadaka/Odaka: LHHL... (drop after pattern-th mora)
      if (i === 0) result.push("L");
      else if (i < pattern) result.push("H");
      else result.push("L");
    }
  }
  return result.join("");
}

/**
 * Enrich dictionary entries with pitch accent data.
 *
 * Only runs when a verified pitch accent data file is available.
 * Does NOT generate pitch data computationally.
 */
export async function enrichPitch(): Promise<EnrichmentResult> {
  const start = Date.now();

  console.log(
    "[enrichment:pitch] Pitch accent enrichment deferred — " +
      "requires CC-licensed pitch dataset (e.g., Kanjium). " +
      "NHK accent data cannot be used (copyright).",
  );

  return {
    enricher: "pitch",
    enriched: 0,
    skipped: 0,
    errors: 0,
    durationMs: Date.now() - start,
    reliability: "low",
    sourceNote:
      "Open pitch accent data is incomplete and community-contributed. " +
      "NHK accent dictionary is the gold standard but is copyrighted. " +
      "Enrichment will be activated when a CC-licensed dataset is provided.",
  };
}
