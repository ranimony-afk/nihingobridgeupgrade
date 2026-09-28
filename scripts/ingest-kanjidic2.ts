/**
 * Controlled KANJIDIC2 Canonical Ingestion Engine — Phase 14.4C.
 *
 * Implements safe, bounded, idempotent ingestion of the verified KANJIDIC2 corpus (13,108 records)
 * into the local PostgreSQL baseline (127.0.0.1 loopback only).
 *
 * HARD GATES & INVARIANTS (enforced INDEPENDENTLY by this engine, in order):
 * 1. CONSUME-TIME SOURCE IDENTITY: data/kanjidic2.xml must match the 14.4B pinned contract
 *    (XML SHA-256, exact byte size, official headers 4/2023-232/2023-08-20, exactly 13,108
 *    balanced <character> records) — fail closed before ANY database access.
 * 2. TARGET CLASSIFICATION: assertSafeDatabaseUrl (loopback + provider denylist) AND
 *    classifyDatabaseTarget decision === "ALLOW" (explicit NIHONGO_DB_TARGET_CLASS=disposable +
 *    NIHONGO_DB_EXPECTED_DATABASE exact match). "Loopback is not authorization."
 * 3. BASELINE PRECONDITION: exactly 45 first-party rows (33 first-party:kanji-mindtree:v1 +
 *    12 first-party:kanji-corpus:v1) and no foreign rows; fail closed otherwise.
 * 4. CLASSIFICATION of the 13,108 source records with duplicate-source refusal
 *    (fail before first write) and exact reconciliation accounting.
 * 5. SINGLE TRANSACTION: all canonical writes run inside one BEGIN/COMMIT; any failure
 *    rolls back to ZERO canonical rows (run-level transactional safety — a failed
 *    ingestion never leaves partial canonical state).
 * 6. Zero destructive modifications of existing first-party records (45 canonical records preserved).
 * 7. Exact reconciliation: 13,063 INSERT, 44 KEEP_EXISTING, 1 CONFLICT (KEEP_EXISTING: 箸), 0 SKIP.
 * 8. Deterministic IDs: "kanji-${char}" for new records; existing IDs unchanged.
 * 9. Strict idempotency: Run 1 inserts 13,063; Run 2 inserts 0.
 * 10. Provenance: "upstream:kanjidic2:2023-08" for new entries; original provenance preserved for baseline.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { Readable } from "stream";
import { Client } from "pg";
import { AUTHORITATIVE_SOURCE_REGISTRY } from "../src/services/knowledge/provenance";
import { streamKanjidicCharacters } from "../src/etl/kanji/xmlParser";
import { transformKanjidicCharacter } from "../src/etl/kanji/transformer";
import type { RawKanjidicCharacter } from "../src/etl/kanji/types";
import {
  assertOfficialKanjidic2Scan,
  assertOfficialKanjidicByteSize,
  Kanjidic2ByteScan,
  EXPECTED_KANJIDIC2_SHA256,
  EXPECTED_KANJIDIC2_BYTES,
  EXPECTED_KANJIDIC2_ENTRIES,
  KANJIDIC2_SOURCE_ID,
} from "../src/etl/kanji/kanjidic2Contract";
import { classifyDatabaseTarget } from "../src/etl/dictionary/targetClassification";

export interface ConflictRecord {
  character: string;
  existingId: string;
  conflictField: string;
  existingValue: unknown;
  kanjidicValue: unknown;
  existingSource: string;
  upstreamSource: string;
  reason: string;
  decision: "KEEP_EXISTING";
}

export interface IngestionExecutionResult {
  runIndex: number;
  totalRecordsProcessed: number;
  insertedCount: number;
  keepExistingCount: number;
  conflictCount: number;
  skipCount: number;
  unexpectedUpdatesCount: number;
  duplicatesCount: number;
  driftCount: number;
  totalKanjiInDb: number;
  digest: string;
  durationMs: number;
  conflicts: ConflictRecord[];
}

export interface IngestionOptions {
  /** Artifact path override for verification tests. Identity EXPECTATIONS are never overridable. */
  artifactPath?: string;
  /**
   * Bounded reset semantics: delete only rows stamped `upstream:kanjidic2:2023-08`
   * INSIDE the same transaction as the canonical inserts, so a failed run cannot
   * leave the database partially reset. First-party, dictionary, and unrelated
   * rows are never deleted.
   */
  fromBaseline?: boolean;
  /**
   * Verification seam: awaited before each insert batch (batchIndex = 0, 1, …).
   * Used by the additive gate tests to force a mid-run failure and prove rollback.
   * Inert unless a caller passes it.
   */
  onBeforeBatch?: (batchIndex: number) => void | Promise<void>;
}

export function assertSafeDatabaseUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || "5432", 10);

  const isLoopback =
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0";

  const isForbidden =
    host.includes("supabase.co") ||
    host.includes("pooler.supabase.com") ||
    host.includes("neon.tech") ||
    host.includes("vercel-storage.com") ||
    host.includes("aws-0-ap-northeast-1");

  if (!isLoopback || isForbidden) {
    throw new Error(
      `ABSOLUTE SAFETY GATE FAILED: Host '${host}' is forbidden for ingestion. Only 127.0.0.1 is authorized.`
    );
  }

  return { host, port };
}

/**
 * Target classification gate for the canonical write path (Gate 2 of the
 * ingestion sequence). ALLOW is returned only for an explicit disposable
 * declaration whose host is exact loopback and whose database name matches
 * NIHONGO_DB_EXPECTED_DATABASE. "Loopback is not authorization."
 */
export function assertIngestionTarget(dbUrl: string): void {
  assertSafeDatabaseUrl(dbUrl);
  const verdict = classifyDatabaseTarget({
    connectionString: dbUrl,
    declaredClass: process.env.NIHONGO_DB_TARGET_CLASS,
    expectedDatabase: process.env.NIHONGO_DB_EXPECTED_DATABASE,
  });
  if (verdict.decision !== "ALLOW") {
    throw new Error(
      `[TARGET_CLASSIFICATION] STOP — ${verdict.reason} ` +
        `(classification=${verdict.classification}, decision=${verdict.decision}). ` +
        `Set NIHONGO_DB_TARGET_CLASS=disposable and NIHONGO_DB_EXPECTED_DATABASE to the exact database name.`
    );
  }
}

/**
 * Consume-time artifact identity verification (Gate 1). Re-checks the FULL
 * 14.4B pinned identity against the bytes actually about to be ingested:
 * exact size, exact SHA-256, official header versions, balanced records,
 * and the exact 13,108 entry count. Fails closed on any mismatch.
 * Returns the verified bytes for streaming.
 */
export function verifyKanjidic2Artifact(xmlPath: string): Buffer {
  let xml: Buffer;
  try {
    xml = readFileSync(xmlPath);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`[SOURCE_VERIFIED] STOP — SOURCE UNREADABLE${detail}`);
  }
  assertOfficialKanjidicByteSize(xml.length, EXPECTED_KANJIDIC2_BYTES);
  const actualSha256 = createHash("sha256").update(xml).digest("hex");
  if (actualSha256 !== EXPECTED_KANJIDIC2_SHA256) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE SHA MISMATCH: expected ${EXPECTED_KANJIDIC2_SHA256}, got ${actualSha256}`
    );
  }
  const scan = new Kanjidic2ByteScan();
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < xml.length; offset += chunkSize) {
    scan.feed(xml.subarray(offset, Math.min(offset + chunkSize, xml.length)));
  }
  // Enforces official headers, balanced <character> tags, and entry count === 13,108.
  assertOfficialKanjidic2Scan(scan);
  return xml;
}

export interface ExistingKanjiRow {
  id: string;
  character: string;
  stroke_count: number;
  meaning: string;
  jlpt_level: string | null;
  grade_level: number | null;
  primary_radical_id: string | null;
  source_ref: string;
}

export interface IngestionPlanRow {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  gradeLevel: number | null;
  primaryRadicalId: string | null;
  sourceRef: string;
}

export interface IngestionPlan {
  toInsert: IngestionPlanRow[];
  conflicts: ConflictRecord[];
  keepExistingCount: number;
  skipCount: number;
  duplicatesCount: number;
  totalRecordsProcessed: number;
  digest: string;
}

/**
 * Classify every source record against the baseline snapshot (Gate 4).
 * - Duplicate source records (same <literal> twice) fail closed immediately,
 *   before any write.
 * - Existing characters are NEVER written (KEEP_EXISTING); stroke mismatches
 *   are recorded as conflicts.
 * - New characters get deterministic IDs "kanji-${character}".
 * Digest input is canonical and stream-ordered (identical across runs).
 */
export async function planKanjidicIngestion(
  records: AsyncIterable<RawKanjidicCharacter> | Iterable<RawKanjidicCharacter>,
  existingMap: Map<string, ExistingKanjiRow>,
  radicalMap: Map<number, string>,
  sourceRef: string
): Promise<IngestionPlan> {
  let totalRecordsProcessed = 0;
  let keepExistingCount = 0;
  let skipCount = 0;
  let duplicatesCount = 0;
  const conflicts: ConflictRecord[] = [];
  const toInsert: IngestionPlanRow[] = [];
  const seenLiterals = new Set<string>();
  const hasher = createHash("sha256");

  for await (const raw of records as AsyncIterable<RawKanjidicCharacter>) {
    totalRecordsProcessed++;

    if (seenLiterals.has(raw.literal)) {
      duplicatesCount++;
      throw new Error(
        `[SOURCE_VERIFIED] STOP — DUPLICATE SOURCE RECORD: "${raw.literal}" appears more than once in the source corpus`
      );
    }
    seenLiterals.add(raw.literal);

    const res = transformKanjidicCharacter(raw);

    if (!res.isValid || !res.record) {
      skipCount++;
      continue;
    }

    const rec = res.record;
    const existing = existingMap.get(rec.character);

    // Cryptographic stream digest (canonical record line, stream order)
    hasher.update(
      `${rec.character}:${rec.strokeCount}:${rec.jlptLevel}:${rec.readingsOn.join(",")}:${rec.readingsKun.join(",")}\n`
    );

    if (existing) {
      if (existing.stroke_count !== rec.strokeCount) {
        conflicts.push({
          character: rec.character,
          existingId: existing.id,
          conflictField: "stroke_count",
          existingValue: existing.stroke_count,
          kanjidicValue: rec.strokeCount,
          existingSource: existing.source_ref,
          upstreamSource: sourceRef,
          reason: "Baseline stroke convention vs classical Kangxi radical decomposition",
          decision: "KEEP_EXISTING",
        });
      } else {
        keepExistingCount++;
      }
      // Never overwrite existing baseline records!
    } else {
      const primaryRadicalId = rec.classicalRadical
        ? radicalMap.get(rec.classicalRadical) || null
        : null;

      toInsert.push({
        id: `kanji-${rec.character}`,
        character: rec.character,
        meaning: rec.primaryMeaning || "",
        readingsKun: rec.readingsKun,
        readingsOn: rec.readingsOn,
        strokeCount: rec.strokeCount,
        jlptLevel: rec.jlptLevel,
        gradeLevel: rec.gradeLevel,
        primaryRadicalId,
        sourceRef,
      });
    }
  }

  return {
    toInsert,
    conflicts,
    keepExistingCount,
    skipCount,
    duplicatesCount,
    totalRecordsProcessed,
    digest: hasher.digest("hex"),
  };
}

/**
 * Exact reconciliation accounting gate (Gate 5), evaluated BEFORE the
 * transaction opens. `preexistingUpstream` is the number of source characters
 * already present as upstream rows (0 on Run 1; 13,063 on Run 2), so the gate
 * is state-aware while the locked corpus constants stay absolute:
 *   inserts + preexisting = 13,063   matched = 44 + preexisting
 *   conflicts = exactly 1 (箸: kj-hashi 14 vs KANJIDIC2 15, KEEP_EXISTING)
 *   skips = 0   duplicates = 0   processed = 13,108
 */
function assertReconciliationAccounting(plan: IngestionPlan, preexistingUpstream: number): void {
  const expectedInsert = 13063 - preexistingUpstream;
  const expectedMatched = 44 + preexistingUpstream;
  const c = plan.conflicts;

  const conflictOk =
    c.length === 1 &&
    c[0].character === "箸" &&
    c[0].existingId === "kj-hashi" &&
    c[0].existingValue === 14 &&
    c[0].kanjidicValue === 15 &&
    c[0].decision === "KEEP_EXISTING";

  if (
    plan.totalRecordsProcessed !== EXPECTED_KANJIDIC2_ENTRIES ||
    plan.skipCount !== 0 ||
    plan.duplicatesCount !== 0 ||
    !conflictOk ||
    plan.toInsert.length !== expectedInsert ||
    plan.keepExistingCount !== expectedMatched
  ) {
    throw new Error(
      `[RECONCILIATION] STOP — ACCOUNTING MISMATCH before first write: ` +
        `processed=${plan.totalRecordsProcessed} (expected ${EXPECTED_KANJIDIC2_ENTRIES}), ` +
        `inserts=${plan.toInsert.length} (expected ${expectedInsert}), ` +
        `matched=${plan.keepExistingCount} (expected ${expectedMatched}), ` +
        `conflicts=${c.length} (expected 1: 箸/kj-hashi/14-vs-15 KEEP_EXISTING), ` +
        `skips=${plan.skipCount} (expected 0), duplicates=${plan.duplicatesCount} (expected 0)`
    );
  }
}

export async function executeKanjidicIngestion(
  runIndex: number,
  options: IngestionOptions = {}
): Promise<IngestionExecutionResult> {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

  const sourceRef = KANJIDIC2_SOURCE_ID;

  // ---- Gate 1: consume-time source identity (before ANY database access) ----
  const xmlPath = resolve(
    process.cwd(),
    options.artifactPath ?? "data/kanjidic2.xml"
  );
  const xml = verifyKanjidic2Artifact(xmlPath);

  // ---- Gate 2: target classification (loopback is not authorization) ----
  assertIngestionTarget(dbUrl);

  if (!AUTHORITATIVE_SOURCE_REGISTRY[sourceRef]) {
    throw new Error(`Provenance registry missing required source: ${sourceRef}`);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const startTime = Date.now();

  try {
    // ---- Gate 3: exact first-party baseline precondition (fail before first write) ----
    const fpRows = (
      await client.query(`
        SELECT source_ref, count(*)::int AS n
        FROM kanji_entries
        WHERE source_ref LIKE 'first-party:%'
        GROUP BY 1
      `)
    ).rows as Array<{ source_ref: string; n: number }>;
    const mindtree = fpRows.find((r) => r.source_ref === "first-party:kanji-mindtree:v1")?.n ?? 0;
    const corpus = fpRows.find((r) => r.source_ref === "first-party:kanji-corpus:v1")?.n ?? 0;
    const firstPartyTotal = mindtree + corpus;
    const preexistingUpstream = parseInt(
      (
        await client.query(
          "SELECT count(*) FROM kanji_entries WHERE source_ref = $1",
          [sourceRef]
        )
      ).rows[0].count,
      10
    );
    const totalBefore = parseInt(
      (await client.query("SELECT count(*) FROM kanji_entries")).rows[0].count,
      10
    );

    if (firstPartyTotal !== 45 || mindtree !== 33 || corpus !== 12 || totalBefore !== 45 + preexistingUpstream) {
      throw new Error(
        `[BASELINE] STOP — FIRST-PARTY BASELINE PRECONDITION FAILED before first write: ` +
          `expected exactly 45 rows (33 first-party:kanji-mindtree:v1 + 12 first-party:kanji-corpus:v1) ` +
          `and no foreign rows; found mindtree=${mindtree}, corpus=${corpus}, first-party=${firstPartyTotal}, ` +
          `upstream=${preexistingUpstream}, total=${totalBefore}`
      );
    }

    // 2. Load radical mapping (classical Kangxi radical number -> kanji_radicals.id)
    const radRows = (
      await client.query(`
        SELECT id, kangxi_number
        FROM kanji_radicals
        WHERE kangxi_number IS NOT NULL AND category = 'radical'
      `)
    ).rows as Array<{ id: string; kangxi_number: number }>;
    const radicalMap = new Map<number, string>();
    for (const r of radRows) {
      radicalMap.set(r.kangxi_number, r.id);
    }

    // Baseline snapshot (character -> existing row); existing rows are never written.
    // With fromBaseline, upstream-stamped rows are excluded: they will be deleted
    // inside the transaction before the inserts, so the plan re-inserts them.
    const baselineRows = (
      await client.query(`
        SELECT id, character, stroke_count, meaning, jlpt_level, grade_level, primary_radical_id, source_ref
        FROM kanji_entries
      `)
    ).rows as ExistingKanjiRow[];
    const existingMap = new Map<string, ExistingKanjiRow>();
    for (const r of baselineRows) {
      if (options.fromBaseline && r.source_ref === sourceRef) continue;
      existingMap.set(r.character, r);
    }

    // ---- Gates 4–5: classify the 13,108 source records (duplicate refusal) + exact accounting ----
    const plan = await planKanjidicIngestion(
      streamKanjidicCharacters(Readable.from([xml.toString("utf-8")])),
      existingMap,
      radicalMap,
      sourceRef
    );
    assertReconciliationAccounting(
      plan,
      options.fromBaseline ? 0 : preexistingUpstream
    );

    // ---- Gates 6–8: ONE transaction for the entire canonical write ----
    let insertedCount = 0;
    const BATCH_SIZE = 200;

    await client.query("BEGIN");
    try {
      if (options.fromBaseline) {
        // Bounded reset: only upstream-stamped rows; first-party/dictionary/unrelated
        // rows are structurally unreachable by this DELETE. Runs inside the same
        // transaction as the inserts below.
        await client.query(
          "DELETE FROM kanji_entries WHERE source_ref = $1",
          [sourceRef]
        );
      }
      for (let i = 0, batchIndex = 0; i < plan.toInsert.length; i += BATCH_SIZE, batchIndex++) {
        if (options.onBeforeBatch) {
          await options.onBeforeBatch(batchIndex);
        }
        const chunk = plan.toInsert.slice(i, i + BATCH_SIZE);
        if (chunk.length === 0) continue;

        const placeholders: string[] = [];
        const values: unknown[] = [];

        chunk.forEach((item, rowIdx) => {
          const offset = rowIdx * 12;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`
          );
          values.push(
            item.id,
            item.character,
            item.meaning,
            JSON.stringify(item.readingsKun),
            JSON.stringify(item.readingsOn),
            item.strokeCount,
            item.jlptLevel,
            item.gradeLevel,
            item.primaryRadicalId,
            null, // mnemonic
            JSON.stringify([]), // vocabulary
            item.sourceRef
          );
        });

        const queryText = `
          INSERT INTO kanji_entries (
            id, character, meaning, readings_kun, readings_on,
            stroke_count, jlpt_level, grade_level, primary_radical_id,
            mnemonic, vocabulary, source_ref
          ) VALUES ${placeholders.join(", ")}
          ON CONFLICT (character) DO NOTHING
        `;

        const res = await client.query(queryText, values);
        if (res.rowCount) {
          insertedCount += res.rowCount;
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      // Run-level transactional safety: a failed ingestion leaves ZERO canonical rows.
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    // ---- Gate 9: post-verify ----
    const totalKanjiInDb = parseInt(
      (await client.query("SELECT count(*) FROM kanji_entries")).rows[0].count,
      10
    );
    if (totalKanjiInDb !== 13108) {
      throw new Error(
        `[POST-VERIFY] STOP — canonical row count ${totalKanjiInDb} != 13108 after commit`
      );
    }

    const durationMs = Date.now() - startTime;

    return {
      runIndex,
      totalRecordsProcessed: plan.totalRecordsProcessed,
      insertedCount,
      keepExistingCount: plan.keepExistingCount,
      conflictCount: plan.conflicts.length,
      skipCount: plan.skipCount,
      unexpectedUpdatesCount: 0,
      duplicatesCount: plan.duplicatesCount,
      driftCount: 0,
      totalKanjiInDb,
      digest: plan.digest,
      durationMs,
      conflicts: plan.conflicts,
    };
  } finally {
    await client.end();
  }
}

export async function runTwoPassIngestion(options?: { fromBaseline?: boolean }): Promise<{
  run1: IngestionExecutionResult;
  run2: IngestionExecutionResult;
  isIdempotent: boolean;
}> {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  assertIngestionTarget(dbUrl);

  console.log("=== PHASE 14.4C: CONTROLLED KANJIDIC2 INGESTION ===");
  console.log("Starting Run 1 (Initial Ingestion)...");
  const run1 = await executeKanjidicIngestion(1, {
    fromBaseline: options?.fromBaseline,
  });
  console.log(
    `Run 1 Complete in ${run1.durationMs}ms: Inserted=${run1.insertedCount}, KeepExisting=${run1.keepExistingCount}, Conflict=${run1.conflictCount}, TotalInDb=${run1.totalKanjiInDb}`
  );

  console.log("Starting Run 2 (Idempotency Re-run)...");
  const run2 = await executeKanjidicIngestion(2);
  console.log(
    `Run 2 Complete in ${run2.durationMs}ms: Inserted=${run2.insertedCount}, KeepExisting=${run2.keepExistingCount}, Conflict=${run2.conflictCount}, TotalInDb=${run2.totalKanjiInDb}`
  );

  const isIdempotent =
    run2.insertedCount === 0 &&
    run2.unexpectedUpdatesCount === 0 &&
    run2.duplicatesCount === 0 &&
    run2.driftCount === 0 &&
    run1.totalKanjiInDb === 13108 &&
    run2.totalKanjiInDb === 13108 &&
    run1.digest === run2.digest;

  return { run1, run2, isIdempotent };
}

if (process.argv[1]?.endsWith("ingest-kanjidic2.ts")) {
  const fromBaseline = process.argv.includes("--from-baseline");
  runTwoPassIngestion({ fromBaseline })
    .then(({ run1, run2, isIdempotent }) => {
      console.log("\n=== INGESTION & IDEMPOTENCY SUMMARY ===");
      console.log(`Run 1 Inserted: ${run1.insertedCount}`);
      console.log(`Run 2 Inserted: ${run2.insertedCount}`);
      console.log(`Total in DB: ${run2.totalKanjiInDb}`);
      console.log(`Idempotency Check: ${isIdempotent ? "PASS" : "FAIL"}`);
      process.exit(isIdempotent ? 0 : 1);
    })
    .catch((err) => {
      console.error("Ingestion failed:", err);
      process.exit(1);
    });
}
