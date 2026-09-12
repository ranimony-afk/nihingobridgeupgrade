/**
 * Run all enrichment steps in dependency order.
 *
 * Usage: npx tsx etl/enrichment/run-all.ts
 *
 * Enrichment runs AFTER primary data import (JMdict, KANJIDIC2, Tatoeba).
 * Each enricher updates existing records — it does not create new ones.
 */

import { enrichDictionaryJlpt, enrichKanjiJlpt } from "./jlpt";
import { enrichFrequency } from "./frequency";
import { enrichFurigana } from "./furigana";
import { enrichConjugations } from "./conjugations";
import { enrichRadicals } from "./radicals";
import { enrichPitch } from "./pitch";
import { enrichStrokes } from "./strokes";
import { closePool } from "../adapters/db";
import type { EnrichmentResult } from "./types";

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  NihongoBridge ETL — Enrichment Pipeline     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const results: EnrichmentResult[] = [];

  // Order matters: JLPT + frequency first (enriches dictionary and kanji),
  // then radicals (requires kanji), then furigana, conjugations, pitch, strokes.

  const enrichers = [
    { name: "JLPT (Dictionary)", fn: enrichDictionaryJlpt },
    { name: "JLPT (Kanji)", fn: enrichKanjiJlpt },
    { name: "Frequency", fn: enrichFrequency },
    { name: "Radicals/Components", fn: enrichRadicals },
    { name: "Furigana", fn: enrichFurigana },
    { name: "Conjugations", fn: enrichConjugations },
    { name: "Pitch Accent", fn: enrichPitch },
    { name: "Stroke Order", fn: enrichStrokes },
  ];

  for (const { name, fn } of enrichers) {
    console.log(`\n── ${name} ──`);
    const result = await fn();
    results.push(result);
  }

  await closePool();

  // Summary
  const reliabilityIcon = { high: "✅", medium: "⚠️", low: "❓" };

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Enrichment Summary                                            ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  for (const r of results) {
    const icon = reliabilityIcon[r.reliability];
    console.log(
      `║  ${icon} ${r.enricher.padEnd(22)} ` +
        `${String(r.enriched).padStart(6)} enriched  ` +
        `${String(r.skipped).padStart(6)} skipped  ` +
        `reliability: ${r.reliability.padEnd(6)} ║`,
    );
  }
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
