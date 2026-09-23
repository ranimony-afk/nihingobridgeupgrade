/**
 * Provenance Service — Phase 14.1.
 *
 * Core engine for validating, resolving, and asserting knowledge source provenance.
 * Guarantees that every canonical knowledge item points to an authentic,
 * legally cleared, and immutable source release.
 */

import {
  type ETLDryRunManifest,
  type ProvenanceContract,
  type ProvenanceResolution,
  type SourceDomain,
  type SourceStatus,
  type SourceType,
  SOURCE_DOMAINS,
  SOURCE_STATUSES,
  SOURCE_TYPES,
} from "./types";
import {
  AUTHORITATIVE_SOURCE_REGISTRY,
  getRegisteredSource,
} from "./registry";

export interface ProvenanceValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ProvenanceService {
  /**
   * Deterministically formats a source release identifier.
   * Pattern: <type>:<namespace>:<version>
   * Example: upstream:jmdict:2024-07
   */
  static formatSourceId(
    type: SourceType,
    namespace: string,
    version: string
  ): string {
    const cleanType = type.trim().toLowerCase();
    const cleanNamespace = namespace
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    const cleanVersion = version.trim();
    return `${cleanType}:${cleanNamespace}:${cleanVersion}`;
  }

  /**
   * Parses a formatted source release identifier into its constituent parts.
   */
  static parseSourceId(sourceId: string): {
    type: string;
    namespace: string;
    version: string;
  } | null {
    if (!sourceId || typeof sourceId !== "string") return null;
    const parts = sourceId.split(":");
    if (parts.length < 3) return null;
    return {
      type: parts[0],
      namespace: parts[1],
      version: parts.slice(2).join(":"),
    };
  }

  /**
   * Validates metadata conformance for a candidate knowledge source.
   */
  static validateProvenance(
    metadata: Partial<ProvenanceContract>
  ): ProvenanceValidationResult {
    const errors: string[] = [];

    if (!metadata.id || typeof metadata.id !== "string" || !metadata.id.trim()) {
      errors.push("Missing required field: id");
    }

    if (!metadata.type || !SOURCE_TYPES.includes(metadata.type)) {
      errors.push(
        `Invalid or missing sourceType "${metadata.type}". Must be one of: ${SOURCE_TYPES.join(", ")}`
      );
    }

    if (!metadata.name || typeof metadata.name !== "string" || !metadata.name.trim()) {
      errors.push("Missing required field: name");
    }

    if (!metadata.version || typeof metadata.version !== "string" || !metadata.version.trim()) {
      errors.push("Missing required field: version");
    }

    if (!metadata.license || typeof metadata.license !== "string" || !metadata.license.trim()) {
      errors.push("Missing required field: license");
    }

    if (!metadata.description || typeof metadata.description !== "string" || !metadata.description.trim()) {
      errors.push("Missing required field: description");
    }

    if (!metadata.domain || !SOURCE_DOMAINS.includes(metadata.domain)) {
      errors.push(
        `Invalid or missing domain "${metadata.domain}". Must be one of: ${SOURCE_DOMAINS.join(", ")}`
      );
    }

    if (!metadata.status || !SOURCE_STATUSES.includes(metadata.status)) {
      errors.push(
        `Invalid or missing status "${metadata.status}". Must be one of: ${SOURCE_STATUSES.join(", ")}`
      );
    }

    if (!metadata.targetTables || !Array.isArray(metadata.targetTables) || metadata.targetTables.length === 0) {
      errors.push("Target tables array must specify at least one target table");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Asserts that a source is formally registered, legally verified, and cleared for ingestion.
   * Throws a descriptive error if the source fails any requirement (fail-closed guard).
   */
  static assertIngestible(sourceOrId: ProvenanceContract | string): ProvenanceContract {
    const source =
      typeof sourceOrId === "string"
        ? getRegisteredSource(sourceOrId)
        : sourceOrId;

    if (!source) {
      const id = typeof sourceOrId === "string" ? sourceOrId : "(unknown)";
      throw new Error(
        `Source "${id}" is not registered in the authoritative provenance registry. Registration required before ingestion.`
      );
    }

    if (source.status !== "active") {
      throw new Error(
        `Source "${source.id}" has operational status "${source.status}". Ingestion is prohibited unless status is "active".`
      );
    }

    const upperLicense = source.license.trim().toUpperCase();
    if (upperLicense === "UNKNOWN" || upperLicense === "REVIEW_REQUIRED") {
      throw new Error(
        `Source "${source.id}" has unverified licensing ("${source.license}"). Ingestion is blocked pending legal/attribution review.`
      );
    }

    return source;
  }

  /**
   * Resolves comprehensive provenance metadata for a given source reference string.
   */
  static resolveProvenance(sourceRef: string): ProvenanceResolution | null {
    if (!sourceRef) return null;
    const source = getRegisteredSource(sourceRef);
    if (!source) return null;

    const isLegal =
      source.status === "active" &&
      source.license !== "UNKNOWN" &&
      source.license !== "REVIEW_REQUIRED";

    return {
      sourceRef: source.id,
      name: source.name,
      version: source.version,
      license: source.license,
      url: source.uri,
      domain: source.domain,
      type: source.type,
      attribution: source.attribution,
      status: source.status,
      isLegalForIngestion: isLegal,
    };
  }

  /**
   * Batch resolves provenance records for a collection of source references.
   */
  static resolveProvenanceBatch(
    sourceRefs: string[]
  ): Record<string, ProvenanceResolution | null> {
    const result: Record<string, ProvenanceResolution | null> = {};
    for (const ref of sourceRefs) {
      if (ref && !(ref in result)) {
        result[ref] = this.resolveProvenance(ref);
      }
    }
    return result;
  }

  /**
   * Generates a dry-run execution manifest for future ETL pipelines.
   * Enables pipelines to verify provenance without contacting a database.
   */
  static createDryRunManifest(sourceId: string): ETLDryRunManifest {
    const source = getRegisteredSource(sourceId);
    const warnings: string[] = [];

    if (!source) {
      return {
        sourceId,
        sourceType: "upstream",
        sourceVersion: "unknown",
        sourceUri: null,
        license: "UNKNOWN",
        licenseStatus: "requires_review",
        targetTables: [],
        isClearedForIngestion: false,
        warnings: [`Source "${sourceId}" is not in the authoritative registry.`],
      };
    }

    let isCleared = true;
    let licenseStatus: "verified" | "requires_review" = "verified";

    if (source.status !== "active") {
      isCleared = false;
      warnings.push(`Operational status is "${source.status}" (requires "active").`);
    }

    if (
      source.license === "UNKNOWN" ||
      source.license === "REVIEW_REQUIRED" ||
      !source.license.trim()
    ) {
      isCleared = false;
      licenseStatus = "requires_review";
      warnings.push(`License is unverified ("${source.license}"). Legal review required.`);
    }

    return {
      sourceId: source.id,
      sourceType: source.type,
      sourceVersion: source.version,
      sourceUri: source.uri,
      license: source.license,
      licenseStatus,
      targetTables: source.targetTables,
      isClearedForIngestion: isCleared,
      warnings,
    };
  }
}
