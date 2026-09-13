/**
 * Production Tatoeba sentence ingestion pipeline.
 *
 * Uses the Phase 04.6 shared runtime for retry/checkpoints/dead letters/reports.
 * Sentence text remains provenance-safe: detailed exports preserve contributor
 * attribution; audio remains intentionally outside this pipeline.
 */

import { getTatoebaConfig, type TatoebaConfig } from "../config";
import { insertSentenceLinks, upsertSentenceBatch } from "../loaders/tatoeba-loader";
import { streamLinksFromFile, streamSentencesFromFile } from "../parsers/tatoeba-parser";
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
import { fileExists, resolveSource } from "../sources/jmdict-source";
import { normalizeSentence, type NormalizedSentence } from "../transforms/tatoeba-transform";
import { Deduplicator, type ValidationIssue } from "../validators/jmdict-validator";
import { validateSentence } from "../validators/tatoeba-validator";

const PIPELINE = "tatoeba";

export type TatoebaPipelineReport = {
  importRunId: number | null;
  source: string;
  sourcePath: string;
  sourceBytes: number;
  sha256: string;
  checksumVerified: boolean;
  origin: string;
  license: string;
  attribution: string;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  filteredByLang: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deadLetters: number;
  checkpointCursor: number;
  resumed: boolean;
  resumeCount: number;
  attributedToContributor: number;
  attributedToProject: number;
  linked: number;
  skippedDangling: number;
  dryRun: boolean;
  durationMs: number;
  errorSample: ValidationIssue[];
};

function snapshot(
  context: ResumableRun | null,
  config: TatoebaConfig,
  source: { path: string; bytes: number; sha256: string; checksumVerified: boolean; origin: string },
  progress: ProgressCounters,
  filteredByLang: number,
  attributedToContributor: number,
  attributedToProject: number,
  linked: number,
  skippedDangling: number,
  errorSample: ValidationIssue[],
  startedAt: number,
): TatoebaPipelineReport {
  return {
    importRunId: context?.importRunId ?? null,
    source: config.source,
    sourcePath: source.path,
    sourceBytes: source.bytes,
    sha256: source.sha256,
    checksumVerified: source.checksumVerified,
    origin: source.origin,
    license: config.license,
    attribution: config.attribution,
    parsed: progress.parsed,
    valid: progress.valid,
    invalid: progress.invalid,
    duplicates: progress.duplicates,
    filteredByLang,
    inserted: progress.inserted,
    updated: progress.updated,
    unchanged: progress.unchanged,
    deadLetters: progress.deadLetters,
    checkpointCursor: context?.startCursor ?? progress.parsed,
    resumed: context?.resumed ?? false,
    resumeCount: context?.resumeCount ?? 0,
    attributedToContributor,
    attributedToProject,
    linked,
    skippedDangling,
    dryRun: config.dryRun,
    durationMs: Date.now() - startedAt,
    errorSample,
  };
}

export async function runTatoebaPipeline(
  overrides: Partial<TatoebaConfig> = {},
  log: (message: string) => void = () => {},
): Promise<TatoebaPipelineReport> {
  const config = getTatoebaConfig(overrides);
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

  const langs = config.filterLang
    .split(",")
    .map((lang) => lang.trim().toLowerCase())
    .filter(Boolean);
  const progress = context?.progress ?? emptyProgress();
  const dedupe = new Deduplicator();
  const errorSample: ValidationIssue[] = [];
  const batch: NormalizedSentence[] = [];
  const pendingDeadLetters: DeadLetterInput[] = [];
  let cursor = 0;
  let filteredByLang = 0;
  let attributedToContributor = 0;
  let attributedToProject = 0;
  let linked = 0;
  let skippedDangling = 0;

  const flush = async (commitCursor: number) => {
    if (batch.length === 0 && pendingDeadLetters.length === 0) return;
    if (!config.dryRun) {
      const result = await upsertSentenceBatch(batch, context!.importRunId);
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
    for await (const raw of streamSentencesFromFile(source.path, { limit: config.maxEntries })) {
      cursor += 1;
      const sentence = normalizeSentence(raw, config.source, config.license);
      const filtered = langs.length > 0 && !langs.includes(sentence.lang);
      const issue = filtered
        ? null
        : validateSentence(sentence, {
            requireLangs: langs.length > 0 ? langs : undefined,
            enforceScript: config.enforceScript,
          });

      // Prime in-run dedup state while avoiding any replayed persistence.
      if (cursor <= (context?.startCursor ?? 0)) {
        if (!filtered && !issue) dedupe.accept(sentence.sourceId);
        continue;
      }

      progress.parsed += 1;
      if (filtered) {
        filteredByLang += 1;
        continue;
      }
      if (issue) {
        progress.invalid += 1;
        if (errorSample.length < config.validationErrorSampleLimit) errorSample.push(issue);
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `tatoeba:${sentence.sourceId}`,
          errorCode: "TATOEBA_VALIDATION_FAILED",
          errorMessage: issue.reason,
          payload: { id: sentence.sourceId, lang: sentence.lang, text: sentence.text },
        });
        continue;
      }
      if (!dedupe.accept(sentence.sourceId)) {
        progress.duplicates += 1;
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `tatoeba:${sentence.sourceId}`,
          errorCode: "TATOEBA_DUPLICATE_SOURCE_ID",
          errorMessage: "duplicate sentence id encountered in the input stream",
          payload: { id: sentence.sourceId, lang: sentence.lang },
        });
        continue;
      }

      progress.valid += 1;
      if (sentence.ownerUnknown) attributedToProject += 1;
      else attributedToContributor += 1;
      batch.push(sentence);
      if (batch.length >= config.batchSize) {
        await flush(cursor);
        log(`checkpoint: cursor=${cursor} valid=${progress.valid} written=${progress.inserted + progress.updated}`);
      }
    }

    await flush(cursor);

    // Link resolution is idempotent. If an interruption occurred after the
    // source checkpoint and before this stage, resume skips source rows and
    // executes this stage again; the unique pair constraint absorbs replay.
    if (!config.dryRun && config.linksFixturePath && (await fileExists(config.linksFixturePath))) {
      const pairs: { sourceId: string; translationSourceId: string }[] = [];
      for await (const link of streamLinksFromFile(config.linksFixturePath)) pairs.push(link);
      const result = await insertSentenceLinks(pairs, config.source);
      linked = result.linked;
      skippedDangling = result.skippedDangling;
    }

    const report = snapshot(
      context,
      config,
      source,
      progress,
      filteredByLang,
      attributedToContributor,
      attributedToProject,
      linked,
      skippedDangling,
      errorSample,
      startedAt,
    );
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
    const report = snapshot(
      context,
      config,
      source,
      progress,
      filteredByLang,
      attributedToContributor,
      attributedToProject,
      linked,
      skippedDangling,
      errorSample,
      startedAt,
    );
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
