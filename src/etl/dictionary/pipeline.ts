import { JMDICT_PILOT_50_RECORDS, type RawJMdictSourceRecord } from "./pilotData";
import { transformJMdictEntry, type ValidationIssue } from "./transformer";
import { DictionaryLoader } from "./loader";
import { JMDICT_SOURCE_REF, type CanonicalDictionaryEntry } from "./types";

export interface PipelineOptions {
  limit?: number;
  dryRun?: boolean;
  batchSize?: number;
  sourceRecords?: RawJMdictSourceRecord[];
}

export interface PipelineExecutionReport {
  sourceRecords: number;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ entSeq?: string; issues: ValidationIssue[] }>;
  isDryRun: boolean;
  durationMs: number;
  sampleRecords: CanonicalDictionaryEntry[];
}

export class DictionaryPipeline {
  /**
   * Runs the dictionary ingestion pipeline on the specified source records.
   */
  static async run(options: PipelineOptions = {}): Promise<PipelineExecutionReport> {
    const startTime = Date.now();
    const sourceRecords = options.sourceRecords || JMDICT_PILOT_50_RECORDS;
    const limit = options.limit ?? sourceRecords.length;
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 50;

    const recordsToProcess = sourceRecords.slice(0, limit);

    let parsed = 0;
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const errors: Array<{ entSeq?: string; issues: ValidationIssue[] }> = [];
    const validEntries: CanonicalDictionaryEntry[] = [];
    const seenIds = new Set<string>();

    // 1. Parse & Transform & Validate
    for (const raw of recordsToProcess) {
      parsed++;
      const { record, isValid, errors: validationErrors } = transformJMdictEntry(
        raw,
        JMDICT_SOURCE_REF,
      );

      if (!isValid || !record) {
        invalid++;
        errors.push({ entSeq: raw.entSeq, issues: validationErrors });
        continue;
      }

      // Check duplicates within batch
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
      await DictionaryLoader.ensureSource(validEntries.length);
    }

    // 3. Batch Load into Database
    for (let i = 0; i < validEntries.length; i += batchSize) {
      const batch = validEntries.slice(i, i + batchSize);
      const result = await DictionaryLoader.loadBatch(batch, { dryRun });
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
