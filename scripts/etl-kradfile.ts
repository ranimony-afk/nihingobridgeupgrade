/** Test/worker CLI for KRADFILE component enrichment. */

import "dotenv/config";
import { runKradfilePipeline } from "../etl/pipelines/kradfile-pipeline";
import { pool } from "../src/db";

async function main() {
  const report = await runKradfilePipeline({
    allowFixtureProvenance: process.argv.includes("--allow-fixture-provenance"),
  });
  console.log("=== KRADFILE component enrichment ===");
  console.log(`accepted: ${report.accepted} (${report.reason})`);
  console.log(`run: ${report.importRunId ?? "-"}`);
  console.log(`parsed=${report.parsed} valid=${report.valid} invalid=${report.invalid} duplicates=${report.duplicates}`);
  console.log(`unmatched=${report.unmatched} inserted=${report.inserted} updated=${report.updated} unchanged=${report.unchanged}`);
  for (const error of report.errorSample) console.log(`  - ${error}`);
  await pool.end();
  if (!report.accepted) process.exit(1);
}

main().catch(async (error) => {
  console.error("[kradfile] FAILED:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
