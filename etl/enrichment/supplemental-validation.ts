/** Pure validation contract for provenance-gated JLPT and pitch feeds. */

const SHA256_RE = /^[0-9a-f]{64}$/;
const JLPT_LEVEL_RE = /^N[1-5]$/;

export type SupplementalManifest = {
  source: "jlpt" | "pitch";
  sourceUrl: string;
  sourceVersion: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  isFixture: boolean;
};

export type JlptFeedRecord = {
  kind: "jlpt";
  dictionarySourceId: string;
  level: "N1" | "N2" | "N3" | "N4" | "N5";
};

export type PitchFeedRecord = {
  kind: "pitch";
  dictionarySourceId: string;
  reading: string;
  /** One or more source-provided pitch drop positions (0 = heiban). */
  patterns: number[];
};

export type SupplementalFeed = {
  manifest: SupplementalManifest;
  records: (JlptFeedRecord | PitchFeedRecord)[];
};

export function validateManifest(manifest: SupplementalManifest): string | null {
  if (!SHA256_RE.test(manifest.checksumSha256)) return "manifest checksum is not a 64-char SHA-256";
  if (manifest.sourceVersion.trim().length === 0) return "manifest source version is required";
  if (manifest.license.trim().length === 0) return "manifest license is required";
  if (manifest.attribution.trim().length === 0) return "manifest attribution is required";
  try {
    new URL(manifest.sourceUrl);
  } catch {
    return "manifest source URL is invalid";
  }
  return null;
}

export function validatePitchRecord(record: PitchFeedRecord): string | null {
  if (!/^\d+$/.test(record.dictionarySourceId)) return "dictionarySourceId must be numeric";
  if (record.reading.trim().length === 0) return "pitch reading is required";
  if (record.patterns.length === 0) return "at least one pitch pattern is required";
  if (record.patterns.some((p) => !Number.isInteger(p) || p < 0 || p > 32)) {
    return "pitch pattern must be an integer from 0 to 32";
  }
  return null;
}

export function validateJlptRecord(record: JlptFeedRecord): string | null {
  if (!/^\d+$/.test(record.dictionarySourceId)) return "dictionarySourceId must be numeric";
  if (!JLPT_LEVEL_RE.test(record.level)) return "JLPT level must be N1 through N5";
  return null;
}
