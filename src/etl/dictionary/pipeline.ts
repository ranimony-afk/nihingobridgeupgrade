/**
 * Production Dictionary ETL Pipeline — Phase 14.2.
 *
 * Implements the full 8-stage dictionary ingestion pipeline:
 * RawRecord → ParsedRecord → NormalizedRecord → TransformedEntry →
 * ValidatedEntry → DeduplicatedEntry → ProvenanceStampedEntry → PersistenceCandidate.
 *
 * Guarantees:
 * - Deterministic IDs: de-jmdict-${entSeq}
 * - Direct integration with Phase 14.1 Provenance Framework (fails closed if unverified)
 * - Zero database writes when running in dry-run mode
 * - Clean pluggable persistence adapter (InMemory for offline tests, Drizzle for Phase 14.3)
 */

import { JMDICT_PILOT_50_RECORDS } from "./pilotData";
import { transformJMdictEntry } from "./transformer";
import { parseJMdictXmlString } from "./xmlParser";
import {
  type CanonicalDictionaryEntry,
  type DictionaryETLReport,
  type DictionaryPersistenceAdapter,
  type DictionaryPipelineOptions,
  type ETLDiagnostic,
  type RawJMdictSourceRecord,
  JMDICT_SOURCE_REF,
} from "./types";
import {
  DrizzleDictionaryPersistenceAdapter,
  InMemoryDictionaryPersistenceAdapter,
  areSensesEqual,
} from "./persistenceAdapter";
import { createETLProvenanceContext } from "@/services/knowledge/provenance";

export interface PipelineExecutionOptions extends DictionaryPipelineOptions {
  adapter?: DictionaryPersistenceAdapter;
}

export class DictionaryPipeline {
  /**
   * Executes the full Dictionary ETL Pipeline.
   */
  static async run(
    options: PipelineExecutionOptions = {}
  ): Promise<DictionaryETLReport> {
    const startTime = Date.now();
    const sourceId = options.sourceId || JMDICT_SOURCE_REF;
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? 50;

    const allDiagnostics: ETLDiagnostic[] = [];

    // 1. Establish Verified Provenance Context (Phase 14.1)
    // Fails closed if source is unknown, inactive, or unverified
    const provenanceContext = createETLProvenanceContext(sourceId, {
      dryRun,
    });

    // 2. Stage 1: Acquire & Parse
    let rawRecords: RawJMdictSourceRecord[] = [];
    if (options.xmlInput) {
      rawRecords = parseJMdictXmlString(options.xmlInput, options.limit);
    } else if (options.sourceRecords) {
      rawRecords = options.sourceRecords.slice(
        0,
        options.limit ?? options.sourceRecords.length
      );
    } else {
      rawRecords = JMDICT_PILOT_50_RECORDS.slice(
        0,
        options.limit ?? JMDICT_PILOT_50_RECORDS.length
      );
    }

    let parsed = 0;
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;

    const validEntries: CanonicalDictionaryEntry[] = [];
    const seenEntSeqs = new Map<string, CanonicalDictionaryEntry>();

    // 3. Stages 2–5: Normalize, Transform, Validate, Deduplicate
    for (const raw of rawRecords) {
      parsed++;

      // Transform and validate
      const result = transformJMdictEntry(raw, provenanceContext.source.id);
      allDiagnostics.push(...result.diagnostics);

      if (!result.isValid || !result.record) {
        invalid++;
        continue;
      }

      const candidate = result.record;

      // Deduplication check by entSeq within the batch
      const existing = seenEntSeqs.get(raw.entSeq);
      if (existing) {
        duplicates++;
        const isIdentical =
          existing.headword === candidate.headword &&
          existing.reading === candidate.reading &&
          areSensesEqual(existing.senses, candidate.senses);

        allDiagnostics.push({
          entSeq: raw.entSeq,
          stage: "deduplicate",
          severity: isIdentical ? "info" : "warning",
          code: isIdentical ? "DUPLICATE_IDENTICAL" : "DUPLICATE_CONFLICT",
          message: isIdentical
            ? `Duplicate identical entSeq ${raw.entSeq} skipped in batch.`
            : `Conflicting duplicate entSeq ${raw.entSeq} encountered; retaining initial entry.`,
        });
        continue;
      }

      // Stage 6: Provenance Stamping & Verification
      const stamped = provenanceContext.stampRecord(candidate);
      if (!provenanceContext.verifyRecordProvenance(stamped)) {
        invalid++;
        allDiagnostics.push({
          entSeq: raw.entSeq,
          stage: "provenance",
          severity: "error",
          code: "PROVENANCE_MISMATCH",
          message: `Entity failed provenance verification against context source ${provenanceContext.source.id}`,
        });
        continue;
      }

      seenEntSeqs.set(raw.entSeq, stamped);
      valid++;
      validEntries.push(stamped);
    }

    // 4. Stage 7 & 8: Persistence Adapter Execution
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    // Gate 15 Safety Guard: In dry-run mode, default to InMemory adapter; fail if Drizzle adapter is supplied
    const adapter: DictionaryPersistenceAdapter =
      options.adapter ||
      (dryRun
        ? new InMemoryDictionaryPersistenceAdapter()
        : new DrizzleDictionaryPersistenceAdapter());

    if (dryRun && adapter instanceof DrizzleDictionaryPersistenceAdapter) {
      throw new Error(
        "Database safety violation: DrizzleDictionaryPersistenceAdapter cannot be selected when dryRun is true. Use InMemoryDictionaryPersistenceAdapter or null persistence."
      );
    }

    // If dry-run, we do not perform database writes
    if (dryRun) {
      inserted = validEntries.length;
      updated = 0;
      skipped = 0;
    } else {
      // Execute in batches through adapter
      for (let i = 0; i < validEntries.length; i += batchSize) {
        const batch = validEntries.slice(i, i + batchSize);
        const batchResult = await adapter.upsertBatch(batch, {
          dryRun: false,
          conflictPolicy: options.conflictPolicy ?? "abort",
        });
        inserted += batchResult.inserted;
        updated += batchResult.updated;
        skipped += batchResult.skipped;
      }
    }

    const errorObjects = allDiagnostics
      .filter((d) => d.severity === "error")
      .map((d) => ({ entSeq: d.entSeq, message: d.message }));

    return {
      sourceId: provenanceContext.source.id,
      sourceVersion: provenanceContext.source.version,
      sourceRecords: rawRecords.length,
      parsed,
      valid,
      invalid,
      duplicates,
      inserted,
      updated,
      skipped,
      errors: errorObjects,
      diagnostics: allDiagnostics,
      isDryRun: dryRun,
      durationMs: Date.now() - startTime,
      sampleRecords: validEntries.slice(0, 3),
      dryRunManifest: provenanceContext.manifest,
    };
  }
}
