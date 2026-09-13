/**
 * JMdict ingestion pipeline.
 *
 * Stages (Prompt 04.2):
 *   download -> checksum -> parse -> normalize -> validate
 *            -> deduplicate -> provenance -> upsert
 */

import { getEtlConfig, type EtlConfig } from "../config";
import { resolveSource } from "../sources/jmdict-source";
import { streamEntriesFromFile } from "../parsers/jmdict-parser";
import { normalizeEntry, type NormalizedEntry } from "../transforms/jmdict-transform";
import { Deduplicator, validateEntry, type ValidationIssue } from "../validators/jmdict-validator";
import { upsertBatch } from "../loaders/jmdict-loader";
import { finishImportRun, startImportRun } from "../provenance/import-run";

export type PipelineReport = {
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
  dryRun: boolean;
  durationMs: number;
  errorSample: ValidationIssue[];
};

export async function runJmdictPipeline(
  overrides: Partial<EtlConfig> = {},
  log: (msg: string) => void = () => {},
): Promise<PipelineReport> {
  const config = getEtlConfig(overrides);
  const startedAt = Date.now();

  // --- Stage 1+2: download (or fixture) + checksum ------------------------
  const source = await resolveSource(config);
  log(
    `source: ${source.origin} ${source.path} (${source.bytes} bytes) sha256=${source.sha256.slice(0, 16)}… verified=${source.checksumVerified}`,
  );

  // --- Stage 7a: provenance (open the run before writing any data) --------
  let importRunId: number | null = null;
  if (!config.dryRun) {
    importRunId = await startImportRun({
      source: config.source,
      sourceUrl: source.url,
      sourceVersion: source.sha256.slice(0, 12),
      license: config.license,
      attribution: config.attribution,
      checksumSha256: source.sha256,
      checksumVerified: source.checksumVerified,
      dryRun: config.dryRun,
    });
    log(`provenance: import run #${importRunId} opened`);
  }

  const dedupe = new Deduplicator();
  const errorSample: ValidationIssue[] = [];
  let parsed = 0;
  let valid = 0;
  let invalid = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  let batch: NormalizedEntry[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    if (!config.dryRun) {
      const res = await upsertBatch(batch, importRunId);
      inserted += res.inserted;
      updated += res.updated;
      unchanged += res.unchanged;
    }
    batch = [];
  };

  try {
    // --- Stage 3: parse ---------------------------------------------------
    for await (const raw of streamEntriesFromFile(source.path, {
      limit: config.maxEntries,
    })) {
      parsed += 1;

      // --- Stage 4: normalize --------------------------------------------
      const entry = normalizeEntry(raw, config.source);

      // --- Stage 5: validate ---------------------------------------------
      const issue = validateEntry(entry);
      if (issue) {
        invalid += 1;
        if (errorSample.length < config.validationErrorSampleLimit) {
          errorSample.push(issue);
        }
        continue;
      }

      // --- Stage 6: deduplicate ------------------------------------------
      if (!dedupe.accept(entry.sourceId)) continue;

      valid += 1;
      batch.push(entry);

      // --- Stage 8: upsert (batched) --------------------------------------
      if (batch.length >= config.batchSize) {
        await flush();
        log(`progress: parsed=${parsed} valid=${valid} written=${inserted + updated}`);
      }
    }

    await flush();

    const report: PipelineReport = {
      importRunId,
      source: config.source,
      sourcePath: source.path,
      sourceBytes: source.bytes,
      sha256: source.sha256,
      checksumVerified: source.checksumVerified,
      origin: source.origin,
      parsed,
      valid,
      invalid,
      duplicates: dedupe.duplicateCount,
      inserted,
      updated,
      unchanged,
      dryRun: config.dryRun,
      durationMs: Date.now() - startedAt,
      errorSample,
    };

    if (importRunId !== null) {
      await finishImportRun(
        importRunId,
        "success",
        { ...report, errorSample: undefined },
        errorSample,
      );
    }

    return report;
  } catch (error) {
    if (importRunId !== null) {
      await finishImportRun(
        importRunId,
        "failed",
        { parsed, valid, invalid, inserted, updated },
        [...errorSample, { sourceId: "-", reason: String(error) }],
      );
    }
    throw error;
  }
}
