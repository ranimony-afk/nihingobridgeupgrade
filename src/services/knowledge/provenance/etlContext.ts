/**
 * ETL Provenance Context — Phase 14.1.
 *
 * Implements the runtime boundary between the provenance registry and ETL pipelines.
 * Enforces that loaders receive verified source release metadata rather than
 * fabricating their own source references or licensing.
 */

import type { ETLDryRunManifest, ProvenanceContract } from "./types";
import { ProvenanceService } from "./provenanceService";

export interface ETLContextOptions {
  dryRun?: boolean;
}

export interface ETLProvenanceContext {
  /** The verified source contract */
  source: ProvenanceContract;
  /** Whether the pipeline is running in dry-run mode */
  isDryRun: boolean;
  /** Pipeline initialization timestamp */
  initializedAt: Date;
  /** Dry-run inspection manifest */
  manifest: ETLDryRunManifest;
  /**
   * Stretches and stamps canonical provenance onto an entity record.
   * Ensures the entity's sourceRef matches the validated context.
   */
  stampRecord: <T extends object>(record: T) => T & { sourceRef: string };
  /**
   * Asserts that a record's sourceRef conforms to the context source.
   */
  verifyRecordProvenance: (record: { sourceRef?: string | null }) => boolean;
}

/**
 * Creates an ETL provenance context for a given source identifier.
 * Fails closed if the source is unregistered, inactive, or has unverified licensing.
 */
export function createETLProvenanceContext(
  sourceId: string,
  options: ETLContextOptions = {}
): ETLProvenanceContext {
  const isDryRun = options.dryRun ?? false;

  // In non-dry-run mode, assert strict ingestibility (throws on failure)
  let source: ProvenanceContract;
  if (!isDryRun) {
    source = ProvenanceService.assertIngestible(sourceId);
  } else {
    // In dry-run mode, resolve source definition to produce diagnostic manifest
    const resolved = ProvenanceService.resolveProvenance(sourceId);
    if (!resolved) {
      throw new Error(
        `Dry-run aborted: source "${sourceId}" is not registered in the authoritative provenance registry.`
      );
    }
    source = ProvenanceService.assertIngestible(sourceId);
  }

  const manifest = ProvenanceService.createDryRunManifest(source.id);

  return {
    source,
    isDryRun,
    initializedAt: new Date(),
    manifest,
    stampRecord: <T extends object>(record: T) => ({
      ...record,
      sourceRef: source.id,
    }),
    verifyRecordProvenance: (record: { sourceRef?: string | null }) => {
      return record.sourceRef === source.id;
    },
  };
}
