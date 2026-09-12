/**
 * Cross-entity linker — connects entities across domains.
 *
 * Examples:
 *   - Link sentences to dictionary entries they contain
 *   - Link kanji to the radicals/components they contain
 *   - Link grammar examples to the grammar patterns they illustrate
 *
 * Matching runs AFTER initial import, as a post-processing step.
 */

export interface LinkResult {
  linksCreated: number;
  linksUpdated: number;
  errors: number;
}

/**
 * Link sentences to dictionary entries by matching Japanese text
 * against dictionary headwords/readings.
 *
 * Placeholder — full implementation will use PostgreSQL text search
 * or morphological analysis (e.g., kuromoji tokenizer).
 */
export async function linkSentencesToEntries(): Promise<LinkResult> {
  console.log("[linker] Sentence → DictionaryEntry linking: not yet implemented");
  return { linksCreated: 0, linksUpdated: 0, errors: 0 };
}

/**
 * Link kanji entries to their radical components using RADKFILE data.
 *
 * Placeholder — requires RADKFILE import.
 */
export async function linkKanjiToComponents(): Promise<LinkResult> {
  console.log("[linker] Kanji → Component linking: not yet implemented");
  return { linksCreated: 0, linksUpdated: 0, errors: 0 };
}
