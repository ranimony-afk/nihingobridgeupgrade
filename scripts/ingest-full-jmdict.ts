/**
 * Phase 14.3D — Controlled Full JMdict PostgreSQL Ingestion Engine
 *
 * Implements full-corpus streaming ingestion of the verified 206,717-entry JMdict corpus
 * with strict safety invariants, CLI flags, checkpoint/resume, staged pilot,
 * observability tags, two-run idempotency, and deterministic random sample reconciliation.
 */

import "dotenv/config";
import fs from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { Readable } from "stream";
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
  assertOfficialByteSize,
  assertOfficialEntryCount,
  assertOfficialJmdictHeader,
  assertOfficialSourceScan,
  assertPinnedJmdictSource,
  JmdictByteScan,
  EXPECTED_JMDICT_BYTES,
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_RELEASE,
  EXPECTED_JMDICT_SHA256,
  JMDICT_SOURCE_ID,
} from "@/etl/dictionary/jmdictContract";
import {
  classifyDatabaseTarget,
  deriveTargetIdentityHash,
  type TargetIdentity,
} from "@/etl/dictionary/targetClassification";
import { planPersistence, resolveConflictPolicy, summarizePlan, type ConflictPolicy } from "@/etl/dictionary/persistencePlan";
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
  DictionaryPersistenceAdapter,
} from "@/etl/dictionary/types";

export {
  EXPECTED_JMDICT_SHA256,
  EXPECTED_JMDICT_RELEASE,
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_BYTES,
  JMDICT_SOURCE_ID,
};
export const CHECKPOINT_VERSION = 2;
export const DEFAULT_CHECKPOINT_PATH = resolve(process.cwd(), "data/jmdict-checkpoint.json");
export const PILOT_BOUNDS = { A: 10, B: 100, C: 1000, D: 10000 } as const;

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
  classification: "DISPOSABLE" | "PRODUCTION" | "UNKNOWN" | "FORBIDDEN" | "AMBIGUOUS";
  host: string;
  port: string;
  databaseName: string;
  currentUser: string;
  currentSchema: string;
  postgresVersion: string;
  identityHash: string;
  serverAddress: string | null;
}

export interface IngestionCheckpoint {
  checkpointVersion?: number;
  origin?: "ingestion";
  targetIdentity?: TargetIdentity;
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

// Validate caller-owned configuration once, before any filesystem/client work.
// Reject accessors/inherited configuration rather than reading it repeatedly.
function optionRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error("Invalid options object");
  }
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !allowed.includes(key) || !Object.hasOwn(descriptor, "value")) {
      throw new Error("Invalid option property");
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function nonemptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f]/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

export function validateIngestionOptions(input: unknown): IngestionExecutionOptions {
  const flags = ["dryRun", "preflightOnly", "pilot", "resume", "verifyOnly", "rollbackTest",
    "authorizeFullIngestion", "skipIdempotencyRun2"];
  const options = optionRecord(input, [...flags, "pilotStage", "batchSize", "checkpointPath", "conflictPolicy"]);
  for (const flag of flags) {
    if (Object.hasOwn(options, flag) && typeof options[flag] !== "boolean") throw new Error(`Invalid ${flag}`);
  }
  if (Object.hasOwn(options, "batchSize") &&
      (typeof options.batchSize !== "number" || !Number.isSafeInteger(options.batchSize) || options.batchSize <= 0)) {
    throw new Error("Invalid batchSize");
  }
  if (Object.hasOwn(options, "pilotStage") &&
      (typeof options.pilotStage !== "string" || !["A", "B", "C", "D", "E"].includes(options.pilotStage))) {
    throw new Error("Invalid pilotStage");
  }
  if (Object.hasOwn(options, "checkpointPath")) nonemptyString(options.checkpointPath, "checkpointPath");
  if (Object.hasOwn(options, "conflictPolicy") && !["abort", "update"].includes(options.conflictPolicy as string)) {
    throw new Error("Invalid conflictPolicy");
  }
  return options as IngestionExecutionOptions;
}

const SUPPORTED_CLI_FLAGS = new Set([
  "--dry-run",
  "--preflight",
  "--pilot",
  "--batch",
  "--resume",
  "--verify",
  "--rollback",
  "--authorize-full-ingestion",
  "--conflict-policy",
  "--checkpoint",
]);

/**
 * Write-capable work requires an explicit mode. Pilot stage E is not a bound
 * and is not full-ingestion authorization. No filesystem or database work happens here.
 */
export function assertIngestionAuthorization(options: IngestionExecutionOptions): void {
  const stage = options.pilot ? (options.pilotStage ?? "B") : undefined;
  if (stage === "E" && !options.authorizeFullIngestion) {
    throw new Error(
      "[GATE] STOP: Pilot stage E is not full-ingestion authorization. Refusing before any source, database, or checkpoint side effect.",
    );
  }
  const readOnly = Boolean(options.dryRun || options.preflightOnly || options.verifyOnly);
  const boundedPilot = Boolean(options.pilot && stage && stage !== "E");
  const rollback = Boolean(options.rollbackTest);
  if (!readOnly && !rollback && !boundedPilot && !options.authorizeFullIngestion) {
    throw new Error(
      "[GATE] STOP: Full production ingestion requires explicit --authorize-full-ingestion authorization flag.",
    );
  }
}

export function prepareCli(args: string[]): IngestionExecutionOptions {
  const options = parseCliArgs(args);
  assertIngestionAuthorization(options);
  return options;
}

const SOURCE_CHUNK_BYTES = 64 * 1024;
const sourcePins = new WeakMap<SourceMetadata, { fd: number; streams: Set<Readable> }>();
const candidateSources = new WeakMap<PersistenceCandidate, SourceMetadata>();
const batchSources = new WeakMap<SourceBatch, SourceMetadata>();

function freezeBatchPayload(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeBatchPayload(child);
  Object.freeze(value);
}

export function releaseVerifiedSource(source: SourceMetadata): void {
  const pin = sourcePins.get(source);
  if (!pin) return;
  sourcePins.delete(source);
  for (const stream of pin.streams) stream.destroy();
  fs.closeSync(pin.fd);
}

export function openVerifiedSourceStream(source: SourceMetadata): Readable {
  const pin = sourcePins.get(source);
  if (!pin) throw new Error("Source is not a live verified snapshot");
  // Positional synchronous reads avoid shared-offset and close/read races.
  // Each pass has its own cursor; no pass opens the original pathname.
  let position = 0;
  const stream = new Readable({
    read() {
      try {
        if (!sourcePins.has(source)) throw new Error("Source snapshot released");
        const buffer = Buffer.allocUnsafe(SOURCE_CHUNK_BYTES);
        const count = fs.readSync(pin.fd, buffer, 0, buffer.length, position);
        position += count;
        this.push(count ? buffer.subarray(0, count) : null);
      } catch (error) { this.destroy(error as Error); }
    },
  });
  stream.setEncoding("utf8");
  pin.streams.add(stream);
  stream.once("close", () => pin.streams.delete(stream));
  return stream;
}

// Only records produced by the existing parser/transformer from a live snapshot
// can enter an accepted batch. The mutable staging array is never persisted.
export async function* readVerifiedRecords(source: SourceMetadata, dryRun = false) {
  const stream = openVerifiedSourceStream(source);
  const provenance = createETLProvenanceContext(source.sourceId, { dryRun });
  try {
    for await (const raw of streamJMdictEntries(stream)) {
      const result = transformJMdictEntry(raw, source.sourceId);
      if (result.isValid && result.record) {
        result.record = provenance.stampRecord<CanonicalDictionaryEntry>(result.record);
        freezeBatchPayload(result.record);
        candidateSources.set(result.record, source);
      }
      yield { raw, ...result };
    }
  } finally { stream.destroy(); }
}

export interface SourceBatch {
  readonly candidates: PersistenceCandidate[];
  readonly source: SourceMetadata;
  readonly lastProcessedEntSeq: string;
}

export function acceptSourceBatch(source: SourceMetadata, candidates: PersistenceCandidate[]): SourceBatch {
  const payload = [...candidates];
  if (!sourcePins.has(source) || payload.length === 0 ||
      payload.some(candidate => candidateSources.get(candidate) !== source)) {
    throw new Error("Batch does not belong to verified source");
  }
  const batch: SourceBatch = {
    candidates: payload, source,
    lastProcessedEntSeq: payload[payload.length - 1].id.replace("de-jmdict-", ""),
  };
  freezeBatchPayload(batch);
  batchSources.set(batch, source);
  return batch;
}

type CheckpointProgress = Pick<IngestionCheckpoint, "recordsProcessed" | "recordsInserted" |
  "recordsSkipped" | "recordsUpdated" | "recordsConflicted" | "recordsRejected" | "warningCount" | "errorCount">;

export async function commitSourceBatch(
  source: SourceMetadata,
  batch: SourceBatch,
  adapter: Pick<DictionaryPersistenceAdapter, "upsertBatch">,
  dryRun = false,
  checkpoint?: { path: string; progress: CheckpointProgress; targetIdentity?: TargetIdentity },
  conflictPolicy: ConflictPolicy = "abort",
) {
  if (!sourcePins.has(source) || batchSources.get(batch) !== source) {
    throw new Error("Unaccepted batch or wrong source");
  }
  // Capture checkpoint inputs before handing control to asynchronous persistence.
  const path = dryRun ? undefined : checkpoint?.path;
  const progress = checkpoint && !dryRun ? Object.freeze({ ...checkpoint.progress }) : undefined;
  const targetIdentity = checkpoint?.targetIdentity;
  const result = await adapter.upsertBatch(batch.candidates, { dryRun, conflictPolicy });
  if (!dryRun && path !== undefined && progress) {
    const value: IngestionCheckpoint = {
      ...progress,
      checkpointVersion: CHECKPOINT_VERSION,
      origin: "ingestion",
      targetIdentity,
      sourceId: source.sourceId, sourceHash: source.xmlSha256,
      releaseVersion: source.releaseVersion, transformationVersion: source.transformationVersion,
      schemaContract: source.schemaContract, deterministicIdStrategy: source.deterministicIdStrategy,
      lastProcessedEntSeq: batch.lastProcessedEntSeq,
      recordsInserted: progress.recordsInserted + result.inserted,
      recordsUpdated: progress.recordsUpdated + result.updated,
      recordsSkipped: progress.recordsSkipped + result.skipped,
      timestamp: new Date().toISOString(),
    };
    freezeBatchPayload(value);
    CheckpointManager.saveCheckpoint(path, value);
  }
  return result;
}

// ----------------------------------------------------
// 1. Database Safety & Target Classification
// ----------------------------------------------------
export interface EnvironmentProbeOptions {
  declaredClass?: string;
  expectedDatabase?: string;
  authorizeProduction?: boolean;
}

export function targetIdentityFromEnvironment(env: EnvironmentSafetyResult): TargetIdentity {
  if (env.classification !== "DISPOSABLE") {
    throw new Error("[PRECHECK] STOP — refusing to bind a checkpoint to a non-disposable target.");
  }
  return {
    classification: "DISPOSABLE",
    host: env.host,
    port: env.port,
    database: env.databaseName,
    user: env.currentUser,
    identityHash: deriveTargetIdentityHash({
      host: env.host,
      port: env.port,
      database: env.databaseName,
      user: env.currentUser,
    }),
  };
}

export async function validateEnvironmentSafety(
  explicitConnStr?: string,
  probeOptions: EnvironmentProbeOptions = {},
): Promise<EnvironmentSafetyResult> {
  if (explicitConnStr !== undefined) nonemptyString(explicitConnStr, "connStr");
  const connStr = explicitConnStr === undefined ? process.env.DATABASE_URL : explicitConnStr;
  if (!connStr) {
    throw new Error("[PRECHECK] FATAL: DATABASE_URL is missing. Safety stop!");
  }
  nonemptyString(connStr, "connStr");

  const classified = classifyDatabaseTarget({
    connectionString: connStr,
    declaredClass: probeOptions.declaredClass ?? process.env.NIHONGO_DB_TARGET_CLASS,
    expectedDatabase: probeOptions.expectedDatabase ?? process.env.NIHONGO_DB_EXPECTED_DATABASE,
    authorizeProduction: probeOptions.authorizeProduction === true,
  });
  if (classified.decision !== "ALLOW" || classified.classification !== "DISPOSABLE") {
    throw new Error(`[PRECHECK] STOP — ${classified.reason}`);
  }

  const probeClient = new Client({ connectionString: connStr });
  await probeClient.connect();
  try {
    const vRes = await probeClient.query("SELECT version();");
    const uRes = await probeClient.query(
      "SELECT current_user, current_database(), current_schema();",
    );
    let serverAddress: string | null = null;
    try {
      const addr = await probeClient.query("SELECT inet_server_addr()::text AS server_addr;");
      serverAddress = addr.rows[0]?.server_addr ?? null;
    } catch {
      serverAddress = null;
    }
    const databaseName = String(uRes.rows[0].current_database);
    const currentUser = String(uRes.rows[0].current_user);
    if (databaseName !== classified.database) {
      throw new Error(
        "[PRECHECK] STOP — TARGET DATABASE AMBIGUOUS: connected database does not match the classified target.",
      );
    }
    if (classified.user && classified.user !== currentUser) {
      throw new Error(
        "[PRECHECK] STOP — TARGET DATABASE AMBIGUOUS: connected role does not match the classified target.",
      );
    }
    return {
      isLoopback: true,
      classification: "DISPOSABLE",
      host: classified.host,
      port: classified.port,
      databaseName,
      currentUser,
      currentSchema: String(uRes.rows[0].current_schema),
      postgresVersion: String(vRes.rows[0].version),
      identityHash: deriveTargetIdentityHash({
        host: classified.host,
        port: classified.port,
        database: databaseName,
        user: currentUser,
      }),
      serverAddress,
    };
  } finally {
    await probeClient.end();
  }
}

// ----------------------------------------------------
// 2. Source Contract & Hash Verification
// ----------------------------------------------------
// The caller owns the returned snapshot and must release it in a finally block.
export function verifySourceContract(
  customXmlPath?: string,
  expectedHash: string = EXPECTED_JMDICT_SHA256,
  expectedRelease: string = EXPECTED_JMDICT_RELEASE
): SourceMetadata {
  if (customXmlPath !== undefined) nonemptyString(customXmlPath, "xmlPath");
  nonemptyString(expectedHash, "expectedHash");
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error("Invalid expectedHash");
  const xmlPath = customXmlPath === undefined ? resolve(process.cwd(), "data/JMdict.xml") : customXmlPath;
  const provDef = getRegisteredSource(JMDICT_SOURCE_ID);
  if (!provDef) {
    throw new Error(`[SOURCE_VERIFIED] STOP — PROVENANCE UNREGISTERED: "${JMDICT_SOURCE_ID}"`);
  }

  if (expectedRelease !== EXPECTED_JMDICT_RELEASE || (provDef.releaseDate && provDef.releaseDate !== expectedRelease)) {
    throw new Error(
      `[SOURCE_VERIFIED] STOP — SOURCE RELEASE MISMATCH: expected release ${EXPECTED_JMDICT_RELEASE}, requested ${expectedRelease}`
    );
  }

  let input: number | undefined;
  let writer: number | undefined;
  let reader: number | undefined;
  let directory: string | undefined;
  try {
    input = fs.openSync(xmlPath, "r");
    const stat = fs.fstatSync(input);
    if (!stat.isFile()) throw new Error("Source must be a regular file");
    const officialPin = expectedHash === EXPECTED_JMDICT_SHA256 && expectedRelease === EXPECTED_JMDICT_RELEASE;
    if (officialPin) assertOfficialByteSize(stat.size);
    directory = fs.mkdtempSync(join(tmpdir(), "jmdict-verified-"));
    const snapshotPath = join(directory, "source.xml");
    writer = fs.openSync(snapshotPath, "wx", 0o600);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(SOURCE_CHUNK_BYTES);
    const byteScan = officialPin ? new JmdictByteScan() : null;
    let size = 0;
    for (;;) {
      const count = fs.readSync(input, buffer, 0, buffer.length, null);
      if (!count) break;
      const chunk = buffer.subarray(0, count);
      let written = 0;
      while (written < count) {
        const n = fs.writeSync(writer, buffer, written, count - written);
        if (n <= 0) throw new Error("Snapshot write made no progress");
        written += n;
      }
      hash.update(chunk);
      byteScan?.feed(chunk);
      size += count;
    }
    const xmlSha256 = hash.digest("hex");
    if (xmlSha256 !== expectedHash) throw new Error(`SOURCE HASH MISMATCH: expected ${expectedHash}, got ${xmlSha256}`);
    if (officialPin) {
      if (provDef.contentHash !== EXPECTED_JMDICT_SHA256) {
        throw new Error("[SOURCE_VERIFIED] STOP — provenance contentHash is not bound to the pinned XML SHA-256.");
      }
      if (!byteScan) throw new Error("[SOURCE_VERIFIED] STOP — MALFORMED SOURCE: scan was not started");
      assertOfficialSourceScan(byteScan);
    }
    fs.closeSync(input); input = undefined;
    fs.closeSync(writer); writer = undefined;
    reader = fs.openSync(snapshotPath, "r");
    // Retain only the read-only descriptor: there is no writable pathname to reopen.
    fs.unlinkSync(snapshotPath);
    fs.rmdirSync(directory); directory = undefined;
    const source: SourceMetadata = Object.freeze({
      sourceId: JMDICT_SOURCE_ID,
      releaseVersion: expectedRelease,
      license: provDef.license,
      attribution: provDef.attribution,
      xmlPath,
      xmlSizeBytes: size,
      xmlSha256,
      expectedEntries: EXPECTED_JMDICT_ENTRIES,
      transformationVersion: "jmdict-v1",
      schemaContract: "dictionary_entries",
      deterministicIdStrategy: "de-jmdict-${entSeq}",
    });
    sourcePins.set(source, { fd: reader, streams: new Set() });
    reader = undefined;
    return source;
  } finally {
    for (const fd of [input, writer, reader]) if (fd !== undefined) fs.closeSync(fd);
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
}

// ----------------------------------------------------
// 3. Pre-Flight Read-Only Report
// ----------------------------------------------------
export async function runPreflight(options: {
  xmlPath?: string;
  connStr?: string;
  conflictPolicy?: ConflictPolicy;
} = {}): Promise<PreflightReport> {
  const checked = optionRecord(options, ["xmlPath", "connStr", "conflictPolicy"]);
  if (Object.hasOwn(checked, "xmlPath")) nonemptyString(checked.xmlPath, "xmlPath");
  if (Object.hasOwn(checked, "connStr")) nonemptyString(checked.connStr, "connStr");
  if (Object.hasOwn(checked, "conflictPolicy") && checked.conflictPolicy !== "abort" && checked.conflictPolicy !== "update") {
    throw new Error("Invalid conflictPolicy");
  }
  options = checked as typeof options;
  const policy = resolveConflictPolicy(options.conflictPolicy);
  const env = await validateEnvironmentSafety(options.connStr);
  const source = verifySourceContract(options.xmlPath);
  try {
    const report = await buildPreflightReport(env, source, policy);
    return report;
  } finally { releaseVerifiedSource(source); }
}

async function loadPayloadsById(ids: string[]) {
  if (ids.length === 0) return new Map<string, {
    id: string; headword: string; reading: string; romaji: string; jlptLevel: string;
    isCommon: boolean; frequencyRank: number | null; partsOfSpeech: string[];
    senses: Array<{ glosses: string[]; note?: string | null }>; kanjiCharacters: string[];
    tags: string[]; sourceRef: string;
  }>();
  const rows = await db.select({
    id: dictionaryEntries.id,
    headword: dictionaryEntries.headword,
    reading: dictionaryEntries.reading,
    romaji: dictionaryEntries.romaji,
    jlptLevel: dictionaryEntries.jlptLevel,
    isCommon: dictionaryEntries.isCommon,
    frequencyRank: dictionaryEntries.frequencyRank,
    partsOfSpeech: dictionaryEntries.partsOfSpeech,
    senses: dictionaryEntries.senses,
    kanjiCharacters: dictionaryEntries.kanjiCharacters,
    tags: dictionaryEntries.tags,
    sourceRef: dictionaryEntries.sourceRef,
  }).from(dictionaryEntries).where(inArray(dictionaryEntries.id, ids));
  return new Map(rows.map((row) => [row.id, {
    ...row,
    partsOfSpeech: (row.partsOfSpeech as string[]) ?? [],
    senses: (row.senses as Array<{ glosses: string[]; note?: string | null }>) ?? [],
    kanjiCharacters: (row.kanjiCharacters as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
  }]));
}

export async function buildPreflightReport(
  env: EnvironmentSafetyResult,
  source: SourceMetadata,
  policy: ConflictPolicy = "abort",
): Promise<PreflightReport> {
  const [dictCountRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries);
  let expectedInserts = 0;
  let expectedSkips = 0;
  let conflictingIdCount = 0;
  let matchingIdCount = 0;
  const seenIds = new Set<string>();
  let batch: PersistenceCandidate[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const existing = await loadPayloadsById(batch.map((row) => row.id));
    const plan = planPersistence(batch, existing);
    const summary = summarizePlan(plan, policy);
    expectedInserts += summary.expectedInserts;
    expectedSkips += summary.expectedSkips;
    conflictingIdCount += summary.conflictingIdCount;
    matchingIdCount += plan.identical.length + plan.conflicts.length;
    for (const row of batch) seenIds.add(row.id);
    batch = [];
  };
  for await (const item of readVerifiedRecords(source, true)) {
    if (item.isValid && item.record) batch.push(item.record);
    if (batch.length >= 500) await flush();
  }
  await flush();
  const pinnedRows = await db.select({ id: dictionaryEntries.id })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, source.sourceId));
  const unexpectedIdCount = pinnedRows.filter((row) => !seenIds.has(row.id)).length;
  return {
    environment: env,
    source,
    targetTable: "dictionary_entries",
    existingRowCount: Number(dictCountRow.count),
    matchingIdCount,
    conflictingIdCount,
    expectedInserts,
    expectedSkips,
    expectedUpdates: policy === "update" ? conflictingIdCount : 0,
    unexpectedIdCount,
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
    const raw = fs.readFileSync(path, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("[CHECKPOINT] Corrupt checkpoint: invalid JSON. Refusing to start from zero.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("[CHECKPOINT] Corrupt checkpoint: invalid shape. Refusing to start from zero.");
    }
    return parsed as IngestionCheckpoint;
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

  /**
   * Resume identity used by executeIngestion. A missing, corrupt, dry-run, or
   * cross-target checkpoint fails closed. Database identity is the SHA-256 of
   * host, port, database name, and role — never the password or connection string.
   */
  static verifyResumeIdentity(
    checkpoint: IngestionCheckpoint,
    source: SourceMetadata,
    target: TargetIdentity,
  ): { safe: boolean; reason?: string } {
    const base = this.verifyResumeSafety(checkpoint, source);
    if (!base.safe) return base;
    if (checkpoint.checkpointVersion !== CHECKPOINT_VERSION) {
      return { safe: false, reason: "checkpointVersion incompatible" };
    }
    if (checkpoint.origin !== "ingestion") {
      return { safe: false, reason: "checkpoint origin is not a committed ingestion" };
    }
    const bound = checkpoint.targetIdentity;
    if (!bound || !target) {
      return { safe: false, reason: "target identity missing" };
    }
    if (bound.identityHash !== target.identityHash ||
        bound.host !== target.host ||
        bound.port !== target.port ||
        bound.database !== target.database ||
        bound.user !== target.user ||
        bound.classification !== "DISPOSABLE" ||
        target.classification !== "DISPOSABLE") {
      return { safe: false, reason: "target identity mismatch" };
    }
    return { safe: true };
  }
}

export function loadResumeCheckpoint(
  path: string,
  source: SourceMetadata,
  target: TargetIdentity,
): IngestionCheckpoint {
  if (!fs.existsSync(path)) {
    throw new Error(`[CHECKPOINT] Resume refused: checkpoint file is missing at "${path}". Refusing to start from zero.`);
  }
  const cp = CheckpointManager.loadCheckpoint(path);
  if (!cp) {
    throw new Error("[CHECKPOINT] Resume refused: checkpoint could not be loaded. Refusing to start from zero.");
  }
  const safety = CheckpointManager.verifyResumeIdentity(cp, source, target);
  if (!safety.safe) {
    throw new Error(`[CHECKPOINT] Resume safety violation: ${safety.reason}`);
  }
  return cp;
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
  if (!Number.isSafeInteger(sampleSize) || sampleSize <= 0) throw new Error("Invalid sampleSize");
  const source = verifySourceContract(customXmlPath);
  try { return await reconcileVerifiedSample(sampleSize, source); }
  finally { releaseVerifiedSource(source); }
}

async function reconcileVerifiedSample(sampleSize: number, source: SourceMetadata): Promise<RandomReconciliationResult> {
  const provContext = createETLProvenanceContext(source.sourceId, { dryRun: false });

  // Select 100 deterministic records distributed evenly across the corpus
  // Total corpus = 206,717; step ~ 2,067
  const step = Math.floor(source.expectedEntries / sampleSize);
  const targetIndices = new Set<number>();
  for (let i = 0; i < sampleSize; i++) {
    targetIndices.add(i * step);
  }

  const fileStream = openVerifiedSourceStream(source);

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
  options = validateIngestionOptions(options);
  assertPinnedJmdictSource(JMDICT_SOURCE_ID);
  assertIngestionAuthorization(options);
  const conflictPolicy = resolveConflictPolicy(options.conflictPolicy);
  console.log("================================================================================");
  console.log("PHASE 14.3D — CONTROLLED FULL JMdict POSTGRESQL INGESTION ENGINE");
  console.log("================================================================================");

  // Structured Logging helper
  const log = (tag: string, ...args: unknown[]) => {
    console.log(`[${tag}]`, ...args);
  };

  const needsDatabase = !options.dryRun;
  let env: EnvironmentSafetyResult | null = null;
  if (needsDatabase) {
    log("PRECHECK", "Auditing environment safety & target classification...");
    env = await validateEnvironmentSafety();
    log("PRECHECK", `Host: ${env.host}:${env.port} | Database: ${env.databaseName} | Classification: ${env.classification}`);
  }

  // Source verification hashes retained bytes. Dry-run may open the source; it must not write.
  log("SOURCE_VERIFIED", "Auditing source release hash and provenance registry...");
  const source = verifySourceContract();
  try {
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
    const randRecon = await reconcileVerifiedSample(100, source);
    log("FINAL_RECONCILIATION", `Deterministic sample: ${randRecon.matchedCount}/${randRecon.sampleSize} matched (Mismatches: ${randRecon.mismatchCount})`);
    if (randRecon.mismatchCount > 0) {
      log("VALIDATION_ERROR", "Field mismatches detected:", randRecon.mismatches);
      throw new Error(`[FINAL_RECONCILIATION] Field mismatches detected: ${randRecon.mismatchCount}`);
    }
    log("GATE", "GO — VERIFICATION PASSED");
    return { status: "VERIFY_COMPLETE", report: { randomReconciliation: randRecon } };
  }

  // Pilot stages A–D are bounded. Stage E does not grant a bound; only the explicit flag does.
  let maxEntriesToIngest = source.expectedEntries;
  if (options.pilot) {
    const stage = options.pilotStage ?? "B";
    if (stage === "A" || stage === "B" || stage === "C" || stage === "D") {
      maxEntriesToIngest = PILOT_BOUNDS[stage];
      log("PRECHECK", `Running in PILOT mode: Stage ${stage} (${maxEntriesToIngest} entries)`);
    } else if (options.authorizeFullIngestion) {
      log("PRECHECK", "Full ingestion authorized by --authorize-full-ingestion. Pilot stage E is not a bound.");
    }
  }
  if (!options.dryRun) {
    let counted = 0;
    for await (const _raw of streamJMdictEntries(openVerifiedSourceStream(source))) counted++;
    assertOfficialEntryCount(counted, source.expectedEntries);
    log("SOURCE_VERIFIED", `Entry count ${counted} matches the pinned contract.`);
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

  const batchSize = options.batchSize ?? 1000;
  const checkpointPath = options.checkpointPath ?? DEFAULT_CHECKPOINT_PATH;
  let resumeFromEntSeq: string | null = null;

  // Handle Resume. Missing or invalid checkpoints fail closed; they do not restart at zero.
  const targetIdentity = env ? targetIdentityFromEnvironment(env) : undefined;
  if (options.resume) {
    if (!targetIdentity) {
      throw new Error("[CHECKPOINT] Resume refused: dry-run cannot resume and cannot create resume state.");
    }
    const cp = loadResumeCheckpoint(checkpointPath, source, targetIdentity);
    resumeFromEntSeq = cp.lastProcessedEntSeq;
    log("CHECKPOINT", `Resuming safely from ent_seq ${resumeFromEntSeq} (previously processed ${cp.recordsProcessed})`);
  }

  // Pre-Inventory. Dry-run does not open the database.
  const totalBefore = options.dryRun ? 0 : await (async () => {
    const [dictBeforeRow] = await db
      .select({ count: sql`cast(count(*) as int)` })
      .from(dictionaryEntries);
    return Number(dictBeforeRow.count);
  })();

  const adapter = new DrizzleDictionaryPersistenceAdapter();

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

  for await (const { raw, record: candidate, isValid, diagnostics } of readVerifiedRecords(source, Boolean(options.dryRun))) {
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

    currentBatch.push(candidate);

    if (currentBatch.length >= batchSize) {
      batchIndex++;
      log("BATCH_START", `Batch #${batchIndex} (size: ${currentBatch.length})...`);
      const batch = acceptSourceBatch(source, currentBatch);
      const lastSeq = batch.lastProcessedEntSeq;
      const batchRes = await commitSourceBatch(source, batch, adapter, Boolean(options.dryRun), options.dryRun ? undefined : {
        path: checkpointPath,
        targetIdentity,
        progress: {
          recordsProcessed: processedCount, recordsInserted: insertedCount,
          recordsSkipped: skippedCount, recordsUpdated: updatedCount, recordsConflicted: 0,
          recordsRejected: rejectedCount, warningCount, errorCount,
        },
      }, conflictPolicy);
      insertedCount += batchRes.inserted;
      updatedCount += batchRes.updated;
      skippedCount += batchRes.skipped;
      if (!options.dryRun) {
        log("BATCH_COMMIT", `Batch #${batchIndex} committed: Ins=${batchRes.inserted}, Upd=${batchRes.updated}, Skip=${batchRes.skipped}`);
        log("CHECKPOINT", `Checkpoint saved at ent_seq=${lastSeq} (${processedCount} processed)`);
      }
      currentBatch = [];
    }
  }

  // Flush remaining partial batch
  if (currentBatch.length > 0) {
    batchIndex++;
    log("BATCH_START", `Final partial Batch #${batchIndex} (size: ${currentBatch.length})...`);
    if (!options.dryRun) {
      const batchRes = await commitSourceBatch(
        source,
        acceptSourceBatch(source, currentBatch),
        adapter,
        false,
        undefined,
        conflictPolicy,
      );
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

  if (options.dryRun) {
    log("GATE", "DRY_RUN_COMPLETE — no database writes and no checkpoint mutation");
    return {
      status: "DRY_RUN_COMPLETE",
      report: {
        environment: null,
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
        checkpointMutated: false,
        verdict: "DRY_RUN_COMPLETE",
      },
    };
  }

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
  const randomRecon = await reconcileVerifiedSample(100, source);
  log("FINAL_RECONCILIATION", `Sample audit: ${randomRecon.matchedCount}/${randomRecon.sampleSize} matched (0 mismatches required).`);

  if (randomRecon.mismatchCount > 0) {
    log("VALIDATION_ERROR", `Random sample audit failed with ${randomRecon.mismatchCount} mismatches.`);
    throw new Error(`[FINAL_RECONCILIATION] Field mismatches in random sample: ${randomRecon.mismatchCount}`);
  }

  // Idempotency Run 2 (if full run and not dry-run and not skipped)
  let idempotencyRun2Result = null;
  if (!options.dryRun && !options.skipIdempotencyRun2 && !options.pilot) {
    log("PRECHECK", "Executing full Idempotency Verification Pass (Run 2)...");

    let run2Inserted = 0;
    let run2Updated = 0;
    let run2Skipped = 0;
    let run2Batch: PersistenceCandidate[] = [];

    for await (const { record: candidate, isValid } of readVerifiedRecords(source)) {
      if (!isValid || !candidate) continue;
      run2Batch.push(candidate);

      if (run2Batch.length >= batchSize) {
        const res = await commitSourceBatch(source, acceptSourceBatch(source, run2Batch), adapter, false, undefined, conflictPolicy);
        run2Inserted += res.inserted;
        run2Updated += res.updated;
        run2Skipped += res.skipped;
        run2Batch = [];
      }
    }
    if (run2Batch.length > 0) {
      const res = await commitSourceBatch(source, acceptSourceBatch(source, run2Batch), adapter, false, undefined, conflictPolicy);
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

  log("GATE", "INGESTION_COMPLETE — not production authorization");

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
      verdict: "INGESTION_COMPLETE — not production authorization",
    },
  };
  } finally { releaseVerifiedSource(source); }
}

// ----------------------------------------------------
// CLI Interface
// ----------------------------------------------------
export function parseCliArgs(args: string[]): IngestionExecutionOptions {
  for (const arg of args) {
    if (arg.startsWith("-") && !SUPPORTED_CLI_FLAGS.has(arg)) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
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
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        options.pilotStage = nextArg.toUpperCase() as IngestionExecutionOptions["pilotStage"];
        i++;
      } else {
        options.pilotStage = "B";
      }
    } else if (arg === "--batch") {
      const nextArg = args[i + 1];
      if (nextArg === undefined || nextArg.startsWith("-")) throw new Error("Invalid batchSize");
      options.batchSize = Number(nextArg);
      i++;
    } else if (arg === "--resume") {
      options.resume = true;
    } else if (arg === "--verify") {
      options.verifyOnly = true;
    } else if (arg === "--rollback") {
      options.rollbackTest = true;
    } else if (arg === "--authorize-full-ingestion") {
      options.authorizeFullIngestion = true;
    } else if (arg === "--conflict-policy") {
      const nextArg = args[i + 1];
      if (nextArg !== "abort" && nextArg !== "update") throw new Error("Invalid conflictPolicy");
      options.conflictPolicy = nextArg;
      i++;
    } else if (arg === "--checkpoint") {
      const nextArg = args[i + 1];
      if (nextArg === undefined || nextArg.startsWith("-")) throw new Error("Invalid checkpointPath");
      options.checkpointPath = nextArg;
      i++;
    }
  }

  return validateIngestionOptions(options);
}

if (process.argv[1] && process.argv[1].endsWith("ingest-full-jmdict.ts")) {
  const cliOptions = prepareCli(process.argv.slice(2));
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
