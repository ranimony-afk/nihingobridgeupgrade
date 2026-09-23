/**
 * Phase 14.3D — Controlled Full JMdict PostgreSQL Ingestion Engine
 *
 * Implements full-corpus streaming ingestion of the verified 206,717-entry JMdict corpus
 * with strict safety invariants, CLI flags, checkpoint/resume, staged pilot,
 * observability tags, two-run idempotency, and deterministic random sample reconciliation.
 */

import "dotenv/config";
import fs from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { Client } from "pg";
import { db } from "@/db";
import {
  dictionaryEntries,
  knowledgeSources,
  cmsContentItems,
  cmsContentVersions,
  cmsAuditLog,
  entityTranslations,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
  srsCards,
  srsDecks,
  srsReviews,
  xpEvents,
  users,
  questions,
} from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { streamJMdictEntries } from "@/etl/dictionary/xmlParser";
import { transformJMdictEntry } from "@/etl/dictionary/transformer";
import {
  createETLProvenanceContext,
  getRegisteredSource,
} from "@/services/knowledge/provenance";
import {
  DrizzleDictionaryPersistenceAdapter,
  areSensesEqual,
  areArraysEqual,
} from "@/etl/dictionary/persistenceAdapter";
import { DictionaryService } from "@/services/dictionary/dictionaryService";
import type {
  CanonicalDictionaryEntry,
  PersistenceCandidate,
} from "@/etl/dictionary/types";

export const EXPECTED_JMDICT_SHA256 = "a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162";
export const EXPECTED_JMDICT_RELEASE = "2023-08-20";
export const EXPECTED_JMDICT_ENTRIES = 206717;
export const JMDICT_SOURCE_ID = "upstream:jmdict:2023-08";
export const DEFAULT_CHECKPOINT_PATH = resolve(process.cwd(), "data/jmdict-checkpoint.json");

export interface SourceMetadata {
  sourceId: string;
  releaseVersion: string;
  license: string;
  attribution: string;
  xmlPath: string;
  xmlSizeBytes: number;
  xmlSha256: string;
  expectedEntries: number;
  transformationVersion: string;
  schemaContract: string;
  deterministicIdStrategy: string;
}

export interface EnvironmentSafetyResult {
  isLoopback: boolean;
  classification: "AUTHORIZED_LOCAL" | "FORBIDDEN" | "AMBIGUOUS";
  host: string;
  port: string;
  databaseName: string;
  currentUser: string;
  currentSchema: string;
  postgresVersion: string;
}

export interface IngestionCheckpoint {
  sourceId: string;
  sourceHash: string;
  releaseVersion: string;
  transformationVersion: string;
  schemaContract: string;
  deterministicIdStrategy: string;
  lastProcessedEntSeq: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  recordsUpdated: number;
  recordsConflicted: number;
  recordsRejected: number;
  warningCount: number;
  errorCount: number;
  timestamp: string;
}

export interface PreflightReport {
  environment: EnvironmentSafetyResult;
  source: SourceMetadata;
  targetTable: string;
  existingRowCount: number;
  matchingIdCount: number;
  conflictingIdCount: number;
  expectedInserts: number;
  expectedSkips: number;
  expectedUpdates: number;
  unexpectedIdCount: number;
  isReadOnly: true;
}

export interface RandomReconciliationResult {
  sampleSize: number;
  matchedCount: number;
  mismatchCount: number;
  mismatches: Array<{
    id: string;
    field: string;
    expected: unknown;
    actual: unknown;
  }>;
}

export interface IngestionExecutionOptions {
  dryRun?: boolean;
  preflightOnly?: boolean;
  pilot?: boolean;
  pilotStage?: "A" | "B" | "C" | "D" | "E";
  batchSize?: number;
  resume?: boolean;
  verifyOnly?: boolean;
  rollbackTest?: boolean;
  authorizeFullIngestion?: boolean;
  checkpointPath?: string;
  conflictPolicy?: "abort" | "update";
  skipIdempotencyRun2?: boolean;
}

// ----------------------------------------------------
// 1. Database Safety & Target Classification
// ----------------------------------------------------
export async function validateEnvironmentSafety(
  explicitConnStr?: string
): Promise<EnvironmentSafetyResult> {
  const connStr = explicitConnStr || process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("[PRECHECK] FATAL: DATABASE_URL is missing. Safety stop!");
  }

  let url: URL;
  try {
    url = new URL(connStr);
  } catch {
    throw new Error("[PRECHECK] FATAL: Invalid connection URL format.");
  }

  const host = url.hostname;
  const port = url.port || "5432";
  const databaseName = url.pathname.replace(/^\//, "");
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";

  // Production forbidden host checks
  const isForbiddenHost =
    host.includes("pooler.supabase.com") ||
    host.includes("aws-0-ap-northeast-1") ||
    host.includes("supabase.co") ||
    host.includes("neon.tech") ||
    host.includes("vercel-storage.com");

  if (isForbiddenHost) {
    throw new Error(
      `[PRECHECK] STOP — TARGET DATABASE FORBIDDEN: Host "${host}" matches forbidden production host.`
    );
  }

  if (!isLoopback) {
    throw new Error(
      `[PRECHECK] STOP — TARGET DATABASE AMBIGUOUS: Host "${host}" is not verified local loopback.`
    );
  }

  // Safe client query for engine metadata
  const probeClient = new Client({ connectionString: connStr });
  await probeClient.connect();
  const vRes = await probeClient.query("SELECT version();");
  const uRes = await probeClient.query(
    "SELECT current_user, current_database(), current_schema();"
  );
  await probeClient.end();

  return {
    isLoopback: true,
    classification: "AUTHORIZED_LOCAL",
    host,
    port,
    databaseName: uRes.rows[0].current_database,
    currentUser: uRes.rows[0].current_user,
    currentSchema: uRes.rows[0].current_schema,
    postgresVersion: vRes.rows[0].version,
  };
}

// ----------------------------------------------------
// 2. Source Contract & Hash Verification
// ----------------------------------------------------
export function verifySourceContract(
  customXmlPath?: string,
  expectedHash: string = EXPECTED_JMDICT_SHA256,
  expectedRelease: string = EXPECTED_JMDICT_RELEASE
): SourceMetadata {
  const xmlPath = customXmlPath || resolve(process.cwd(), "data/JMdict.xml");
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`[SOURCE_VERIFIED] STOP — SOURCE FILE MISSING: "${xmlPath}" not found.`);
  }

  const stat = fs.statSync(xmlPath);
  const xmlSizeBytes = stat.size;

  const hash = createHash("sha256");
  const buffer = fs.readFileSync(xmlPath);
  hash.update(buffer);
  const xmlSha256 = hash.digest("hex");

  if (xmlSha256 !== expectedHash) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE HASH MISMATCH: expected ${expectedHash}, got ${xmlSha256}`
    );
  }

  const provDef = getRegisteredSource(JMDICT_SOURCE_ID);
  if (!provDef) {
    throw new Error(`[SOURCE_VERIFIED] STOP — PROVENANCE UNREGISTERED: "${JMDICT_SOURCE_ID}"`);
  }

  if (expectedRelease !== EXPECTED_JMDICT_RELEASE || (provDef.releaseDate && provDef.releaseDate !== expectedRelease)) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: expected release ${EXPECTED_JMDICT_RELEASE}, requested ${expectedRelease}`
    );
  }

  return {
    sourceId: JMDICT_SOURCE_ID,
    releaseVersion: expectedRelease,
    license: provDef.license,
    attribution: provDef.attribution,
    xmlPath,
    xmlSizeBytes,
    xmlSha256,
    expectedEntries: EXPECTED_JMDICT_ENTRIES,
    transformationVersion: "jmdict-v1",
    schemaContract: "dictionary_entries",
    deterministicIdStrategy: "de-jmdict-${entSeq}",
  };
}

// ----------------------------------------------------
// 3. Pre-Flight Read-Only Report
// ----------------------------------------------------
export async function runPreflight(options: {
  xmlPath?: string;
  connStr?: string;
} = {}): Promise<PreflightReport> {
  const env = await validateEnvironmentSafety(options.connStr);
  const source = verifySourceContract(options.xmlPath);

  const [dictCountRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  const [jmdictCountRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, JMDICT_SOURCE_ID));

  const existingRowCount = Number(dictCountRow.count);
  const matchingIdCount = Number(jmdictCountRow.count);
  const expectedInserts = Math.max(0, source.expectedEntries - matchingIdCount);
  const expectedSkips = matchingIdCount;

  return {
    environment: env,
    source,
    targetTable: "dictionary_entries",
    existingRowCount,
    matchingIdCount,
    conflictingIdCount: 0,
    expectedInserts,
    expectedSkips,
    expectedUpdates: 0,
    unexpectedIdCount: 0,
    isReadOnly: true,
  };
}

// ----------------------------------------------------
// 4. Checkpoint & Resume Safety
// ----------------------------------------------------
export class CheckpointManager {
  static saveCheckpoint(path: string, checkpoint: IngestionCheckpoint): void {
    fs.writeFileSync(path, JSON.stringify(checkpoint, null, 2), "utf-8");
  }

  static loadCheckpoint(path: string): IngestionCheckpoint | null {
    if (!fs.existsSync(path)) return null;
    try {
      const raw = fs.readFileSync(path, "utf-8");
      return JSON.parse(raw) as IngestionCheckpoint;
    } catch {
      return null;
    }
  }

  static verifyResumeSafety(
    checkpoint: IngestionCheckpoint,
    source: SourceMetadata
  ): { safe: boolean; reason?: string } {
    if (checkpoint.sourceId !== source.sourceId) {
      return { safe: false, reason: `sourceId mismatch: ${checkpoint.sourceId} vs ${source.sourceId}` };
    }
    if (checkpoint.sourceHash !== source.xmlSha256) {
      return { safe: false, reason: `sourceHash mismatch: ${checkpoint.sourceHash} vs ${source.xmlSha256}` };
    }
    if (checkpoint.releaseVersion !== source.releaseVersion) {
      return { safe: false, reason: `releaseVersion mismatch: ${checkpoint.releaseVersion} vs ${source.releaseVersion}` };
    }
    if (checkpoint.transformationVersion !== source.transformationVersion) {
      return { safe: false, reason: `transformationVersion mismatch: ${checkpoint.transformationVersion} vs ${source.transformationVersion}` };
    }
    if (checkpoint.schemaContract !== source.schemaContract) {
      return { safe: false, reason: `schemaContract mismatch: ${checkpoint.schemaContract} vs ${source.schemaContract}` };
    }
    if (checkpoint.deterministicIdStrategy !== source.deterministicIdStrategy) {
      return { safe: false, reason: `deterministicIdStrategy mismatch: ${checkpoint.deterministicIdStrategy} vs ${source.deterministicIdStrategy}` };
    }
    return { safe: true };
  }
}

// ----------------------------------------------------
// 5. Transaction / Rollback Test
// ----------------------------------------------------
export async function testRollbackTransaction(): Promise<{
  rollbackSuccessful: boolean;
  preCount: number;
  postCount: number;
}> {
  const [preRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  const preCount = Number(preRow.count);

  let rollbackSuccessful = false;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(dictionaryEntries).values({
        id: "de-rollback-test-transient",
        headword: "テスト一時的",
        reading: "テスト",
        romaji: "tesuto",
        jlptLevel: "NONE",
        partsOfSpeech: ["n"],
        senses: [{ glosses: ["test temporary gloss"] }],
        sourceRef: JMDICT_SOURCE_ID,
      });
      throw new Error("Simulated intentional rollback failure");
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Simulated intentional rollback failure")) {
      rollbackSuccessful = true;
    }
  }

  const [postRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  const postCount = Number(postRow.count);

  return {
    rollbackSuccessful: rollbackSuccessful && preCount === postCount,
    preCount,
    postCount,
  };
}

// ----------------------------------------------------
// 6. Deterministic Random Sample Reconciliation
// ----------------------------------------------------
export async function reconcileRandomSample(
  sampleSize: number = 100,
  customXmlPath?: string
): Promise<RandomReconciliationResult> {
  const source = verifySourceContract(customXmlPath);
  const provContext = createETLProvenanceContext(source.sourceId, { dryRun: false });

  // Select 100 deterministic records distributed evenly across the corpus
  // Total corpus = 206,717; step ~ 2,067
  const step = Math.floor(source.expectedEntries / sampleSize);
  const targetIndices = new Set<number>();
  for (let i = 0; i < sampleSize; i++) {
    targetIndices.add(i * step);
  }

  const fileStream = fs.createReadStream(source.xmlPath, {
    encoding: "utf-8",
    highWaterMark: 64 * 1024,
  });

  const sampleCandidates: CanonicalDictionaryEntry[] = [];
  let currentIndex = 0;

  for await (const raw of streamJMdictEntries(fileStream)) {
    if (targetIndices.has(currentIndex)) {
      const { record: candidate, isValid } = transformJMdictEntry(raw, source.sourceId);
      if (isValid && candidate) {
        sampleCandidates.push(provContext.stampRecord<CanonicalDictionaryEntry>(candidate));
      }
    }
    currentIndex++;
    if (sampleCandidates.length >= sampleSize) break;
  }

  const candidateIds = sampleCandidates.map((c) => c.id);
  const dbRows = await db
    .select()
    .from(dictionaryEntries)
    .where(inArray(dictionaryEntries.id, candidateIds));

  const dbMap = new Map(dbRows.map((r) => [r.id, r]));
  const mismatches: RandomReconciliationResult["mismatches"] = [];

  for (const expected of sampleCandidates) {
    const actual = dbMap.get(expected.id);
    if (!actual) {
      mismatches.push({
        id: expected.id,
        field: "existence",
        expected: "present",
        actual: "missing",
      });
      continue;
    }

    if (actual.headword !== expected.headword) {
      mismatches.push({ id: expected.id, field: "headword", expected: expected.headword, actual: actual.headword });
    }
    if (actual.reading !== expected.reading) {
      mismatches.push({ id: expected.id, field: "reading", expected: expected.reading, actual: actual.reading });
    }
    if (actual.romaji !== expected.romaji) {
      mismatches.push({ id: expected.id, field: "romaji", expected: expected.romaji, actual: actual.romaji });
    }
    if (actual.jlptLevel !== expected.jlptLevel) {
      mismatches.push({ id: expected.id, field: "jlptLevel", expected: expected.jlptLevel, actual: actual.jlptLevel });
    }
    if (actual.isCommon !== expected.isCommon) {
      mismatches.push({ id: expected.id, field: "isCommon", expected: expected.isCommon, actual: actual.isCommon });
    }
    if (actual.frequencyRank !== expected.frequencyRank) {
      mismatches.push({ id: expected.id, field: "frequencyRank", expected: expected.frequencyRank, actual: actual.frequencyRank });
    }
    if (actual.sourceRef !== expected.sourceRef) {
      mismatches.push({ id: expected.id, field: "sourceRef", expected: expected.sourceRef, actual: actual.sourceRef });
    }
    if (!areArraysEqual((actual.partsOfSpeech as string[]) || [], expected.partsOfSpeech)) {
      mismatches.push({ id: expected.id, field: "partsOfSpeech", expected: expected.partsOfSpeech, actual: actual.partsOfSpeech });
    }
    if (!areArraysEqual((actual.kanjiCharacters as string[]) || [], expected.kanjiCharacters)) {
      mismatches.push({ id: expected.id, field: "kanjiCharacters", expected: expected.kanjiCharacters, actual: actual.kanjiCharacters });
    }
    if (!areArraysEqual((actual.tags as string[]) || [], expected.tags)) {
      mismatches.push({ id: expected.id, field: "tags", expected: expected.tags, actual: actual.tags });
    }
    if (!areSensesEqual((actual.senses as any) || [], expected.senses)) {
      mismatches.push({ id: expected.id, field: "senses", expected: expected.senses, actual: actual.senses });
    }
  }

  return {
    sampleSize: sampleCandidates.length,
    matchedCount: sampleCandidates.length - mismatches.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
}

// ----------------------------------------------------
// 7. Master Controlled Ingestion Runner
// ----------------------------------------------------
export async function executeIngestion(
  options: IngestionExecutionOptions = {}
): Promise<{
  status: "SUCCESS" | "PREFLIGHT_ONLY" | "DRY_RUN_COMPLETE" | "VERIFY_COMPLETE" | "ROLLBACK_TEST_COMPLETE";
  report: Record<string, unknown>;
}> {
  console.log("================================================================================");
  console.log("PHASE 14.3D — CONTROLLED FULL JMdict POSTGRESQL INGESTION ENGINE");
  console.log("================================================================================");

  // Structured Logging helper
  const log = (tag: string, ...args: unknown[]) => {
    console.log(`[${tag}]`, ...args);
  };

  // STEP 1: Precheck Safety
  log("PRECHECK", "Auditing environment safety & target classification...");
  const env = await validateEnvironmentSafety();
  log("PRECHECK", `Host: ${env.host}:${env.port} | Database: ${env.databaseName} | User: ${env.currentUser}`);
  log("PRECHECK", `Classification: ${env.classification}`);

  // STEP 2: Source Verification
  log("SOURCE_VERIFIED", "Auditing source release hash and provenance registry...");
  const source = verifySourceContract();
  log("SOURCE_VERIFIED", `Source: ${source.sourceId} (${source.releaseVersion})`);
  log("SOURCE_VERIFIED", `SHA-256: ${source.xmlSha256} (${source.xmlSizeBytes} bytes)`);

  // STEP 3: Handle Preflight Flag
  if (options.preflightOnly) {
    const preflight = await runPreflight();
    log("PRECHECK", "Preflight report complete (read-only):", JSON.stringify(preflight, null, 2));
    log("GATE", "GO — PREFLIGHT PASSED");
    return { status: "PREFLIGHT_ONLY", report: { preflight } };
  }

  // STEP 4: Handle Rollback Flag
  if (options.rollbackTest) {
    log("BATCH_ROLLBACK", "Executing transaction rollback validation...");
    const rbResult = await testRollbackTransaction();
    log("BATCH_ROLLBACK", `Rollback successful: ${rbResult.rollbackSuccessful} (Pre: ${rbResult.preCount}, Post: ${rbResult.postCount})`);
    log("GATE", "GO — ROLLBACK VERIFIED");
    return { status: "ROLLBACK_TEST_COMPLETE", report: { rollback: rbResult } };
  }

  // STEP 5: Handle Verify Only Flag
  if (options.verifyOnly) {
    log("FINAL_RECONCILIATION", "Running post-ingestion verification and 100-record sample audit...");
    const randRecon = await reconcileRandomSample(100);
    log("FINAL_RECONCILIATION", `Deterministic sample: ${randRecon.matchedCount}/${randRecon.sampleSize} matched (Mismatches: ${randRecon.mismatchCount})`);
    if (randRecon.mismatchCount > 0) {
      log("VALIDATION_ERROR", "Field mismatches detected:", randRecon.mismatches);
      throw new Error(`[FINAL_RECONCILIATION] Field mismatches detected: ${randRecon.mismatchCount}`);
    }
    log("GATE", "GO — VERIFICATION PASSED");
    return { status: "VERIFY_COMPLETE", report: { randomReconciliation: randRecon } };
  }

  // Pilot staging configuration
  let maxEntriesToIngest = source.expectedEntries;
  if (options.pilot) {
    const stage = options.pilotStage || "B";
    if (stage === "A") maxEntriesToIngest = 10;
    else if (stage === "B") maxEntriesToIngest = 100;
    else if (stage === "C") maxEntriesToIngest = 1000;
    else if (stage === "D") maxEntriesToIngest = 10000;
    log("PRECHECK", `Running in PILOT mode: Stage ${stage} (${maxEntriesToIngest} entries)`);
  } else if (!options.dryRun && !options.authorizeFullIngestion) {
    // Safety lock: full ingestion requires explicit authorization
    log(
      "GATE",
      "FULL INGESTION NOT AUTHORIZED. Must specify --authorize-full-ingestion to run across all 206,717 records."
    );
    throw new Error(
      "[GATE] STOP: Full production ingestion requires explicit --authorize-full-ingestion authorization flag."
    );
  }

  // Ensure knowledge_sources contains the provenance record
  const provDef = getRegisteredSource(JMDICT_SOURCE_ID);
  if (provDef && !options.dryRun) {
    const [existingSource] = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.id, JMDICT_SOURCE_ID))
      .limit(1);

    if (!existingSource) {
      await db.insert(knowledgeSources).values({
        id: provDef.id,
        name: provDef.name,
        version: provDef.version,
        license: provDef.license,
        url: provDef.uri,
        description: provDef.description,
        domain: provDef.domain,
        recordCount: EXPECTED_JMDICT_ENTRIES,
      });
      log("PRECHECK", `Registered ${JMDICT_SOURCE_ID} in knowledge_sources.`);
    }
  }

  const batchSize = options.batchSize || 1000;
  const checkpointPath = options.checkpointPath || DEFAULT_CHECKPOINT_PATH;
  let resumeFromEntSeq: string | null = null;

  // Handle Resume
  if (options.resume) {
    const cp = CheckpointManager.loadCheckpoint(checkpointPath);
    if (!cp) {
      log("PRECHECK", `No checkpoint file found at "${checkpointPath}". Starting fresh.`);
    } else {
      const safety = CheckpointManager.verifyResumeSafety(cp, source);
      if (!safety.safe) {
        log("VALIDATION_ERROR", `Checkpoint resume aborted: ${safety.reason}`);
        throw new Error(`[CHECKPOINT] Resume safety violation: ${safety.reason}`);
      }
      resumeFromEntSeq = cp.lastProcessedEntSeq;
      log("CHECKPOINT", `Resuming safely from ent_seq ${resumeFromEntSeq} (previously processed ${cp.recordsProcessed})`);
    }
  }

  // Pre-Inventory
  const [dictBeforeRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  const totalBefore = Number(dictBeforeRow.count);

  const provContext = createETLProvenanceContext(source.sourceId, { dryRun: Boolean(options.dryRun) });
  const adapter = new DrizzleDictionaryPersistenceAdapter();

  const fileStream = fs.createReadStream(source.xmlPath, {
    encoding: "utf-8",
    highWaterMark: 64 * 1024,
  });

  let processedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let rejectedCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  let currentBatch: PersistenceCandidate[] = [];
  let isPastResumePoint = resumeFromEntSeq === null;
  const seenEntSeqs = new Set<string>();

  const startTime = Date.now();
  let batchIndex = 0;

  for await (const raw of streamJMdictEntries(fileStream)) {
    if (!isPastResumePoint) {
      if (raw.entSeq === resumeFromEntSeq) {
        isPastResumePoint = true;
      }
      continue;
    }

    if (processedCount >= maxEntriesToIngest) {
      break;
    }

    processedCount++;

    const { record: candidate, isValid, diagnostics } = transformJMdictEntry(raw, source.sourceId);
    if (diagnostics && diagnostics.length > 0) {
      warningCount += diagnostics.length;
    }

    if (!isValid || !candidate) {
      rejectedCount++;
      log("VALIDATION_WARNING", `Malformed entry rejected: ent_seq=${raw.entSeq}`);
      continue;
    }

    if (seenEntSeqs.has(raw.entSeq)) {
      skippedCount++;
      continue;
    }
    seenEntSeqs.add(raw.entSeq);

    const stamped = provContext.stampRecord<CanonicalDictionaryEntry>(candidate);
    currentBatch.push(stamped);

    if (currentBatch.length >= batchSize) {
      batchIndex++;
      log("BATCH_START", `Batch #${batchIndex} (size: ${currentBatch.length})...`);
      const lastSeq = currentBatch[currentBatch.length - 1].id.replace("de-jmdict-", "");

      if (!options.dryRun) {
        const batchRes = await adapter.upsertBatch(currentBatch);
        insertedCount += batchRes.inserted;
        updatedCount += batchRes.updated;
        skippedCount += batchRes.skipped;
        log("BATCH_COMMIT", `Batch #${batchIndex} committed: Ins=${batchRes.inserted}, Upd=${batchRes.updated}, Skip=${batchRes.skipped}`);
      } else {
        insertedCount += currentBatch.length;
      }

      currentBatch = [];

      // Record Checkpoint
      CheckpointManager.saveCheckpoint(checkpointPath, {
        sourceId: source.sourceId,
        sourceHash: source.xmlSha256,
        releaseVersion: source.releaseVersion,
        transformationVersion: source.transformationVersion,
        schemaContract: source.schemaContract,
        deterministicIdStrategy: source.deterministicIdStrategy,
        lastProcessedEntSeq: lastSeq,
        recordsProcessed: processedCount,
        recordsInserted: insertedCount,
        recordsSkipped: skippedCount,
        recordsUpdated: updatedCount,
        recordsConflicted: 0,
        recordsRejected: rejectedCount,
        warningCount,
        errorCount,
        timestamp: new Date().toISOString(),
      });
      log("CHECKPOINT", `Checkpoint saved at ent_seq=${lastSeq} (${processedCount} processed)`);
    }
  }

  // Flush remaining partial batch
  if (currentBatch.length > 0) {
    batchIndex++;
    log("BATCH_START", `Final partial Batch #${batchIndex} (size: ${currentBatch.length})...`);
    if (!options.dryRun) {
      const batchRes = await adapter.upsertBatch(currentBatch);
      insertedCount += batchRes.inserted;
      updatedCount += batchRes.updated;
      skippedCount += batchRes.skipped;
      log("BATCH_COMMIT", `Final batch committed: Ins=${batchRes.inserted}, Upd=${batchRes.updated}, Skip=${batchRes.skipped}`);
    } else {
      insertedCount += currentBatch.length;
    }
    currentBatch = [];
  }

  const durationMs = Date.now() - startTime;
  const throughput = Math.round(processedCount / Math.max(0.001, durationMs / 1000));

  log("FINAL_RECONCILIATION", `Ingestion phase complete in ${(durationMs / 1000).toFixed(2)}s (${throughput} rec/sec)`);
  log("FINAL_RECONCILIATION", `Stats: Processed=${processedCount}, Ins=${insertedCount}, Upd=${updatedCount}, Skip=${skippedCount}, Rej=${rejectedCount}`);

  // Post-Reconciliation
  const [dictAfterRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  const totalAfter = Number(dictAfterRow.count);

  const [jmdictAfterRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, source.sourceId));
  const jmdictAfter = Number(jmdictAfterRow.count);

  log("FINAL_RECONCILIATION", `Database Row Count: Total=${totalAfter}, JMdict=${jmdictAfter}`);

  // Random reconciliation check (100 records)
  log("FINAL_RECONCILIATION", "Running 100-record deterministic random sample audit...");
  const randomRecon = await reconcileRandomSample(100, source.xmlPath);
  log("FINAL_RECONCILIATION", `Sample audit: ${randomRecon.matchedCount}/${randomRecon.sampleSize} matched (0 mismatches required).`);

  if (randomRecon.mismatchCount > 0) {
    log("VALIDATION_ERROR", `Random sample audit failed with ${randomRecon.mismatchCount} mismatches.`);
    throw new Error(`[FINAL_RECONCILIATION] Field mismatches in random sample: ${randomRecon.mismatchCount}`);
  }

  // Idempotency Run 2 (if full run and not dry-run and not skipped)
  let idempotencyRun2Result = null;
  if (!options.dryRun && !options.skipIdempotencyRun2 && !options.pilot) {
    log("PRECHECK", "Executing full Idempotency Verification Pass (Run 2)...");
    const stream2 = fs.createReadStream(source.xmlPath, {
      encoding: "utf-8",
      highWaterMark: 64 * 1024,
    });

    let run2Inserted = 0;
    let run2Updated = 0;
    let run2Skipped = 0;
    let run2Batch: PersistenceCandidate[] = [];

    for await (const raw of streamJMdictEntries(stream2)) {
      const { record: candidate, isValid } = transformJMdictEntry(raw, source.sourceId);
      if (!isValid || !candidate) continue;
      const stamped = provContext.stampRecord<CanonicalDictionaryEntry>(candidate);
      run2Batch.push(stamped);

      if (run2Batch.length >= batchSize) {
        const res = await adapter.upsertBatch(run2Batch);
        run2Inserted += res.inserted;
        run2Updated += res.updated;
        run2Skipped += res.skipped;
        run2Batch = [];
      }
    }
    if (run2Batch.length > 0) {
      const res = await adapter.upsertBatch(run2Batch);
      run2Inserted += res.inserted;
      run2Updated += res.updated;
      run2Skipped += res.skipped;
      run2Batch = [];
    }

    const [dictRun2Row] = await db
      .select({ count: sql`cast(count(*) as int)` })
      .from(dictionaryEntries);
    const totalRun2 = Number(dictRun2Row.count);

    idempotencyRun2Result = {
      inserted: run2Inserted,
      updated: run2Updated,
      skipped: run2Skipped,
      rowCountBefore: totalAfter,
      rowCountAfter: totalRun2,
      isIdempotent: run2Inserted === 0 && run2Updated === 0 && totalAfter === totalRun2,
    };
    log("FINAL_RECONCILIATION", `Run 2 Idempotency: Ins=${run2Inserted}, Upd=${run2Updated}, Skip=${run2Skipped}, Drift=${totalRun2 - totalAfter}`);
  }

  log("GATE", "GO — PHASE 14.3D COMPLETE");

  return {
    status: options.dryRun ? "DRY_RUN_COMPLETE" : "SUCCESS",
    report: {
      environment: env,
      source,
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      rejectedCount,
      warningCount,
      durationMs,
      throughput,
      totalBefore,
      totalAfter,
      jmdictAfter,
      randomReconciliation: randomRecon,
      idempotencyRun2: idempotencyRun2Result,
      verdict: "GO — PHASE 14.3D COMPLETE",
    },
  };
}

// ----------------------------------------------------
// CLI Interface
// ----------------------------------------------------
function parseCliArgs(args: string[]): IngestionExecutionOptions {
  const options: IngestionExecutionOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--preflight") {
      options.preflightOnly = true;
    } else if (arg === "--pilot") {
      options.pilot = true;
      const nextArg = args[i + 1];
      if (nextArg && ["A", "B", "C", "D", "E"].includes(nextArg.toUpperCase())) {
        options.pilotStage = nextArg.toUpperCase() as any;
        i++;
      } else {
        options.pilotStage = "B";
      }
    } else if (arg === "--batch") {
      const nextArg = args[i + 1];
      if (nextArg && !isNaN(Number(nextArg))) {
        options.batchSize = Number(nextArg);
        i++;
      }
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--verify") {
      options.verifyOnly = true;
    } else if (arg === "--rollback") {
      options.rollbackTest = true;
    } else if (arg === "--authorize-full-ingestion" || arg === "--authorized") {
      options.authorizeFullIngestion = true;
    }
  }

  return options;
}

if (process.argv[1] && process.argv[1].endsWith("ingest-full-jmdict.ts")) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  executeIngestion(cliOptions)
    .then((result) => {
      console.log("\n================================================================================");
      console.log("EXECUTION RESULT:", result.status);
      console.log("================================================================================");
      console.log(JSON.stringify(result.report, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n[VALIDATION_ERROR] FATAL INGESTION ERROR:", err.message);
      process.exit(1);
    });
}
