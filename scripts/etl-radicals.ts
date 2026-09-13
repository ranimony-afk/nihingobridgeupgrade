/**
 * Seed Kangxi radicals and promote KRADFILE components into first-class
 * kanji ↔ component relationships.
 *
 *   npx tsx scripts/etl-radicals.ts --allow-fixture-provenance
 */

import "dotenv/config";
import { runRadicalPipeline } from "../etl/pipelines/radical-pipeline";
import { pool } from "../src/db";

async function main() {
  const allowFixtureProvenance = process.argv.includes("--allow-fixture-provenance");
  const { radicalReport, componentReport } = await runRadicalPipeline({
    allowFixtureProvenance,
  });

  console.log("=== Kangxi radical seed ===");
  console.log(`run           : ${radicalReport.importRunId}`);
  console.log(`inserted      : ${radicalReport.inserted}`);
  console.log(`updated       : ${radicalReport.updated}`);
  console.log(`unchanged     : ${radicalReport.unchanged}`);

  console.log("\n=== Component promotion ===");
  console.log(`mode          : ${allowFixtureProvenance ? "fixture-test" : "production (fail-closed)"}`);
  console.log(`run           : ${componentReport.importRunId}`);
  console.log(`kanji         : ${componentReport.kanjiProcessed}`);
  console.log(`inserted      : ${componentReport.relationshipsInserted}`);
  console.log(`unchanged     : ${componentReport.relationshipsUnchanged}`);
  console.log(`linked→radical: ${componentReport.linkedToRadical}`);
  if (componentReport.unlinkedComponents.length > 0) {
    console.log(
      `non-radical components: ${componentReport.unlinkedComponents.join(" ")}`,
    );
  }

  await pool.end();
}

main().catch(async (error) => {
  console.error("[radicals] FAILED:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
