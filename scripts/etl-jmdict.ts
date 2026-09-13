/**
 * JMdict ETL CLI.
 *
 *   npx tsx scripts/etl-jmdict.ts --limit 500
 *   npx tsx scripts/etl-jmdict.ts --dry-run --limit 100
 *
 * Runs out-of-band (worker / CI), never inside a serverless request.
 */

import "dotenv/config";
import { runJmdictPipeline } from "../etl/pipelines/jmdict-pipeline";
import { pool } from "../src/db";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function value(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = value("limit");
  const fixture = value("fixture");

  const report = await runJmdictPipeline(
    {
      dryRun: flag("dry-run"),
      allowNetwork: flag("network"),
      ...(limit ? { maxEntries: Number.parseInt(limit, 10) } : {}),
      ...(fixture ? { fixturePath: fixture } : {}),
    },
    (msg) => console.log(`[etl] ${msg}`),
  );

  console.log("\n=== JMdict import report ===");
  console.log(`run id        : ${report.importRunId ?? "(dry run)"}`);
  console.log(`origin        : ${report.origin}`);
  console.log(`sha256        : ${report.sha256}`);
  console.log(`verified      : ${report.checksumVerified}`);
  console.log(`parsed        : ${report.parsed}`);
  console.log(`valid         : ${report.valid}`);
  console.log(`invalid       : ${report.invalid}`);
  console.log(`duplicates    : ${report.duplicates}`);
  console.log(`inserted      : ${report.inserted}`);
  console.log(`updated       : ${report.updated}`);
  console.log(`unchanged     : ${report.unchanged}`);
  console.log(`dead letters  : ${report.deadLetters}`);
  console.log(`checkpoint    : ${report.checkpointCursor}`);
  console.log(`resumed       : ${report.resumed} (count ${report.resumeCount})`);
  console.log(`duration (ms) : ${report.durationMs}`);
  if (report.errorSample.length > 0) {
    console.log(`\nrejected sample (${report.errorSample.length}):`);
    for (const e of report.errorSample.slice(0, 5)) {
      console.log(`  - ${e.sourceId}: ${e.reason}`);
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error("[etl] FAILED:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
