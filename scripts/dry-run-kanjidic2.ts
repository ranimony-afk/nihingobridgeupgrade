/**
 * KANJIDIC2 Two-Pass Dry-Run Engine — Phase 14.4B.
 *
 * Implements bounded-memory streaming execution of the complete 13,108-entry KANJIDIC2 corpus.
 *
 * HARD GATES:
 * - ZERO DATABASE WRITES
 * - IDEMPOTENCY: Run 1 output hash == Run 2 output hash
 * - BOUNDED MEMORY
 */

import { createReadStream, writeFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { Client } from "pg";
import { streamKanjidicCharacters } from "../src/etl/kanji/xmlParser";
import { transformKanjidicCharacter } from "../src/etl/kanji/transformer";
import type {
  CanonicalKanjiRecord,
  KanjidicDryRunReport,
} from "../src/etl/kanji/types";

export interface DryRunIterationResult {
  runIndex: number;
  totalRecords: number;
  validRecords: number;
  rejectedRecords: number;
  warningsCount: number;
  onReadingsCount: number;
  kunReadingsCount: number;
  nanoriCount: number;
  kanjiWithMeaningsCount: number;
  kanjiWithJlptCount: number;
  kanjiWithGradeCount: number;
  kanjiWithFrequencyCount: number;
  kanjiWithVariantsCount: number;
  kanjiWithRadicalsCount: number;
  strokeCountDistribution: Record<number, number>;
  digest: string;
  durationMs: number;
  throughput: number;
  peakHeapMb: number;
  peakRssMb: number;
  sampleIds: Array<{ char: string; id: string }>;
}

export async function executeSingleDryRun(
  runIndex: number,
  existingIdMap?: Map<string, string>
): Promise<DryRunIterationResult> {
  const xmlPath = resolve(process.cwd(), "data/kanjidic2.xml");
  const startTime = Date.now();

  let totalRecords = 0;
  let validRecords = 0;
  let rejectedRecords = 0;
  let warningsCount = 0;
  let onReadingsCount = 0;
  let kunReadingsCount = 0;
  let nanoriCount = 0;
  let kanjiWithMeaningsCount = 0;
  let kanjiWithJlptCount = 0;
  let kanjiWithGradeCount = 0;
  let kanjiWithFrequencyCount = 0;
  let kanjiWithVariantsCount = 0;
  let kanjiWithRadicalsCount = 0;

  const strokeCountDistribution: Record<number, number> = {};
  const hasher = createHash("sha256");
  const sampleIds: Array<{ char: string; id: string }> = [];

  let peakHeapBytes = 0;
  let peakRssBytes = 0;

  const stream = createReadStream(xmlPath, { encoding: "utf-8" });

  for await (const rawChar of streamKanjidicCharacters(stream)) {
    totalRecords++;

    const mem = process.memoryUsage();
    if (mem.heapUsed > peakHeapBytes) peakHeapBytes = mem.heapUsed;
    if (mem.rss > peakRssBytes) peakRssBytes = mem.rss;

    const res = transformKanjidicCharacter(rawChar, existingIdMap);

    if (!res.isValid || !res.record) {
      rejectedRecords++;
      continue;
    }

    validRecords++;
    warningsCount += res.warnings.length;

    const rec = res.record;
    onReadingsCount += rec.readingsOn.length;
    kunReadingsCount += rec.readingsKun.length;
    nanoriCount += rec.readingsNanori.length;

    if (rec.meanings.length > 0) kanjiWithMeaningsCount++;
    if (rec.jlptLevel !== "NONE") kanjiWithJlptCount++;
    if (rec.gradeLevel !== null) kanjiWithGradeCount++;
    if (rec.frequencyRank !== null) kanjiWithFrequencyCount++;
    if (rec.variants.length > 0) kanjiWithVariantsCount++;
    if (rec.classicalRadical !== null) kanjiWithRadicalsCount++;

    strokeCountDistribution[rec.strokeCount] =
      (strokeCountDistribution[rec.strokeCount] || 0) + 1;

    // Cryptographic stream digest input
    const signature = `${rec.id}|${rec.character}|${rec.unicode}|${rec.strokeCount}|${rec.gradeLevel}|${rec.jlptLevel}|${rec.classicalRadical}|${rec.primaryMeaning}|${rec.readingsOn.join(",")}|${rec.readingsKun.join(",")}\n`;
    hasher.update(signature);

    if (sampleIds.length < 10) {
      sampleIds.push({ char: rec.character, id: rec.id });
    }
  }

  const durationMs = Date.now() - startTime;
  const throughput = Math.round((totalRecords / (durationMs || 1)) * 1000);
  const digest = hasher.digest("hex");

  return {
    runIndex,
    totalRecords,
    validRecords,
    rejectedRecords,
    warningsCount,
    onReadingsCount,
    kunReadingsCount,
    nanoriCount,
    kanjiWithMeaningsCount,
    kanjiWithJlptCount,
    kanjiWithGradeCount,
    kanjiWithFrequencyCount,
    kanjiWithVariantsCount,
    kanjiWithRadicalsCount,
    strokeCountDistribution,
    digest,
    durationMs,
    throughput,
    peakHeapMb: Math.round((peakHeapBytes / 1024 / 1024) * 10) / 10,
    peakRssMb: Math.round((peakRssBytes / 1024 / 1024) * 10) / 10,
    sampleIds,
  };
}

export async function runFullTwoPassDryRun(): Promise<{
  run1: DryRunIterationResult;
  run2: DryRunIterationResult;
  isIdempotent: boolean;
  dbUnmutated: boolean;
}> {
  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  });
  await client.connect();

  // Baseline row counts before dry run
  const kanjiCountBefore = (
    await client.query("SELECT count(*) FROM kanji_entries")
  ).rows[0].count;
  const dictCountBefore = (
    await client.query("SELECT count(*) FROM dictionary_entries")
  ).rows[0].count;

  // Build existing canonical ID map
  const existingRows = (
    await client.query("SELECT character, id FROM kanji_entries")
  ).rows;
  const existingIdMap = new Map<string, string>();
  for (const r of existingRows) {
    existingIdMap.set(r.character, r.id);
  }

  console.log(`Starting Run 1 (Full Corpus)...`);
  const run1 = await executeSingleDryRun(1, existingIdMap);
  console.log(
    `Run 1 Complete: ${run1.validRecords}/${run1.totalRecords} records in ${run1.durationMs}ms (${run1.throughput} rec/sec). Digest: ${run1.digest}`
  );

  // Intermediate DB verification
  const kanjiCountMid = (
    await client.query("SELECT count(*) FROM kanji_entries")
  ).rows[0].count;
  const dictCountMid = (
    await client.query("SELECT count(*) FROM dictionary_entries")
  ).rows[0].count;

  console.log(`Starting Run 2 (Full Corpus Re-run)...`);
  const run2 = await executeSingleDryRun(2, existingIdMap);
  console.log(
    `Run 2 Complete: ${run2.validRecords}/${run2.totalRecords} records in ${run2.durationMs}ms (${run2.throughput} rec/sec). Digest: ${run2.digest}`
  );

  // Final DB verification
  const kanjiCountAfter = (
    await client.query("SELECT count(*) FROM kanji_entries")
  ).rows[0].count;
  const dictCountAfter = (
    await client.query("SELECT count(*) FROM dictionary_entries")
  ).rows[0].count;

  await client.end();

  const isIdempotent =
    run1.totalRecords === run2.totalRecords &&
    run1.validRecords === run2.validRecords &&
    run1.rejectedRecords === run2.rejectedRecords &&
    run1.digest === run2.digest;

  const dbUnmutated =
    kanjiCountBefore === kanjiCountMid &&
    kanjiCountMid === kanjiCountAfter &&
    dictCountBefore === dictCountMid &&
    dictCountMid === dictCountAfter;

  return { run1, run2, isIdempotent, dbUnmutated };
}

if (process.argv[1]?.endsWith("dry-run-kanjidic2.ts")) {
  runFullTwoPassDryRun()
    .then(({ run1, run2, isIdempotent, dbUnmutated }) => {
      console.log(`\n=== KANJIDIC2 TWO-PASS DRY-RUN SUMMARY ===`);
      console.log(`Run 1 Digest: ${run1.digest}`);
      console.log(`Run 2 Digest: ${run2.digest}`);
      console.log(`Idempotency Check: ${isIdempotent ? "PASS (IDENTICAL)" : "FAIL"}`);
      console.log(`Database Unmutated Check: ${dbUnmutated ? "PASS (0 WRITES)" : "FAIL"}`);
      console.log(`Peak Heap: ${Math.max(run1.peakHeapMb, run2.peakHeapMb)} MB`);
      console.log(`Peak RSS: ${Math.max(run1.peakRssMb, run2.peakRssMb)} MB`);
      process.exit(isIdempotent && dbUnmutated ? 0 : 1);
    })
    .catch((err) => {
      console.error("Dry run execution failed:", err);
      process.exit(1);
    });
}
