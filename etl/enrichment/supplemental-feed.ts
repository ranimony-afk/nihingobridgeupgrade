/**
 * Provenance-gated supplemental enrichment adapter (JLPT + pitch accent).
 *
 * No default production source is configured for either kind:
 * - JLPT: the official exam does not publish current fixed vocab/kanji lists.
 *   Values imported here are always labelled "source-curated", never official.
 * - Pitch: no source with documented, production-safe commercial reuse terms
 *   was approved in Phase 04.5.
 *
 * A release manager must explicitly review a source, verify its checksum and
 * add its canonical URL to the deployment allow-list before this adapter will
 * persist data. Tests can exercise the path with a fixture-only run.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { dictionaryEntries, dictionaryReadings } from "@/db/schema";
import { upsertEnrichments, type EnrichmentInput, type EnrichmentLoadResult } from "../loaders/enrichment-loader";
import { finishImportRun, startImportRun } from "../provenance/import-run";
import { assessSupplementalSource, type ProvenanceRun } from "../provenance/reliability";
import {
  validateJlptRecord,
  validateManifest,
  validatePitchRecord,
  type SupplementalFeed,
  type SupplementalManifest,
  type JlptFeedRecord,
  type PitchFeedRecord,
} from "./supplemental-validation";

export {
  validateManifest,
  validateJlptRecord,
  validatePitchRecord,
  type SupplementalFeed,
  type SupplementalManifest,
  type JlptFeedRecord,
  type PitchFeedRecord,
} from "./supplemental-validation";

export type SupplementalOptions = {
  /** Explicit source-review allow-list. Empty by default — fail closed. */
  approvedSourceUrls?: readonly string[];
  /** Test-only: permit a manifest labelled `isFixture`. */
  allowFixtureProvenance?: boolean;
};

export type SupplementalReport = {
  accepted: boolean;
  reason: string;
  importRunId: number | null;
  persisted: EnrichmentLoadResult;
  skippedInvalid: number;
  skippedMissingTarget: number;
  errorSample: string[];
};

const EMPTY: EnrichmentLoadResult = { inserted: 0, updated: 0, unchanged: 0 };

/**
 * Validate and apply a pre-reviewed supplemental feed.
 * Rejected feeds are recorded as failed provenance runs; they produce zero
 * enrichment rows. This creates a review/audit trail without retaining data.
 */
export async function applySupplementalFeed(
  feed: SupplementalFeed,
  options: SupplementalOptions = {},
): Promise<SupplementalReport> {
  const basicError = validateManifest(feed.manifest);
  if (basicError) {
    return {
      accepted: false,
      reason: basicError,
      importRunId: null,
      persisted: EMPTY,
      skippedInvalid: feed.records.length,
      skippedMissingTarget: 0,
      errorSample: [basicError],
    };
  }

  const importRunId = await startImportRun({
    source: feed.manifest.source,
    sourceUrl: feed.manifest.sourceUrl,
    sourceVersion: feed.manifest.sourceVersion,
    license: feed.manifest.license,
    attribution: feed.manifest.attribution,
    checksumSha256: feed.manifest.checksumSha256,
    checksumVerified: feed.manifest.checksumVerified,
    isFixture: feed.manifest.isFixture,
    dryRun: false,
  });

  const candidate: ProvenanceRun = {
    id: importRunId,
    source: feed.manifest.source,
    sourceUrl: feed.manifest.sourceUrl,
    license: feed.manifest.license,
    attribution: feed.manifest.attribution,
    checksumSha256: feed.manifest.checksumSha256,
    checksumVerified: feed.manifest.checksumVerified,
    isFixture: feed.manifest.isFixture,
    // Assessed as completed before data write; persisted run is then finished
    // success only when the transaction sequence completes.
    status: "success",
  };
  const policy = assessSupplementalSource(
    candidate,
    feed.manifest.source,
    options.approvedSourceUrls ?? [],
    { allowFixture: options.allowFixtureProvenance },
  );

  if (!policy.trusted) {
    await finishImportRun(importRunId, "failed", { records: feed.records.length }, [policy.reason]);
    return {
      accepted: false,
      reason: policy.reason,
      importRunId,
      persisted: EMPTY,
      skippedInvalid: 0,
      skippedMissingTarget: 0,
      errorSample: [policy.reason],
    };
  }

  const requestedIds = [...new Set(feed.records.map((r) => r.dictionarySourceId))];
  const entries =
    requestedIds.length === 0
      ? []
      : await db
          .select({ id: dictionaryEntries.id, sourceId: dictionaryEntries.sourceId })
          .from(dictionaryEntries)
          .where(
            and(
              eq(dictionaryEntries.source, "jmdict"),
              inArray(dictionaryEntries.sourceId, requestedIds),
            ),
          );
  const entryBySourceId = new Map(entries.map((e) => [e.sourceId, e]));

  const entryIds = entries.map((e) => e.id);
  const readingRows =
    entryIds.length === 0
      ? []
      : await db
          .select({ entryId: dictionaryReadings.entryId, text: dictionaryReadings.text })
          .from(dictionaryReadings)
          .where(inArray(dictionaryReadings.entryId, entryIds));
  const readingsByEntry = new Map<number, Set<string>>();
  for (const r of readingRows) {
    const readings = readingsByEntry.get(r.entryId) ?? new Set<string>();
    readings.add(r.text);
    readingsByEntry.set(r.entryId, readings);
  }

  const inputs: EnrichmentInput[] = [];
  const errors: string[] = [];
  let skippedInvalid = 0;
  let skippedMissingTarget = 0;

  for (const record of feed.records) {
    if (record.kind !== feed.manifest.source) {
      skippedInvalid += 1;
      if (errors.length < 50) {
        errors.push(`${record.dictionarySourceId}: record kind does not match feed source`);
      }
      continue;
    }

    const recordError =
      record.kind === "jlpt" ? validateJlptRecord(record) : validatePitchRecord(record);
    if (recordError) {
      skippedInvalid += 1;
      if (errors.length < 50) errors.push(`${record.dictionarySourceId}: ${recordError}`);
      continue;
    }

    const entry = entryBySourceId.get(record.dictionarySourceId);
    if (!entry) {
      skippedMissingTarget += 1;
      if (errors.length < 50) errors.push(`${record.dictionarySourceId}: dictionary entry not found`);
      continue;
    }

    if (record.kind === "pitch") {
      if (!readingsByEntry.get(entry.id)?.has(record.reading)) {
        skippedInvalid += 1;
        if (errors.length < 50) {
          errors.push(`${record.dictionarySourceId}: pitch reading is not an exact JMdict reading`);
        }
        continue;
      }
      inputs.push({
        subjectType: "dictionary_entry",
        subjectId: entry.id,
        kind: "pitch",
        variantKey: record.reading,
        value: { reading: record.reading, patterns: record.patterns, notation: "drop-after-mora" },
        sourceImportRunId: importRunId,
        sourceRecordKey: `${feed.manifest.source}:${record.dictionarySourceId}:${record.reading}`,
        derivationMethod: "source-supplied-pitch-pattern",
        derivationVersion: "1",
      });
    } else {
      inputs.push({
        subjectType: "dictionary_entry",
        subjectId: entry.id,
        kind: "jlpt",
        variantKey: record.level,
        value: {
          level: record.level,
          classification: "source-curated-not-official-jlpt-syllabus",
        },
        sourceImportRunId: importRunId,
        sourceRecordKey: `${feed.manifest.source}:${record.dictionarySourceId}`,
        derivationMethod: "source-supplied-curated-level",
        derivationVersion: "1",
      });
    }
  }

  const persisted = inputs.length ? await upsertEnrichments(inputs) : EMPTY;
  await finishImportRun(
    importRunId,
    "success",
    {
      records: feed.records.length,
      accepted: inputs.length,
      skippedInvalid,
      skippedMissingTarget,
      persisted,
    },
    errors,
  );

  return {
    accepted: true,
    reason: policy.reason,
    importRunId,
    persisted,
    skippedInvalid,
    skippedMissingTarget,
    errorSample: errors,
  };
}
