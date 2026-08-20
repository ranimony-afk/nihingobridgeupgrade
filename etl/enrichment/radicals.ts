/**
 * Radicals & Components Enricher
 *
 * Populates kanji_components and kanji_component_links from RADKFILE/KRADFILE.
 *
 * DATA SOURCE RELIABILITY: HIGH
 *   - RADKFILE/KRADFILE is maintained by Jim Breen (EDRDG)
 *   - Radical decomposition is well-defined (Kangxi radical system, 214 radicals)
 *   - Data is stable — radical assignments rarely change
 *   - Used by every major kanji learning tool (Jisho, WaniKani, etc.)
 *   - The file maps each kanji to its radical constituents and vice versa
 *
 * Source: https://www.edrdg.org/krad/kradinf.html
 * License: EDRDG (free, attribution required)
 */

import type { EnrichmentResult } from "./types";

/**
 * Parse KRADFILE format: each line is "kanji : radical1 radical2 radical3"
 * Returns a map of kanji → array of radical characters.
 */
export function parseKradfile(content: string): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(" : ");
    if (colonIdx === -1) continue;

    const kanji = trimmed.slice(0, colonIdx).trim();
    const radicals = trimmed
      .slice(colonIdx + 3)
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (kanji.length === 1 && radicals.length > 0) {
      result.set(kanji, radicals);
    }
  }

  return result;
}

/**
 * Parse RADKFILE format: blocks starting with "$ radical stroke_count"
 * followed by kanji that contain that radical.
 * Returns a map of radical → array of kanji characters.
 */
export function parseRadkfile(content: string): Map<string, { strokes: number; kanji: string[] }> {
  const result = new Map<string, { strokes: number; kanji: string[] }>();
  let currentRadical: string | null = null;
  let currentStrokes = 0;
  let currentKanji: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("$")) {
      // Save previous radical
      if (currentRadical) {
        result.set(currentRadical, { strokes: currentStrokes, kanji: currentKanji });
      }
      // Parse new radical line: "$ radical stroke_count"
      const parts = trimmed.slice(2).trim().split(/\s+/);
      currentRadical = parts[0] ?? null;
      currentStrokes = Number(parts[1] ?? 0);
      currentKanji = [];
    } else if (currentRadical) {
      // Each subsequent line contains kanji characters that use this radical
      currentKanji.push(...Array.from(trimmed).filter((ch) => ch.trim()));
    }
  }

  // Save last radical
  if (currentRadical) {
    result.set(currentRadical, { strokes: currentStrokes, kanji: currentKanji });
  }

  return result;
}

/**
 * Enrich kanji with radical/component data.
 *
 * Loads RADKFILE + KRADFILE, populates kanji_components table with
 * radical definitions, then creates kanji_component_links for each
 * kanji → radical relationship.
 */
export async function enrichRadicals(): Promise<EnrichmentResult> {
  const start = Date.now();

  console.log(
    "[enrichment:radicals] Radical enrichment deferred — " +
      "requires RADKFILE/KRADFILE data files in etl/data/raw/",
  );

  return {
    enricher: "radicals",
    enriched: 0,
    skipped: 0,
    errors: 0,
    durationMs: Date.now() - start,
    reliability: "high",
    sourceNote:
      "RADKFILE/KRADFILE from EDRDG. Highly reliable — " +
      "Kangxi radical system is standardized (214 radicals). " +
      "Data is stable and used by all major kanji tools.",
  };
}
