import { TATOEBA_PILOT_FIXTURE } from "./pilotData";
import { SentenceMatcher } from "./matcher";
import { transformSentenceEntry, type SentenceValidationIssue } from "./transformer";
import { SentenceLoader } from "./loader";
import { TATOEBA_SOURCE_REF, type CanonicalExampleSentence, type RawSentenceSourceRecord } from "./types";

export interface SentencePipelineOptions {
  limit?: number;
  dryRun?: boolean;
  batchSize?: number;
  sourceRecords?: RawSentenceSourceRecord[];
}

export interface SentencePipelineExecutionReport {
  sourceRecords: number;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ tatoebaId?: string; issues: SentenceValidationIssue[] }>;
  isDryRun: boolean;
  durationMs: number;
  sampleRecords: CanonicalExampleSentence[];
}

export class SentencePipeline {
  /**
   * Executes sentence ingestion pipeline.
   */
  static async run(
    options: SentencePipelineOptions = {},
  ): Promise<SentencePipelineExecutionReport> {
    const startTime = Date.now();
    const sourceRecords = options.sourceRecords || TATOEBA_PILOT_FIXTURE;
    const limit = options.limit ?? sourceRecords.length;
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 50;

    const recordsToProcess = sourceRecords.slice(0, limit);

    // Initialize matcher with current DB knowledge
    try {
      await SentenceMatcher.load();
    } catch {
      // In dry runs or offline tests without DB, matcher continues with empty cache
    }

    let parsed = 0;
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const errors: Array<{ tatoebaId?: string; issues: SentenceValidationIssue[] }> = [];
    const validEntries: CanonicalExampleSentence[] = [];
    const seenIds = new Set<string>();

    // 1. Parse, Transform, and Validate
    for (const raw of recordsToProcess) {
      parsed++;
      const { record, isValid, errors: validationErrors } = transformSentenceEntry(
        raw,
        TATOEBA_SOURCE_REF,
      );

      if (!isValid || !record) {
        invalid++;
        errors.push({ tatoebaId: raw.tatoebaId, issues: validationErrors });
        continue;
      }

      if (seenIds.has(record.id)) {
        duplicates++;
        continue;
      }
      seenIds.add(record.id);

      valid++;
      validEntries.push(record);
    }

    // 2. Ensure Source Provenance in DB
    if (!dryRun && validEntries.length > 0) {
      await SentenceLoader.ensureSource(validEntries.length);
    }

    // 3. Batch Load into Database
    for (let i = 0; i < validEntries.length; i += batchSize) {
      const batch = validEntries.slice(i, i + batchSize);
      const result = await SentenceLoader.loadBatch(batch, { dryRun });
      inserted += result.inserted;
      updated += result.updated;
      skipped += result.skipped;
    }

    return {
      sourceRecords: recordsToProcess.length,
      parsed,
      valid,
      invalid,
      duplicates,
      inserted,
      updated,
      skipped,
      errors,
      isDryRun: dryRun,
      durationMs: Date.now() - startTime,
      sampleRecords: validEntries.slice(0, 3),
    };
  }
}
