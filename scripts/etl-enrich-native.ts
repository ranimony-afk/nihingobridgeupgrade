/**
 * Run deterministic enrichments sourced from existing JMdict/KANJIDIC2 rows.
 *
 * Production (default): only checksummed, non-fixture EDRDG imports are used.
 * Fixture gate only: npx tsx scripts/etl-enrich-native.ts --allow-fixture-provenance
 */

import "dotenv/config";
import { runNativeEnrichment } from "../etl/enrichment/native-enrichment";
import { pool } from "../src/db";

async function main() {
  const allowFixtureProvenance = process.argv.includes("--allow-fixture-provenance");
  const report = await runNativeEnrichment({ allowFixtureProvenance });

  console.log("=== Native enrichment report ===");
  console.log(`mode: ${allowFixtureProvenance ? "fixture-test" : "production (fail-closed)"}`);
  for (const [name, result] of Object.entries({
    furigana: report.furigana,
    conjugation: report.conjugation,
    frequency: report.frequency,
    radicals: report.radicals,
    strokes: report.strokes,
  })) {
    console.log(
      `${name.padEnd(12)} inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged}`,
    );
  }
  console.log(`skipped furigana ambiguity: ${report.skippedAmbiguousFurigana}`);
  console.log(`skipped unsupported conjugation: ${report.skippedUnsupportedConjugation}`);
  console.log(`skipped untrusted JMdict: ${report.skippedUntrustedJmdict}`);
  console.log(`skipped untrusted KANJIDIC2: ${report.skippedUntrustedKanjidic}`);

  await pool.end();
}

main().catch(async (error) => {
  console.error("[enrichment] FAILED:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
