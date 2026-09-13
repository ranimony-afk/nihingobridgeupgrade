/**
 * Production KANJIDIC2 ingestion pipeline.
 * Shares the Phase 04.6 operational runtime with JMdict.
 */

import { getKanjidicConfig, type EtlConfig } from "../config";
import { upsertKanjiBatch } from "../loaders/kanjidic-loader";
import { streamCharactersFromFile } from "../parsers/kanjidic-parser";
import {
  advanceCheckpoint,
  beginResumableRun,
  completeResumableRun,
  emptyProgress,
  failResumableRun,
  throwIfSimulatedInterruption,
  writeDeadLetters,
  type DeadLetterInput,
  type ProgressCounters,
  type ResumableRun,
} from "../runtime/operations";
import { resolveSource } from "../sources/jmdict-source";
import { normalizeCharacter, type NormalizedCharacter } from "../transforms/kanjidic-transform";
import { Deduplicator, type ValidationIssue } from "../validators/jmdict-validator";
import { validateCharacter } from "../validators/kanjidic-validator";

const PIPELINE = "kanjidic2";

export type KanjiPipelineReport = {
  importRunId: number | null;
  source: string;
  sourcePath: string;
  sourceBytes: number;
  sha256: string;
  checksumVerified: boolean;
  origin: string;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deadLetters: number;
  checkpointCursor: number;
  resumed: boolean;
  resumeCount: number;
  dryRun: boolean;
  durationMs: number;
  errorSample: ValidationIssue[];
};

function snapshot(
  context: ResumableRun | null,
  config: EtlConfig,
  source: { path: string; bytes: number; sha256: string; checksumVerified: boolean; origin: string },
  progress: ProgressCounters,
  errors: ValidationIssue[],
  startedAt: number,
): KanjiPipelineReport {
  return {
    importRunId: context?.importRunId ?? null,
    source: config.source,
    sourcePath: source.path,
    sourceBytes: source.bytes,
    sha256: source.sha256,
    checksumVerified: source.checksumVerified,
    origin: source.origin,
    parsed: progress.parsed,
    valid: progress.valid,
    invalid: progress.invalid,
    duplicates: progress.duplicates,
    inserted: progress.inserted,
    updated: progress.updated,
    unchanged: progress.unchanged,
    deadLetters: progress.deadLetters,
    checkpointCursor: context?.startCursor ?? progress.parsed,
    resumed: context?.resumed ?? false,
    resumeCount: context?.resumeCount ?? 0,
    dryRun: config.dryRun,
    durationMs: Date.now() - startedAt,
    errorSample: errors,
  };
}

export async function runKanjidicPipeline(
  overrides: Partial<EtlConfig> = {},
  log: (message: string) => void = () => {},
): Promise<KanjiPipelineReport> {
  const config = getKanjidicConfig(overrides);
  const startedAt = Date.now();
  const source = await resolveSource(config);
  const identity = {
    pipeline: PIPELINE,
    source: config.source,
    sourceUrl: source.url,
    sourceChecksumSha256: source.sha256,
  };

  const context = config.dryRun
    ? null
    : await beginResumableRun({
        ...identity,
        sourceVersion: source.sha256.slice(0, 12),
        license: config.license,
        attribution: config.attribution,
        checksumSha256: source.sha256,
        checksumVerified: source.checksumVerified,
        isFixture: source.origin === "fixture",
        dryRun: false,
        resume: config.resume,
      });
  if (context) {
    log(
      `checkpoint: run #${context.importRunId} ${context.resumed ? `resuming from cursor ${context.startCursor}` : "started at cursor 0"}`,
    );
  }

  const progress = context?.progress ?? emptyProgress();
  const dedupe = new Deduplicator();
  const errorSample: ValidationIssue[] = [];
  const batch: NormalizedCharacter[] = [];
  const pendingDeadLetters: DeadLetterInput[] = [];
  let cursor = 0;

  const flush = async (commitCursor: number) => {
    if (batch.length === 0 && pendingDeadLetters.length === 0) return;
    if (!config.dryRun) {
      const result = await upsertKanjiBatch(batch, context!.importRunId);
      progress.inserted += result.inserted;
      progress.updated += result.updated;
      progress.unchanged += result.unchanged;
      progress.deadLetters += await writeDeadLetters(
        context!.importRunId,
        PIPELINE,
        pendingDeadLetters,
      );
      await advanceCheckpoint(context!, commitCursor, progress);
      throwIfSimulatedInterruption(context!.batchesCommitted, config.failAfterCommittedBatches);
    }
    batch.length = 0;
    pendingDeadLetters.length = 0;
  };

  try {
    for await (const raw of streamCharactersFromFile(source.path, { limit: config.maxEntries })) {
      cursor += 1;
      const character = normalizeCharacter(raw, config.source);
      const issue = validateCharacter(character);

      if (cursor <= (context?.startCursor ?? 0)) {
        if (!issue) dedupe.accept(character.literal);
        continue;
      }

      progress.parsed += 1;
      if (issue) {
        progress.invalid += 1;
        if (errorSample.length < config.validationErrorSampleLimit) errorSample.push(issue);
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `kanjidic2:${character.literal}`,
          errorCode: "KANJIDIC2_VALIDATION_FAILED",
          errorMessage: issue.reason,
          payload: { literal: character.literal },
        });
        continue;
      }
      if (!dedupe.accept(character.literal)) {
        progress.duplicates += 1;
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `kanjidic2:${character.literal}`,
          errorCode: "KANJIDIC2_DUPLICATE_LITERAL",
          errorMessage: "duplicate kanji literal encountered in the input stream",
          payload: { literal: character.literal },
        });
        continue;
      }

      progress.valid += 1;
      batch.push(character);
      if (batch.length >= config.batchSize) {
        await flush(cursor);
        log(`checkpoint: cursor=${cursor} valid=${progress.valid} written=${progress.inserted + progress.updated}`);
      }
    }

    await flush(cursor);
    const report = snapshot(context, config, source, progress, errorSample, startedAt);
    if (context) {
      await completeResumableRun(context, {
        identity,
        status: "success",
        report: { ...report, errorSample: undefined },
        progress,
        sampledErrors: errorSample,
      });
    }
    return report;
  } catch (error) {
    const report = snapshot(context, config, source, progress, errorSample, startedAt);
    if (context) {
      await failResumableRun(context, {
        identity,
        status: "failed",
        report: { ...report, error: String(error), errorSample: undefined },
        progress,
        sampledErrors: [...errorSample, { sourceId: "-", reason: String(error) }],
        errorMessage: String(error),
      });
    }
    throw error;
  }
}
