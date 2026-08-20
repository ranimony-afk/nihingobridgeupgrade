/**
 * Stroke Order Enricher
 *
 * Adds stroke order SVG path data to kanji entries using KanjiVG.
 *
 * DATA SOURCE RELIABILITY: HIGH
 *   - KanjiVG by Ulrich Apel: CC-BY-SA-3.0
 *   - ~11,000 kanji and kana with hand-verified stroke paths
 *   - Each stroke is an SVG path element with correct drawing order
 *   - Data is curated — errors are rare and actively corrected
 *   - The de facto standard for stroke order in open-source tools
 *     (used by Jisho.org, WaniKani viewers, Kanji Study apps, etc.)
 *
 * Source: https://kanjivg.tagaini.net/
 * License: CC-BY-SA-3.0
 * GitHub: https://github.com/KanjiVG/kanjivg
 */

import type { EnrichmentResult } from "./types";

/**
 * Parsed stroke data for a single kanji.
 */
export interface KanjiStrokeData {
  /** The kanji character */
  character: string;
  /** Unicode codepoint (e.g., "09F8D" for 食) */
  codepoint: string;
  /** Total number of strokes */
  strokeCount: number;
  /** SVG path data for each stroke, in writing order */
  strokes: StrokePathData[];
}

export interface StrokePathData {
  /** Stroke number (1-based) */
  strokeNumber: number;
  /** SVG path d attribute */
  path: string;
  /** Stroke type if annotated (e.g., "横" "縦" "点") */
  type?: string;
}

/**
 * Parse a KanjiVG XML file and extract stroke path data.
 *
 * KanjiVG XML structure:
 *   <kanjivg>
 *     <kanji id="kvg:kanji_09f8d" midashi="食" ...>
 *       <g id="kvg:09f8d" ...>
 *         <path id="kvg:09f8d-s1" d="M 50.25,16.25 C ..." />
 *         <path id="kvg:09f8d-s2" d="M 27.5,30.12 C ..." />
 *         ...
 *       </g>
 *     </kanji>
 *   </kanjivg>
 *
 * NOTE: Full XML parser will be implemented when kanjivg.xml.gz is downloaded.
 * The parser is structurally straightforward — each <path> within a <kanji>
 * represents one stroke, ordered by their s1, s2, s3... suffixes.
 */
export function parseKanjiVGEntry(_xml: string): KanjiStrokeData | null {
  // Placeholder — full implementation will use a streaming XML parser
  // to extract <path d="..."> elements for each kanji.
  return null;
}

/**
 * Enrich kanji entries with stroke order data from KanjiVG.
 *
 * This enricher reads the KanjiVG XML, extracts SVG paths for each kanji,
 * and stores them. The existing schema stores stroke_count on kanji_entries;
 * the SVG paths would go into a dedicated store (JSONB column or separate table).
 */
export async function enrichStrokes(): Promise<EnrichmentResult> {
  const start = Date.now();

  console.log(
    "[enrichment:strokes] Stroke order enrichment deferred — " +
      "requires KanjiVG XML download. Source is verified CC-BY-SA-3.0.",
  );

  return {
    enricher: "strokes",
    enriched: 0,
    skipped: 0,
    errors: 0,
    durationMs: Date.now() - start,
    reliability: "high",
    sourceNote:
      "KanjiVG by Ulrich Apel (CC-BY-SA-3.0). Hand-verified stroke paths " +
      "for ~11,000 kanji. The de facto standard for open-source stroke order data.",
  };
}
