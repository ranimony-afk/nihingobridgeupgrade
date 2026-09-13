/**
 * Tatoeba ETL CLI.
 *
 *   npx tsx scripts/etl-tatoeba.ts --limit 500
 *   npx tsx scripts/etl-tatoeba.ts --verify-provenance
 *
 * Runs out-of-band (worker / CI), never inside a serverless request.
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { runTatoebaPipeline } from "../etl/pipelines/tatoeba-pipeline";
import { db, pool } from "../src/db";
import { etlImportRuns, sentences } from "../src/db/schema";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function value(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/**
 * Provenance verification (Phase 04.4 deployment gate).
 * Asserts every stored sentence is traceable and licence-compliant.
 */
async function verifyProvenance(runId: number): Promise<boolean> {
  const [run] = await db
    .select()
    .from(etlImportRuns)
    .where(eq(etlImportRuns.id, runId))
    .limit(1);

  const checks: { name: string; ok: boolean; detail: string }[] = [];

  checks.push({
    name: "import run exists",
    ok: Boolean(run),
    detail: run ? `#${run.id}` : "missing",
  });
  if (!run) return false;

  checks.push({ name: "run status is success", ok: run.status === "success", detail: run.status });
  checks.push({ name: "source recorded", ok: run.source === "tatoeba", detail: run.source });
  checks.push({
    name: "license recorded",
    ok: run.license.includes("CC BY 2.0 FR"),
    detail: run.license,
  });
  checks.push({
    name: "attribution recorded",
    ok: run.attribution.toLowerCase().includes("tatoeba"),
    detail: run.attribution.slice(0, 60) + "…",
  });
  checks.push({
    name: "checksum recorded (64 hex)",
    ok: /^[0-9a-f]{64}$/.test(run.checksumSha256),
    detail: run.checksumSha256.slice(0, 16) + "…",
  });
  checks.push({
    name: "source url recorded",
    ok: run.sourceUrl.length > 0,
    detail: run.sourceUrl,
  });
  checks.push({
    name: "run finished",
    ok: run.finishedAt !== null,
    detail: String(run.finishedAt),
  });

  // Row-level provenance: every sentence must be attributable and linked back
  // to an import run.
  const rows = await db
    .select({
      id: sentences.id,
      attribution: sentences.attribution,
      license: sentences.license,
      importRunId: sentences.importRunId,
    })
    .from(sentences);

  const missingAttribution = rows.filter((r) => r.attribution.trim().length === 0);
  const missingLicense = rows.filter((r) => r.license.trim().length === 0);
  const missingRun = rows.filter((r) => r.importRunId === null);

  checks.push({
    name: "every sentence has attribution",
    ok: missingAttribution.length === 0,
    detail: `${rows.length - missingAttribution.length}/${rows.length}`,
  });
  checks.push({
    name: "every sentence has a license",
    ok: missingLicense.length === 0,
    detail: `${rows.length - missingLicense.length}/${rows.length}`,
  });
  checks.push({
    name: "every sentence traces to an import run",
    ok: missingRun.length === 0,
    detail: `${rows.length - missingRun.length}/${rows.length}`,
  });

  console.log("\n=== Provenance verification ===");
  let allOk = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(38)} ${c.detail}`);
    if (!c.ok) allOk = false;
  }
  console.log(`\nprovenance: ${allOk ? "VERIFIED ✅" : "FAILED ❌"}`);
  return allOk;
}

async function main() {
  const limit = value("limit");
  const fixture = value("fixture");
  const lang = value("lang");

  const report = await runTatoebaPipeline(
    {
      dryRun: flag("dry-run"),
      allowNetwork: flag("network"),
      ...(limit ? { maxEntries: Number.parseInt(limit, 10) } : {}),
      ...(fixture ? { fixturePath: fixture } : {}),
      ...(lang !== undefined ? { filterLang: lang } : {}),
    },
    (msg) => console.log(`[etl] ${msg}`),
  );

  console.log("\n=== Tatoeba import report ===");
  console.log(`run id            : ${report.importRunId ?? "(dry run)"}`);
  console.log(`origin            : ${report.origin}`);
  console.log(`sha256            : ${report.sha256}`);
  console.log(`verified          : ${report.checksumVerified}`);
  console.log(`license           : ${report.license}`);
  console.log(`parsed            : ${report.parsed}`);
  console.log(`filtered (lang)   : ${report.filteredByLang}`);
  console.log(`valid             : ${report.valid}`);
  console.log(`invalid           : ${report.invalid}`);
  console.log(`duplicates        : ${report.duplicates}`);
  console.log(`inserted          : ${report.inserted}`);
  console.log(`updated           : ${report.updated}`);
  console.log(`unchanged         : ${report.unchanged}`);
  console.log(`dead letters      : ${report.deadLetters}`);
  console.log(`checkpoint        : ${report.checkpointCursor}`);
  console.log(`resumed           : ${report.resumed} (count ${report.resumeCount})`);
  console.log(`attr → contributor: ${report.attributedToContributor}`);
  console.log(`attr → project    : ${report.attributedToProject}`);
  console.log(`links linked      : ${report.linked}`);
  console.log(`links dangling    : ${report.skippedDangling}`);
  console.log(`duration (ms)     : ${report.durationMs}`);

  if (report.errorSample.length > 0) {
    console.log(`\nrejected sample (${report.errorSample.length}):`);
    for (const e of report.errorSample.slice(0, 8)) {
      console.log(`  - ${e.sourceId}: ${e.reason}`);
    }
  }

  let ok = true;
  if (report.importRunId !== null) {
    ok = await verifyProvenance(report.importRunId);
  }

  await pool.end();
  if (!ok) process.exit(1);
}

main().catch(async (err) => {
  console.error("[etl] FAILED:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
