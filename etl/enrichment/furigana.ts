/**
 * Furigana Enricher
 *
 * Generates furigana (reading annotations) for dictionary entry headwords
 * and example sentences containing kanji.
 *
 * DATA SOURCE RELIABILITY: HIGH
 *   - Dictionary furigana: derived directly from JMdict reading data, which
 *     is curated by EDRDG editors. Highly reliable for dictionary headwords.
 *   - Sentence furigana: requires morphological analysis (e.g., MeCab/fugashi).
 *     Accuracy is ~98% for standard text but lower for names, neologisms, and
 *     irregular readings. Falls back to dictionary lookup when available.
 *
 * Adapted from Repo B: etl/enrichers/furigana_enricher.py (uses fugashi/MeCab)
 */

import type { EnrichmentResult } from "./types";

// ─────────────────────────────────────────────
// Unicode utilities
// ─────────────────────────────────────────────

/** Convert katakana string to hiragana. */
export function katakanaToHiragana(value: string): string {
  return Array.from(value)
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      // Katakana range: U+30A1 – U+30F6 → Hiragana: U+3041 – U+3096
      if (cp >= 0x30a1 && cp <= 0x30f6) return String.fromCodePoint(cp - 0x60);
      return ch;
    })
    .join("");
}

/** Check if a string contains any kanji characters. */
export function containsKanji(value: string): boolean {
  return Array.from(value).some((ch) => {
    const cp = ch.codePointAt(0)!;
    return (
      (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
      (cp >= 0x20000 && cp <= 0x3134f) // CJK Extensions B-I
    );
  });
}

/** Check if a character is hiragana. */
export function isHiragana(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x3041 && cp <= 0x309f;
}

/** Check if a character is katakana. */
export function isKatakana(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x30a0 && cp <= 0x30ff;
}

/**
 * Generate furigana for dictionary entries.
 *
 * For dictionary entries, furigana is straightforward:
 *   headword="食べる", reading="たべる" → furigana="食[た]べる"
 *
 * The complex kanji-to-reading alignment requires the full headword
 * and reading to determine which kanji maps to which reading segment.
 *
 * NOTE: Full implementation requires a morphological analyzer (MeCab/kuromoji)
 * which is a native dependency. This enricher provides the utility functions
 * and will be activated when the analyzer dependency is added.
 */
export async function enrichFurigana(): Promise<EnrichmentResult> {
  const start = Date.now();

  // Furigana for dictionary entries is already implicit in the
  // (headword, reading) pair. The rendering layer handles display.
  //
  // Sentence-level furigana requires a morphological analyzer:
  //   - Node.js: kuromoji.js, sudachi.js, or fugashi (via Python bridge)
  //   - These are heavy native dependencies (~50MB dictionary files)
  //   - Not added until sentence import is active and furigana is needed for UI
  //
  // When activated:
  //   1. For each sentence in `sentences` table where `reading` IS NULL
  //   2. Run morphological analysis on `japanese` text
  //   3. Generate reading for each token
  //   4. Store in `sentences.reading`

  console.log(
    "[enrichment:furigana] Furigana enrichment deferred — " +
      "requires morphological analyzer dependency (kuromoji/MeCab)",
  );

  return {
    enricher: "furigana",
    enriched: 0,
    skipped: 0,
    errors: 0,
    durationMs: Date.now() - start,
    reliability: "high",
    sourceNote:
      "Dictionary furigana from JMdict (high reliability). " +
      "Sentence furigana requires MeCab/kuromoji (~98% accuracy for standard text).",
  };
}
