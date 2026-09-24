/**
 * §9 — Source-neutral sentence acquisition contracts.
 *
 * These are INTERFACE CONTRACTS ONLY. Nothing in this file describes a real
 * Tatoeba artifact, and no field here is populated with invented data. They
 * exist so that the sentence pipeline can be typed and its consumers written
 * before any upstream artifact is acquired.
 *
 * ## Why source-neutral
 *
 * Phase 14.5A is BLOCKED on a real artifact. If these types were named after
 * Tatoeba, every consumer would implicitly assume that specific upstream shape —
 * and the shape would then have to be guessed. Naming them generically means:
 *
 *   - the artifact's *actual* observed schema (delimiter, columns, language
 *     coding, relationship representation) is determined at acquisition time
 *     from the file itself, not from these types;
 *   - a future adapter maps the observed schema onto these contracts;
 *   - nothing here constitutes a claim that Tatoeba data exists.
 *
 * ## What these types must never contain
 *
 * No fabricated sentence IDs, hashes, record counts, release dates, licences, or
 * translation relationships. Every field is either caller-supplied or unknown.
 * `provenance` deliberately carries no defaults — an absent artifact means
 * absent provenance, not a placeholder.
 */

/**
 * Verbatim-preserved source record for one sentence.
 *
 * `rawText` is byte-preserved and must never be overwritten by a normalized
 * form. Normalization (Phase 14.5B) produces a *separate* representation
 * alongside it; see `normalizedText`.
 */
export interface SentenceSourceRecord {
  /** Upstream sentence identity. Authoritative; never replaced by a local id. */
  upstreamSentenceId: string;
  /**
   * Upstream language identifier, exactly as the artifact encodes it.
   *
   * The artifact's own language field is authoritative. Japanese is never
   * inferred from the presence of kana/kanji in `rawText`.
   *
   * The concrete coding (ISO 639-3 `jpn`, a numeric code, a display name) is an
   * artifact property and is deliberately not fixed here.
   */
  upstreamLanguage: string;
  /** Source text, preserved exactly as it appeared in the artifact. */
  rawText: string;
  /**
   * Normalized representation, produced only by Phase 14.5B.
   *
   * `null` in the acquisition layer. This is the raw/normalized boundary:
   * acquisition populates `rawText` and leaves this null.
   */
  normalizedText: string | null;
  /** Which artifact this record came from. */
  provenance: SentenceProvenanceRef;
}

/** A directed translation/sentence relationship, as the artifact supplies it. */
export interface SentenceRelationshipRecord {
  sourceUpstreamSentenceId: string;
  targetUpstreamSentenceId: string;
  /** Relationship kind, as encoded upstream (e.g. a translation link). */
  relationshipType: string;
  provenance: SentenceProvenanceRef;
}

/**
 * Reference binding a record back to the immutable artifact it came from.
 *
 * Every field is required. There is no "unknown" placeholder and no default: a
 * record with no verifiable artifact behind it must not be constructible.
 */
export interface SentenceProvenanceRef {
  /** Registry source id, e.g. `upstream:<provider>:<snapshot>` once verified. */
  sourceId: string;
  /** SHA-256 of the exact artifact bytes this record came from. */
  artifactSha256: string;
  /** Artifact path or filename as acquired. */
  artifact: string;
  /** Upstream sentence id this record is derived from. */
  upstreamRecordId: string;
}

/** How a file was compressed, when it was. */
export type ArtifactCompression = "none" | "bz2" | "gz" | "xz" | "zip" | "tar";

/**
 * Acquisition manifest skeleton.
 *
 * Deliberately NOT the emitted manifest type. The emitted manifest is produced
 * only after a real artifact exists and every measured field has been observed
 * (see `reports/gates/PHASE-14.5A-NEXT-SESSION-HANDOFF.md`). This interface
 * exists so consumers can be typed now.
 *
 * Note the absence of record counts, Japanese counts, and relationship counts:
 * those are *measurements*, and a type with a numeric field invites a caller to
 * write `0`, which is indistinguishable from a measured-empty artifact.
 */
export interface AcquisitionManifest {
  schemaVersion: string;
  source: {
    sourceId: string;
    name: string;
    /** Snapshot/version as evidenced by the artifact. Never invented. */
    version: string;
    url: string;
    license: string;
    attribution: string;
  };
  artifact: {
    path: string;
    filename: string;
    /** Measured byte size. */
    bytes: number;
    /** Measured SHA-256 of the artifact as acquired. */
    sha256: string;
    /** ISO-8601 timestamp of retrieval. */
    acquiredAt: string;
    compression: ArtifactCompression;
    /**
     * When `compression !== "none"`, the SHA-256 of the *decompressed* derivative,
     * so both the as-downloaded and as-parsed bytes are independently verifiable.
     */
    extractedSha256?: string;
  };
  /**
   * Format facts observed from the artifact itself (delimiter, encoding, BOM,
   * column count/order). Populated at acquisition; never assumed beforehand.
   */
  format: Record<string, string | number | boolean>;
  status: "acquired" | "verified" | "blocked";
}

/**
 * Validation classification for one source record. Mirrors the accept / warn /
 * reject model without binding to any specific artifact's error taxonomy.
 */
export type SentenceValidationStatus = "ACCEPT" | "WARNING" | "REJECT";

export interface SentenceValidationResult {
  upstreamSentenceId: string | null;
  status: SentenceValidationStatus;
  /** Machine-readable reason codes, never free prose alone. */
  reasons: string[];
}
