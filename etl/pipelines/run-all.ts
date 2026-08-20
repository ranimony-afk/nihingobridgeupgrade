/**
 * Run all ETL pipelines in dependency order.
 *
 * Pipeline execution order:
 *   1. JMdict (dictionary entries)     — no dependencies
 *   2. KANJIDIC2 (kanji entries)       — no dependencies
 *   3. RADKFILE (radical components)   — depends on kanjidic2
 *   4. Tatoeba (sentences)             — depends on jmdict (for sentence↔entry linking)
 *   5. Grammar (grammar patterns)      — no dependencies
 *   6. Enrichment pass                 — depends on all above
 *
 * Each pipeline internally runs the 9-stage flow:
 *   Source → Raw → Parse → Normalize → Match → Enrich → Validate → Provenance → Postgres
 *
 * Usage: npx tsx etl/pipelines/run-all.ts
 */

import { getSource, printRegistrySummary } from "../sources/registry";
import { JMdictPipeline } from "./jmdict";
import { closePool } from "../adapters/db";
import type { ImportRunReport } from "../types";

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  NihongoBridge ETL — Full Import Pipeline                     ║");
  console.log("║                                                               ║");
  console.log("║  Source → Raw → Parse → Normalize → Match → Enrich            ║");
  console.log("║     → Validate → Provenance → Postgres                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  // Show registry state
  printRegistrySummary();

  const reports: ImportRunReport[] = [];
  const skipped: string[] = [];

  // ── 1. Dictionary (JMdict) ──
  try {
    const jmdict = new JMdictPipeline(getSource("jmdict"));
    reports.push(await jmdict.run());
  } catch (err) {
    console.error("[run-all] JMdict pipeline failed:", err);
  }

  // ── 2. Kanji (KANJIDIC2) ──
  skipped.push("kanjidic2 — parser not yet implemented");

  // ── 3. Radicals (RADKFILE) ──
  skipped.push("radkfile — depends on kanjidic2; parser not yet implemented");

  // ── 4. Sentences (Tatoeba) ──
  skipped.push("tatoeba — parser not yet implemented");

  // ── 5. Grammar (manual) ──
  skipped.push("grammar — requires curated JSONL file");

  // Close the shared DB pool
  await closePool();

  // ── Summary ──
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  Import Summary                                              ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");

  for (const r of reports) {
    const icon = r.status === "success" ? "✅" : r.status === "partial" ? "⚠️" : "❌";
    const c = r.counts;
    console.log(
      `║  ${icon} ${r.sourceName.padEnd(18)} ` +
        `${String(c.inserted).padStart(7)} ins  ` +
        `${String(c.updated).padStart(5)} upd  ` +
        `${String(c.skippedUnchanged).padStart(5)} skip  ` +
        `${String(c.errors).padStart(4)} err ║`,
    );
  }

  if (skipped.length > 0) {
    console.log("║                                                              ║");
    for (const s of skipped) {
      console.log(`║  ⏭️  ${s.padEnd(55)}║`);
    }
  }

  console.log("╚════════════════════════════════════════════════════════════════╝");

  const failed = reports.some((r) => r.status === "failed");
  process.exit(failed ? 1 : 0);
}

main();
