/**
 * JMdict database integration setup — the explicit database-state contract for
 * the full-corpus JMdict test suites (Phase 14.4 recovery remediation).
 *
 * Responsibility (deliberately narrow): establish and verify, on the
 * operator-classified disposable PostgreSQL target, the state that those
 * suites assert:
 *
 *   1. the first-party bootstrap corpus is seeded through the application's
 *      own seeding path (KnowledgeCorpusService.ensureSeeded) BEFORE the
 *      JMdict corpus — the same bootstrap order production uses, so the
 *      suites' "first-party entry preserved" invariant has a real
 *      precondition instead of depending on another test file;
 *   2. knowledge_sources contains the JMdict provenance row, registered by
 *      the real ingestion path from the authoritative source registry;
 *   3. dictionary_entries contains the complete canonical JMdict corpus:
 *      EXPECTED_JMDICT_ENTRIES rows, all distinct deterministic IDs;
 *   4. the corpus was established through the real production ingestion path
 *      (scripts/ingest-full-jmdict.ts → executeIngestion), and the engine's
 *      idempotency guarantees hold at full scale.
 *
 * This is NOT a second ingestion implementation and NOT a fixture shortcut:
 * no corpus row is ever hand-written here. The engine runs with the same
 * explicit authorization the CLI flag (`--authorize-full-ingestion`) maps to,
 * under the same fail-closed target classification (loopback +
 * NIHONGO_DB_TARGET_CLASS / NIHONGO_DB_EXPECTED_DATABASE), which refuses any
 * production-classified target before a write connection is opened.
 *
 * Invoking this helper more than once is safe and meaningful:
 *   - the establishing call keeps the engine's own Run-2 idempotency
 *     verification enabled (a second full pass must insert 0 / update 0 and
 *     leave the row count unchanged);
 *   - any later call re-runs the real ingestion path in convergence mode and
 *     must again finish at EXPECTED_JMDICT_ENTRIES rows with zero inserts and
 *     zero updates, proving repeat-invocation idempotency at full scale.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dictionaryEntries, knowledgeSources } from "@/db/schema";
import {
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_RELEASE,
  JMDICT_SOURCE_ID,
} from "@/etl/dictionary/jmdictContract";
import { getRegisteredSource } from "@/services/knowledge/provenance/registry";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import {
  executeIngestion,
  type SourceMetadata,
} from "../../scripts/ingest-full-jmdict";

export interface FullJmdictDatabaseState {
  /** Rows in dictionary_entries with source_ref = upstream:jmdict:2023-08. */
  jmdictRowCount: number;
  /** Distinct deterministic IDs among those rows (duplicate detector). */
  distinctIdCount: number;
  /** Provenance row as persisted by the real ingestion path. */
  provenance: { id: string; name: string; version: string; license: string };
  /** Whether the first-party bootstrap corpus (de-mizu …) is present. */
  firstPartyPresent: boolean;
  /** How the corpus reached the verified state on this invocation. */
  establishment: "established" | "converged";
  /** Evidence from the real ingestion engine for this invocation. */
  ingestionReport: {
    processedCount: number;
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    /** Engine Run-2 result; null when this invocation was convergence-only. */
    idempotentRun2: boolean | null;
    sourceRelease: string;
  };
}

interface IngestionReportShape {
  source?: SourceMetadata;
  processedCount?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  idempotencyRun2?: { isIdempotent?: boolean } | null;
}

interface ContractState {
  jmdictRowCount: number;
  distinctIdCount: number;
  provenance: { id: string; name: string; version: string; license: string } | null;
  firstPartyPresent: boolean;
}

async function readContractState(): Promise<ContractState> {
  const [jmdictRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, JMDICT_SOURCE_ID));
  const [distinctRow] = await db
    .select({ count: sql`cast(count(distinct id) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceRef, JMDICT_SOURCE_ID));
  const [provenanceRow] = await db
    .select({
      id: knowledgeSources.id,
      name: knowledgeSources.name,
      version: knowledgeSources.version,
      license: knowledgeSources.license,
    })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, JMDICT_SOURCE_ID))
    .limit(1);
  const [firstPartyRow] = await db
    .select({ count: sql`cast(count(*) as int)` })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.id, "de-mizu"));
  return {
    jmdictRowCount: Number(jmdictRow?.count ?? 0),
    distinctIdCount: Number(distinctRow?.count ?? 0),
    provenance: provenanceRow ?? null,
    firstPartyPresent: Number(firstPartyRow?.count ?? 0) === 1,
  };
}

function assertContract(state: ContractState, provenanceContract: {
  id: string;
  name: string;
  version: string;
  license: string;
}): void {
  if (state.jmdictRowCount !== EXPECTED_JMDICT_ENTRIES) {
    throw new Error(
      `[JMdict integration setup] CONTRACT VIOLATION: dictionary_entries holds ${state.jmdictRowCount} canonical JMdict rows; expected exactly ${EXPECTED_JMDICT_ENTRIES}.`,
    );
  }
  if (state.distinctIdCount !== EXPECTED_JMDICT_ENTRIES) {
    throw new Error(
      `[JMdict integration setup] CONTRACT VIOLATION: ${state.distinctIdCount} distinct deterministic IDs for ${state.jmdictRowCount} rows; duplicates or missing IDs detected.`,
    );
  }
  if (!state.provenance) {
    throw new Error(
      `[JMdict integration setup] CONTRACT VIOLATION: knowledge_sources row "${JMDICT_SOURCE_ID}" is absent; the real ingestion path must register provenance.`,
    );
  }
  for (const [field, expected] of [
    ["id", provenanceContract.id],
    ["name", provenanceContract.name],
    ["version", provenanceContract.version],
    ["license", provenanceContract.license],
  ] as const) {
    if (state.provenance[field] !== expected) {
      throw new Error(
        `[JMdict integration setup] PROVENANCE IDENTITY MISMATCH: ${field} is "${state.provenance[field]}", expected "${expected}" from the authoritative source registry.`,
      );
    }
  }
}

/**
 * Establish (or re-verify) the full JMdict database state. Throws with a
 * precise, fail-closed error if any part of the contract is not met.
 */
export async function ensureFullJmdictDatabaseState(): Promise<FullJmdictDatabaseState> {
  // Step 1 — application first-party bootstrap through the real seeding path,
  // before corpus ingestion, matching production bootstrap ordering.
  await KnowledgeCorpusService.ensureSeeded();

  const provenanceContract = getRegisteredSource(JMDICT_SOURCE_ID);
  if (!provenanceContract) {
    throw new Error(
      `[JMdict integration setup] PROVENANCE UNREGISTERED: "${JMDICT_SOURCE_ID}" is missing from the authoritative source registry.`,
    );
  }

  // Step 2 — decide establishing vs convergence invocation, then run the real
  // production ingestion path with deterministic settings.
  const before = await readContractState();
  const established =
    before.jmdictRowCount === EXPECTED_JMDICT_ENTRIES &&
    before.distinctIdCount === EXPECTED_JMDICT_ENTRIES &&
    before.provenance !== null;

  const result = await executeIngestion({
    dryRun: false,
    authorizeFullIngestion: true,
    conflictPolicy: "update",
    batchSize: 1000,
    ...(established ? { skipIdempotencyRun2: true } : {}),
  });

  if (result.status !== "SUCCESS") {
    throw new Error(
      `[JMdict integration setup] INGESTION FAILED: engine returned status "${result.status}".`,
    );
  }
  const report = result.report as IngestionReportShape;

  // Step 3 — idempotency evidence at full scale.
  const processedCount = Number(report.processedCount ?? 0);
  const insertedCount = Number(report.insertedCount ?? 0);
  const updatedCount = Number(report.updatedCount ?? 0);
  const skippedCount = Number(report.skippedCount ?? 0);
  const idempotentRun2 = established
    ? null
    : Boolean(report.idempotencyRun2?.isIdempotent);

  if (established) {
    if (insertedCount !== 0 || updatedCount !== 0) {
      throw new Error(
        `[JMdict integration setup] RE-INGESTION NOT IDEMPOTENT: convergence pass inserted ${insertedCount} and updated ${updatedCount} rows; expected 0 and 0.`,
      );
    }
  } else {
    if (!report.idempotencyRun2 || report.idempotencyRun2.isIdempotent !== true) {
      throw new Error(
        "[JMdict integration setup] RE-INGESTION NOT IDEMPOTENT: engine Run-2 verification did not report a clean second full pass (0 inserts, 0 updates, stable row count).",
      );
    }
  }

  // Step 4 — source metadata from the verified immutable artifact.
  const source = report.source;
  if (!source || source.releaseVersion !== EXPECTED_JMDICT_RELEASE) {
    throw new Error(
      `[JMdict integration setup] SOURCE METADATA MISMATCH: verified release is "${source?.releaseVersion}", expected "${EXPECTED_JMDICT_RELEASE}".`,
    );
  }

  // Step 5 — final contract verification (fail closed on any drift).
  const after = await readContractState();
  assertContract(after, provenanceContract);
  if (!after.firstPartyPresent) {
    console.warn(
      "[JMdict integration setup] first-party bootstrap rows (de-mizu) are absent: KnowledgeCorpusService.ensureSeeded() skipped because dictionary_entries was already non-empty before this setup ran. Use a fresh disposable database for a fully deterministic contract.",
    );
  }

  return {
    jmdictRowCount: after.jmdictRowCount,
    distinctIdCount: after.distinctIdCount,
    provenance: after.provenance!,
    firstPartyPresent: after.firstPartyPresent,
    establishment: established ? "converged" : "established",
    ingestionReport: {
      processedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      idempotentRun2,
      sourceRelease: source.releaseVersion,
    },
  };
}
