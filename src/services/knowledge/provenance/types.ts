/**
 * Provenance Types and Contracts — Phase 14.1.
 *
 * Establishes the authoritative provenance foundation for all canonical
 * knowledge ingested into NihongoBridge.
 */

export const SOURCE_TYPES = [
  "upstream",
  "first_party",
  "enrichment",
  "editorial",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = [
  "active",
  "requires_review",
  "deprecated",
  "experimental",
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_DOMAINS = [
  "dictionary",
  "kanji",
  "grammar",
  "sentence",
  "mixed",
] as const;
export type SourceDomain = (typeof SOURCE_DOMAINS)[number];

/**
 * Full provenance contract for a registered knowledge source release.
 */
export interface ProvenanceContract {
  /** Deterministic source release ID, e.g. "upstream:jmdict:2024-07" or "first-party:kana:v1" */
  id: string;
  /** High-level provenance classification */
  type: SourceType;
  /** Human-readable source name */
  name: string;
  /** Explicit release version or date stamp (e.g. "2024-07", "v1") */
  version: string;
  /** Release publication date if known (ISO YYYY-MM-DD) */
  releaseDate?: string | null;
  /** Canonical source URI / repository URL */
  uri: string | null;
  /** SPDX identifier or explicit license statement. 'UNKNOWN' if unverified */
  license: string;
  /** Formal legal attribution string */
  attribution: string;
  /** Detailed description of dataset scope and contents */
  description: string;
  /** Knowledge domain */
  domain: SourceDomain;
  /** Operational lifecycle status */
  status: SourceStatus;
  /** Cryptographic checksum of the canonical artifact bytes, if pinned. */
  contentHash?: string | null;
  /** Byte length of the canonical artifact, when the release pin specifies one. */
  artifactBytes?: number | null;
  /** SHA-256 of the compressed acquisition archive, when separately pinned. */
  archiveSha256?: string | null;
  /** Target canonical database tables populated by this source */
  targetTables: string[];
}

/**
 * Interface representing a source release snapshot.
 */
export interface SourceRelease {
  sourceId: string;
  version: string;
  contentHash: string | null;
  acquiredAt: Date;
}

/**
 * Resolution result when looking up provenance for a retrieved record.
 */
export interface ProvenanceResolution {
  sourceRef: string;
  name: string;
  version: string;
  license: string;
  url: string | null;
  domain: SourceDomain;
  type: SourceType;
  attribution: string;
  status: SourceStatus;
  isLegalForIngestion: boolean;
}

/**
 * Dry-run execution manifest for future ETL pipelines.
 */
export interface ETLDryRunManifest {
  sourceId: string;
  sourceType: SourceType;
  sourceVersion: string;
  sourceUri: string | null;
  license: string;
  licenseStatus: "verified" | "requires_review";
  targetTables: string[];
  isClearedForIngestion: boolean;
  warnings: string[];
}
