/**
 * Shared production ETL operations: resumable checkpointing, dead letters,
 * final import reports and validation reports.
 *
 * Resumption invariant:
 *   checkpoint cursor N means source records 1..N have either been committed
 *   to an idempotent loader or persistently recorded as dead letters. A crash
 *   before checkpoint advancement replays work; a crash after it skips only
 *   durable work. Therefore no input is silently lost.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  etlCheckpoints,
  etlDeadLetters,
  etlImportReports,
  etlImportRuns,
  etlValidationReports,
} from "@/db/schema";
import { finishImportRun, startImportRun, type StartRunInput } from "../provenance/import-run";

export type PipelineIdentity = {
  pipeline: string;
  source: string;
  sourceUrl: string;
  sourceChecksumSha256: string;
};

export type ProgressCounters = {
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deadLetters: number;
};

export const emptyProgress = (): ProgressCounters => ({
  parsed: 0,
  valid: 0,
  invalid: 0,
  duplicates: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  deadLetters: 0,
});

function asProgress(value: unknown): ProgressCounters {
  const candidate = (value ?? {}) as Partial<Record<keyof ProgressCounters, unknown>>;
  const base = emptyProgress();
  for (const key of Object.keys(base) as (keyof ProgressCounters)[]) {
    const n = candidate[key];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) base[key] = n;
  }
  return base;
}

export type ResumableRun = {
  importRunId: number;
  checkpointId: number;
  startCursor: number;
  batchesCommitted: number;
  resumeCount: number;
  resumed: boolean;
  progress: ProgressCounters;
};

export type BeginRunInput = PipelineIdentity &
  StartRunInput & {
    resume: boolean;
  };

/**
 * Either reopen the most recent incomplete logical run for exactly the same
 * source checksum or create a new logical run and checkpoint.
 */
export async function beginResumableRun(input: BeginRunInput): Promise<ResumableRun> {
  if (input.resume) {
    const [existing] = await db
      .select({
        checkpointId: etlCheckpoints.id,
        importRunId: etlCheckpoints.importRunId,
        lastCommittedCursor: etlCheckpoints.lastCommittedCursor,
        batchesCommitted: etlCheckpoints.batchesCommitted,
        resumeCount: etlCheckpoints.resumeCount,
        progress: etlCheckpoints.progress,
      })
      .from(etlCheckpoints)
      .where(
        and(
          eq(etlCheckpoints.pipeline, input.pipeline),
          eq(etlCheckpoints.source, input.source),
          eq(etlCheckpoints.sourceChecksumSha256, input.sourceChecksumSha256),
          inArray(etlCheckpoints.status, ["running", "failed"]),
        ),
      )
      .orderBy(desc(etlCheckpoints.updatedAt))
      .limit(1);

    if (existing) {
      const resumeCount = existing.resumeCount + 1;
      await db.transaction(async (tx) => {
        await tx
          .update(etlCheckpoints)
          .set({ status: "running", resumeCount, lastError: "", updatedAt: new Date() })
          .where(eq(etlCheckpoints.id, existing.checkpointId));
        await tx
          .update(etlImportRuns)
          .set({ status: "running", finishedAt: null })
          .where(eq(etlImportRuns.id, existing.importRunId));
      });

      return {
        importRunId: existing.importRunId,
        checkpointId: existing.checkpointId,
        startCursor: existing.lastCommittedCursor,
        batchesCommitted: existing.batchesCommitted,
        resumeCount,
        resumed: true,
        progress: asProgress(existing.progress),
      };
    }
  }

  const importRunId = await startImportRun({
    source: input.source,
    sourceUrl: input.sourceUrl,
    sourceVersion: input.sourceVersion,
    license: input.license,
    attribution: input.attribution,
    checksumSha256: input.checksumSha256,
    checksumVerified: input.checksumVerified,
    isFixture: input.isFixture,
    dryRun: input.dryRun,
  });

  const [checkpoint] = await db
    .insert(etlCheckpoints)
    .values({
      importRunId,
      pipeline: input.pipeline,
      source: input.source,
      sourceUrl: input.sourceUrl,
      sourceChecksumSha256: input.sourceChecksumSha256,
      status: "running",
      progress: emptyProgress(),
    })
    .returning({ id: etlCheckpoints.id });

  return {
    importRunId,
    checkpointId: checkpoint.id,
    startCursor: 0,
    batchesCommitted: 0,
    resumeCount: 0,
    resumed: false,
    progress: emptyProgress(),
  };
}

/** Commit cursor after all effects for that batch are durable. */
export async function advanceCheckpoint(
  context: ResumableRun,
  lastCommittedCursor: number,
  progress: ProgressCounters,
): Promise<void> {
  if (lastCommittedCursor < context.startCursor) {
    throw new Error("checkpoint cursor cannot move backwards");
  }
  await db
    .update(etlCheckpoints)
    .set({
      lastCommittedCursor,
      batchesCommitted: context.batchesCommitted + 1,
      progress,
      status: "running",
      lastError: "",
      updatedAt: new Date(),
    })
    .where(eq(etlCheckpoints.id, context.checkpointId));
  context.batchesCommitted += 1;
  context.startCursor = lastCommittedCursor;
  context.progress = progress;
}

export type DeadLetterInput = {
  stage: "parse" | "transform" | "validate" | "load" | "pipeline";
  sourceRecordKey: string;
  errorCode: string;
  errorMessage: string;
  payload: Record<string, unknown>;
  retryable?: boolean;
};

const MAX_ERROR_MESSAGE = 2_000;
const MAX_PAYLOAD_TEXT = 2_000;

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  // Source records are not secret, but a dead letter should remain bounded.
  return JSON.parse(
    JSON.stringify(payload, (_key, value) =>
      typeof value === "string" && value.length > MAX_PAYLOAD_TEXT
        ? `${value.slice(0, MAX_PAYLOAD_TEXT)}…[truncated]`
        : value,
    ),
  ) as Record<string, unknown>;
}

/** Persist rejected records idempotently, allowing safe replay on resume. */
export async function writeDeadLetters(
  importRunId: number,
  pipeline: string,
  letters: DeadLetterInput[],
): Promise<number> {
  if (letters.length === 0) return 0;
  await db
    .insert(etlDeadLetters)
    .values(
      letters.map((letter) => ({
        importRunId,
        pipeline,
        stage: letter.stage,
        sourceRecordKey: letter.sourceRecordKey.slice(0, 160),
        errorCode: letter.errorCode.slice(0, 96),
        errorMessage: letter.errorMessage.slice(0, MAX_ERROR_MESSAGE),
        payload: compactPayload(letter.payload),
        retryable: letter.retryable ?? false,
      })),
    )
    .onConflictDoNothing();
  // Exact insert count is not reliable with onConflictDoNothing across drivers;
  // report attempted durable dead letters, while the DB remains deduplicated.
  return letters.length;
}

export type FinalizeInput = {
  identity: PipelineIdentity;
  status: "success" | "failed";
  report: Record<string, unknown>;
  progress: ProgressCounters;
  sampledErrors: unknown[];
  errorMessage?: string;
};

async function upsertImportReport(
  context: ResumableRun,
  input: FinalizeInput,
): Promise<void> {
  const values = {
    importRunId: context.importRunId,
    pipeline: input.identity.pipeline,
    status: input.status,
    sourceChecksumSha256: input.identity.sourceChecksumSha256,
    resumed: context.resumed,
    resumeCount: context.resumeCount,
    report: input.report,
    updatedAt: new Date(),
  };
  await db
    .insert(etlImportReports)
    .values(values)
    .onConflictDoUpdate({
      target: etlImportReports.importRunId,
      set: {
        status: values.status,
        resumed: values.resumed,
        resumeCount: values.resumeCount,
        report: values.report,
        updatedAt: values.updatedAt,
      },
    });
}

export async function completeResumableRun(
  context: ResumableRun,
  input: FinalizeInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(etlCheckpoints)
      .set({
        status: "complete",
        lastCommittedCursor: Math.max(context.startCursor, input.progress.parsed),
        progress: input.progress,
        lastError: "",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(etlCheckpoints.id, context.checkpointId));
  });

  await db.insert(etlValidationReports).values({
    importRunId: context.importRunId,
    pipeline: input.identity.pipeline,
    stage: "validation",
    totalRecords: input.progress.parsed,
    validRecords: input.progress.valid,
    invalidRecords: input.progress.invalid,
    duplicateRecords: input.progress.duplicates,
    sampledErrors: input.sampledErrors,
  });
  await upsertImportReport(context, input);
  await finishImportRun(context.importRunId, input.status, input.report, input.sampledErrors);
}

export async function failResumableRun(
  context: ResumableRun,
  input: FinalizeInput,
): Promise<void> {
  const message = input.errorMessage ?? "ETL pipeline failed";
  await writeDeadLetters(context.importRunId, input.identity.pipeline, [
    {
      stage: "pipeline",
      sourceRecordKey: "",
      errorCode: "PIPELINE_FAILURE",
      errorMessage: message,
      payload: { report: input.report },
      retryable: false,
    },
  ]);
  await db
    .update(etlCheckpoints)
    .set({ status: "failed", progress: input.progress, lastError: message, updatedAt: new Date() })
    .where(eq(etlCheckpoints.id, context.checkpointId));
  await db.insert(etlValidationReports).values({
    importRunId: context.importRunId,
    pipeline: input.identity.pipeline,
    stage: "validation",
    totalRecords: input.progress.parsed,
    validRecords: input.progress.valid,
    invalidRecords: input.progress.invalid,
    duplicateRecords: input.progress.duplicates,
    sampledErrors: input.sampledErrors,
  });
  await upsertImportReport(context, input);
  await finishImportRun(context.importRunId, "failed", input.report, input.sampledErrors);
}

/** Explicit deterministic interruption used only by the resume integration test. */
export class SimulatedInterruptionError extends Error {
  constructor(readonly committedBatches: number) {
    super(`Simulated interruption after ${committedBatches} committed batch(es)`);
    this.name = "SimulatedInterruptionError";
  }
}

export function throwIfSimulatedInterruption(
  committedBatches: number,
  failAfterCommittedBatches: number | null,
): void {
  if (
    failAfterCommittedBatches !== null &&
    committedBatches >= failAfterCommittedBatches
  ) {
    throw new SimulatedInterruptionError(committedBatches);
  }
}
