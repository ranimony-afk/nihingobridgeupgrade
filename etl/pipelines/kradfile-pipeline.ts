/**
 * Production KRADFILE component relationship pipeline.
 * Shares source retry, checkpointing, batching, reports and dead letters.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { kanjiCharacters } from "@/db/schema";
import { getKradfileConfig, type EtlConfig } from "../config";
import { upsertEnrichments, type EnrichmentInput } from "../loaders/enrichment-loader";
import { streamKradRecordsFromFile } from "../parsers/kradfile-parser";
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
import { assessNativeSource, type ProvenanceRun } from "../provenance/reliability";
import { resolveSource } from "../sources/jmdict-source";
import { isKanjiLiteral } from "../transforms/kanjidic-transform";
import { Deduplicator } from "../validators/jmdict-validator";

const PIPELINE = "kradfile";

type KradRecord = { literal: string; components: string[] };

export type KradfileReport = {
  importRunId: number | null;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  unmatched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deadLetters: number;
  checkpointCursor: number;
  resumed: boolean;
  resumeCount: number;
  accepted: boolean;
  reason: string;
  errorSample: string[];
};

function validRecord(literal: string, components: string[]): string | null {
  if (!isKanjiLiteral(literal)) return "literal is not a single CJK ideograph";
  if (components.length === 0) return "no components";
  if (components.some((component) => Array.from(component).length !== 1)) {
    return "component is not one character";
  }
  return null;
}

function snapshot(
  context: ResumableRun | null,
  progress: ProgressCounters,
  unmatched: number,
  accepted: boolean,
  reason: string,
  errorSample: string[],
): KradfileReport {
  return {
    importRunId: context?.importRunId ?? null,
    parsed: progress.parsed,
    valid: progress.valid,
    invalid: progress.invalid,
    duplicates: progress.duplicates,
    unmatched,
    inserted: progress.inserted,
    updated: progress.updated,
    unchanged: progress.unchanged,
    deadLetters: progress.deadLetters,
    checkpointCursor: context?.startCursor ?? progress.parsed,
    resumed: context?.resumed ?? false,
    resumeCount: context?.resumeCount ?? 0,
    accepted,
    reason,
    errorSample,
  };
}

export async function runKradfilePipeline(
  options: Partial<EtlConfig> & { allowFixtureProvenance?: boolean } = {},
): Promise<KradfileReport> {
  const { allowFixtureProvenance, ...configOverrides } = options;
  const config = getKradfileConfig(configOverrides);
  if (config.allowNetwork) {
    throw new Error(
      "KRADFILE network mode is blocked: the EDRDG source is a ZIP archive and requires a verified extraction stage before ingestion",
    );
  }
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

  const candidate: ProvenanceRun | null = context
    ? {
        id: context.importRunId,
        source: config.source,
        sourceUrl: source.url,
        license: config.license,
        attribution: config.attribution,
        checksumSha256: source.sha256,
        checksumVerified: source.checksumVerified,
        isFixture: source.origin === "fixture",
        status: "success",
      }
    : null;
  const trust = assessNativeSource(candidate, "kradfile", {
    allowFixture: allowFixtureProvenance,
  });

  // A rejected provenance still receives a report through the logical run, but
  // source records are never parsed or retained.
  if (!trust.trusted) {
    const progress = emptyProgress();
    const report = snapshot(context, progress, 0, false, trust.reason, [trust.reason]);
    if (context) {
      await failResumableRun(context, {
        identity,
        status: "failed",
        report,
        progress,
        sampledErrors: [trust.reason],
        errorMessage: trust.reason,
      });
    }
    return report;
  }

  const progress = context?.progress ?? emptyProgress();
  const dedupe = new Deduplicator();
  const batch: KradRecord[] = [];
  const pendingDeadLetters: DeadLetterInput[] = [];
  const errorSample: string[] = [];
  let cursor = 0;
  let unmatched = 0;

  const flush = async (commitCursor: number) => {
    if (batch.length === 0 && pendingDeadLetters.length === 0) return;
    if (!config.dryRun) {
      const literals = batch.map((record) => record.literal);
      const characters = literals.length
        ? await db
            .select({ id: kanjiCharacters.id, literal: kanjiCharacters.literal })
            .from(kanjiCharacters)
            .where(inArray(kanjiCharacters.literal, literals))
        : [];
      const idByLiteral = new Map(characters.map((character) => [character.literal, character.id]));
      const inputs: EnrichmentInput[] = [];
      for (const record of batch) {
        const subjectId = idByLiteral.get(record.literal);
        if (subjectId === undefined) {
          unmatched += 1;
          pendingDeadLetters.push({
            stage: "load",
            sourceRecordKey: `kradfile:${record.literal}`,
            errorCode: "KRADFILE_UNMATCHED_KANJI",
            errorMessage: "component record has no imported KANJIDIC2 character target",
            payload: { literal: record.literal, components: record.components },
          });
          continue;
        }
        inputs.push({
          subjectType: "kanji_character",
          subjectId,
          kind: "radical",
          variantKey: "kradfile-components",
          value: { system: "kradfile-components", components: record.components },
          sourceImportRunId: context!.importRunId,
          sourceRecordKey: `kradfile:${record.literal}`,
          derivationMethod: "kradfile-direct-component-projection",
          derivationVersion: "1",
        });
      }
      const result = inputs.length
        ? await upsertEnrichments(inputs)
        : { inserted: 0, updated: 0, unchanged: 0 };
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
    for await (const record of streamKradRecordsFromFile(source.path, config.maxEntries)) {
      cursor += 1;
      const issue = validRecord(record.literal, record.components);
      if (cursor <= (context?.startCursor ?? 0)) {
        if (!issue) dedupe.accept(record.literal);
        continue;
      }
      progress.parsed += 1;
      if (issue) {
        progress.invalid += 1;
        if (errorSample.length < config.validationErrorSampleLimit) errorSample.push(`${record.literal}: ${issue}`);
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `kradfile:${record.literal}`,
          errorCode: "KRADFILE_VALIDATION_FAILED",
          errorMessage: issue,
          payload: { literal: record.literal, components: record.components },
        });
        continue;
      }
      if (!dedupe.accept(record.literal)) {
        progress.duplicates += 1;
        pendingDeadLetters.push({
          stage: "validate",
          sourceRecordKey: `kradfile:${record.literal}`,
          errorCode: "KRADFILE_DUPLICATE_LITERAL",
          errorMessage: "duplicate literal encountered in input stream",
          payload: { literal: record.literal },
        });
        continue;
      }
      progress.valid += 1;
      batch.push(record);
      if (batch.length >= config.batchSize) await flush(cursor);
    }

    await flush(cursor);
    const report = snapshot(context, progress, unmatched, true, trust.reason, errorSample);
    if (context) {
      await completeResumableRun(context, {
        identity,
        status: "success",
        report,
        progress,
        sampledErrors: errorSample,
      });
    }
    return report;
  } catch (error) {
    const report = snapshot(context, progress, unmatched, true, trust.reason, errorSample);
    if (context) {
      await failResumableRun(context, {
        identity,
        status: "failed",
        report: { ...report, error: String(error) },
        progress,
        sampledErrors: [...errorSample, String(error)],
        errorMessage: String(error),
      });
    }
    throw error;
  }
}
