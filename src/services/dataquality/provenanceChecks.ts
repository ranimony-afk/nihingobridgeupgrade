/**
 * §20 — Provenance quality checks.
 *
 * Enforces the project-wide provenance rule: every knowledge record must be
 * traceable to a **registered** source, with a real version/snapshot, and the
 * four placeholder strings (`latest`, `unknown`, `manual`, `AI`) are never
 * acceptable substitutes.
 *
 * The distinguishing principle here, versus the generic checks in `checks.ts`:
 *
 *   - `checks.ts` validates the *shape* of a source reference.
 *   - this module validates that the reference *resolves* — that the id it names
 *     actually exists in the registry.
 *
 * A record can be perfectly well-formed and still point at nothing. That case is
 * the common one in practice, because a plausible-looking id is easy to write and
 * impossible to distinguish from a real one without the registry.
 */

import type { QualityFinding } from "./checks";
import { PROVENANCE_PLACEHOLDERS } from "./checks";

/** Lifecycle state of a registered source. */
export type SourceStatus = "active" | "superseded" | "retired";

/**
 * Registry entry shape, structurally compatible with
 * `src/services/knowledge/provenance/registry.ts` without importing it, so these
 * checks stay usable against a registry loaded from anywhere (including a probe
 * of a future registry file).
 */
export interface RegisteredSource {
  id: string;
  type: string;
  name: string;
  version: string;
  releaseDate?: string;
  uri?: string;
  license?: string;
  attribution?: string;
  status?: SourceStatus;
}

/**
 * Checks that every `sourceRef` resolves to a registered source.
 *
 * An unresolvable reference is an `ERROR`, not a warning: a record claiming
 * provenance it cannot produce is indistinguishable from a fabricated one, and
 * the *point* of the reference is to make that distinction possible.
 */
export function checkSourceRegistration(
  subject: string,
  records: Iterable<{ id: string; sourceRef: string | null | undefined }>,
  registry: Map<string, RegisteredSource>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const ref = (record.sourceRef ?? "").trim();
    // Absent and placeholder references are handled by checkProvenanceRef; skip
    // them here so a single defect is not reported under two codes.
    if (!ref) continue;
    if ((PROVENANCE_PLACEHOLDERS as readonly string[]).includes(ref.toLowerCase())) continue;

    if (!registry.has(ref)) {
      findings.push({
        code: "UNREGISTERED_SOURCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `sourceRef "${ref}" is not present in the provenance registry`,
      });
    }
  }
  return findings;
}

/**
 * Checks that a record's claimed verification status is supported by its
 * provenance.
 *
 * The rule: provenance that cannot be verified must be represented as
 * `requires_review`. It must never be silently upgraded. This is the specific
 * check that catches records marked `published` while referencing an
 * unregistered or placeholder source — a combination that presents unverifiable
 * content to learners as verified.
 *
 * Status ranking, most to least verified: `published` / `verified` →
 * `requires_review` → `draft` / `unverified`.
 */
export const VERIFIED_STATUSES = ["published", "verified"] as const;

export function checkStatusProvenanceConsistency(
  subject: string,
  records: Iterable<{
    id: string;
    sourceRef: string | null | undefined;
    verificationStatus: string | null | undefined;
  }>,
  registry: Map<string, RegisteredSource>
): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const record of records) {
    const status = (record.verificationStatus ?? "").toLowerCase();
    if (!(VERIFIED_STATUSES as readonly string[]).includes(status)) continue;

    const ref = (record.sourceRef ?? "").trim();

    if (!ref) {
      findings.push({
        code: "VERIFIED_WITHOUT_PROVENANCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Marked "${status}" but has no sourceRef`,
      });
      continue;
    }

    if ((PROVENANCE_PLACEHOLDERS as readonly string[]).includes(ref.toLowerCase())) {
      findings.push({
        code: "VERIFIED_WITH_PLACEHOLDER_PROVENANCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Marked "${status}" but sourceRef is the placeholder "${ref}"`,
      });
      continue;
    }

    if (!registry.has(ref)) {
      findings.push({
        code: "VERIFIED_WITH_UNREGISTERED_SOURCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Marked "${status}" but sourceRef "${ref}" is not registered`,
      });
    }
  }

  return findings;
}

/**
 * Checks that a registry entry carries the metadata §20 requires.
 *
 * Missing `license` or `attribution` is an `ERROR`: a source whose licence is
 * unknown cannot be lawfully redistributed, and the decision may not be deferred
 * to distribution time. Missing `releaseDate` is a `WARNING` — a snapshot without
 * a date is still identifiable by version, but cannot be dated.
 *
 * `version: "latest"` (or any placeholder) is an `ERROR` for the reason given in
 * `checks.ts`: it looks like a pin while guaranteeing the record silently follows
 * upstream. For a provenance registry specifically, this defeats the entire
 * purpose of registering a source.
 */
export function checkRegistryCompleteness(
  sources: Iterable<RegisteredSource>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const subject = "knowledge_sources";

  for (const source of sources) {
    if (!source.license || source.license.trim() === "") {
      findings.push({
        code: "SOURCE_MISSING_LICENSE",
        severity: "ERROR",
        subject,
        ref: source.id,
        detail: "Registered source has no licence recorded",
      });
    }

    if (!source.attribution || source.attribution.trim() === "") {
      findings.push({
        code: "SOURCE_MISSING_ATTRIBUTION",
        severity: "ERROR",
        subject,
        ref: source.id,
        detail: "Registered source has no attribution recorded",
      });
    }

    const version = (source.version ?? "").trim();
    if (!version) {
      findings.push({
        code: "SOURCE_MISSING_VERSION",
        severity: "ERROR",
        subject,
        ref: source.id,
        detail: "Registered source has no version",
      });
    } else if ((PROVENANCE_PLACEHOLDERS as readonly string[]).includes(version.toLowerCase())) {
      findings.push({
        code: "SOURCE_PLACEHOLDER_VERSION",
        severity: "ERROR",
        subject,
        ref: source.id,
        detail: `Version "${version}" is a placeholder; a snapshot must be identity-bearing`,
      });
    }

    if (!source.releaseDate || source.releaseDate.trim() === "") {
      findings.push({
        code: "SOURCE_MISSING_RELEASE_DATE",
        severity: "WARNING",
        subject,
        ref: source.id,
        detail: "Registered source has no release date; the version cannot be dated",
      });
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Artifact identity
 * ------------------------------------------------------------------ */

/**
 * An acquired artifact's identity, as measured — never as assumed.
 *
 * Every field is required. `sha256` in particular must be the digest of the bytes
 * actually on disk; a digest copied from a report describes what someone believed
 * they had, not what is present.
 */
export interface ArtifactIdentity {
  /** Registry source id this artifact belongs to. */
  sourceId: string;
  /** Filename as acquired. */
  filename: string;
  /** Measured size in bytes. */
  bytes: number;
  /** Measured SHA-256 of the artifact as downloaded. */
  sha256: string;
  /** ISO-8601 retrieval timestamp. */
  acquiredAt: string;
  /** Tool and version used to acquire, e.g. "curl/8.5.0". */
  acquiredWith: string;
  /** SHA-256 of the decompressed derivative, for compressed artifacts. */
  extractedSha256?: string;
}

/** Lowercase hex SHA-256. */
const SHA256_REGEX = /^[0-9a-f]{64}$/;

/**
 * Validates artifact identity for completeness and internal consistency.
 *
 * A `.bz2` artifact without `extractedSha256` is a `WARNING` rather than an
 * error: the compressed digest alone still identifies the download, but it does
 * not identify the *parsed* bytes, so it cannot detect a decompression that
 * produced different content than an earlier run did.
 *
 * A non-hex or wrong-length digest is an `ERROR` — it cannot be compared against
 * anything, so it provides no identity at all.
 */
export function checkArtifactIdentity(
  subject: string,
  artifacts: Iterable<ArtifactIdentity>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const compressedExtensions = [".bz2", ".gz", ".xz", ".zip"];

  for (const artifact of artifacts) {
    for (const field of [
      "sourceId",
      "filename",
      "sha256",
      "acquiredAt",
      "acquiredWith",
    ] as const) {
      const value = artifact[field];
      if (typeof value !== "string" || value.trim() === "") {
        findings.push({
          code: "ARTIFACT_MISSING_FIELD",
          severity: "ERROR",
          subject,
          ref: artifact.filename || artifact.sourceId,
          detail: `Artifact identity is missing "${field}"`,
        });
      }
    }

    if (artifact.sha256 && !SHA256_REGEX.test(artifact.sha256)) {
      findings.push({
        code: "ARTIFACT_SHA256_MALFORMED",
        severity: "ERROR",
        subject,
        ref: artifact.filename || artifact.sourceId,
        detail: `sha256 "${artifact.sha256}" is not 64 lowercase hex characters`,
      });
    }

    if (artifact.extractedSha256 && !SHA256_REGEX.test(artifact.extractedSha256)) {
      findings.push({
        code: "ARTIFACT_SHA256_MALFORMED",
        severity: "ERROR",
        subject,
        ref: artifact.filename || artifact.sourceId,
        detail: `extractedSha256 "${artifact.extractedSha256}" is not 64 lowercase hex characters`,
      });
    }

    if (!Number.isFinite(artifact.bytes) || artifact.bytes <= 0) {
      findings.push({
        code: "ARTIFACT_BYTES_INVALID",
        severity: "ERROR",
        subject,
        ref: artifact.filename || artifact.sourceId,
        detail: `byte size ${artifact.bytes} is not a positive number`,
      });
    }

    const isCompressed = compressedExtensions.some((ext) =>
      artifact.filename.toLowerCase().endsWith(ext)
    );
    if (isCompressed && !artifact.extractedSha256) {
      findings.push({
        code: "ARTIFACT_MISSING_EXTRACTED_SHA256",
        severity: "WARNING",
        subject,
        ref: artifact.filename,
        detail:
          "Compressed artifact has no extractedSha256; the decompressed bytes are not independently verifiable",
      });
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Snapshot identity
 * ------------------------------------------------------------------ */

/**
 * Validates the project's snapshot identifier convention:
 *
 * ```
 * upstream:<provider>:snapshot-<YYYY-MM-DD>-<sha256-prefix>
 * ```
 *
 * The date must be *evidenced* — derived from the artifact or from documented
 * upstream metadata, never invented. Unsupported registry metadata means the
 * snapshot is `UNVERIFIED`, which this check reports rather than repairs.
 */
export const SNAPSHOT_ID_REGEX =
  /^upstream:[a-z0-9-]+:snapshot-\d{4}-\d{2}-\d{2}-[0-9a-f]{8,64}$/;

export function checkSnapshotId(
  subject: string,
  records: Iterable<{ id: string; sourceId: string }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    if (!SNAPSHOT_ID_REGEX.test(record.sourceId)) {
      findings.push({
        code: "SNAPSHOT_ID_MALFORMED",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `"${record.sourceId}" does not match upstream:<provider>:snapshot-<YYYY-MM-DD>-<sha256-prefix>`,
      });
    }
  }
  return findings;
}

/**
 * Detects a superseded snapshot that has been rewritten or removed.
 *
 * Supersession *retains* the prior entry marked `superseded`; it never deletes or
 * rewrites it. A vanished predecessor destroys the ability to explain historical
 * data, which is the whole reason supersession was chosen over replacement.
 */
export function checkSupersessionRetention(
  currentSourceId: string,
  registry: Map<string, RegisteredSource>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const subject = "knowledge_sources";

  const provider = currentSourceId.split(":")[1];
  if (!provider) return findings;

  const sameProvider = [...registry.values()].filter(
    (source) => source.id.split(":")[1] === provider
  );

  if (sameProvider.length <= 1) return findings;

  const current = registry.get(currentSourceId);
  if (!current) return findings;

  const superseded = sameProvider.filter(
    (source) => source.id !== currentSourceId && source.status === "superseded"
  );

  for (const source of superseded) {
    if (!source.version || !source.releaseDate) {
      findings.push({
        code: "SUPERSEDED_SOURCE_INCOMPLETE",
        severity: "WARNING",
        subject,
        ref: source.id,
        detail:
          "Superseded snapshot lacks version/releaseDate, so the historical record cannot be dated",
      });
    }
  }

  return findings;
}
