import type { MindTreeMnemonicRecord } from "@/lib/kanji/mindtreeMnemonicContent";

export const MINDTREE_REVIEW_EVIDENCE_SCHEMA = "nihongobridge-mindtree-editorial-review@1" as const;
export const MINDTREE_REVIEW_EVIDENCE_FORMAT_VERSION = 1 as const;

export type MindTreeReviewOutcome = "accepted" | "changes_requested" | "rejected";

export interface MindTreeEditorialReviewEvidence {
  schemaVersion: typeof MINDTREE_REVIEW_EVIDENCE_SCHEMA;
  evidenceFormatVersion: typeof MINDTREE_REVIEW_EVIDENCE_FORMAT_VERSION;
  recordId: string;
  reviewedRevision: {
    version: number;
    digestAlgorithm: "SHA-256";
    contentDigest: string;
  };
  outcome: MindTreeReviewOutcome;
  reviewerAttribution: string;
  identityTrust: "unverified_local_attribution";
  /** Browser clock is not an attested source; no review timestamp is asserted. */
  reviewedAt: null;
  timestampTrust: "unavailable";
  notes: string;
  issueReferences: string[];
  provenanceConcerns: string[];
  evidenceDigest: string;
}

export interface LocalReviewEvidenceInput {
  outcome: MindTreeReviewOutcome;
  reviewerAttribution: string;
  notes: string;
  issueReferences: readonly string[];
  provenanceConcerns: readonly string[];
}

/** UI guard only; it cannot establish that the named person truly reviewed it. */
export function canRecordLocalReviewDecision(input: {
  outcome: MindTreeReviewOutcome | "";
  reviewerAttribution: string;
  currentContentDigest: string;
  acknowledgedContentDigest: string;
  revisionSaved: boolean;
  isSubmitting?: boolean;
}): boolean {
  return OUTCOMES.has(input.outcome as MindTreeReviewOutcome)
    && Boolean(input.reviewerAttribution.trim())
    && /^[a-f0-9]{64}$/u.test(input.currentContentDigest)
    && input.acknowledgedContentDigest === input.currentContentDigest
    && input.revisionSaved
    && input.isSubmitting !== true;
}

export interface EvidenceVerification {
  valid: boolean;
  issues: string[];
  evidence?: MindTreeEditorialReviewEvidence;
}

const ALLOWED_EVIDENCE_KEYS = [
  "schemaVersion", "evidenceFormatVersion", "recordId", "reviewedRevision", "outcome",
  "reviewerAttribution", "identityTrust", "reviewedAt", "timestampTrust", "notes",
  "issueReferences", "provenanceConcerns", "evidenceDigest",
].sort();
const OUTCOMES = new Set<MindTreeReviewOutcome>(["accepted", "changes_requested", "rejected"]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;

/** Stable JSON for byte-level digests; arrays preserve caller-defined order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not support non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  throw new Error(`Canonical JSON does not support ${typeof value}.`);
}

export async function sha256Hex(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto SHA-256 is unavailable in this local context.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Digest only the revision-defining fields. Lifecycle/reviewer fields are
 * intentionally excluded; origin, provenance, source refs, and version are
 * included so relabeling or editing invalidates evidence.
 */
export function mnemonicRevisionPayload(record: MindTreeMnemonicRecord): Record<string, unknown> {
  return {
    schemaVersion: record.schemaVersion,
    id: record.id,
    character: record.character,
    version: record.version,
    keyword: record.keyword,
    componentCues: [...record.componentCues],
    story: record.story,
    readingHook: record.readingHook,
    origin: record.origin,
    provenanceRef: record.provenanceRef,
    sourceReferences: [...record.sourceReferences],
    interpretation: record.interpretation,
  };
}

export async function digestMnemonicRevision(record: MindTreeMnemonicRecord): Promise<string> {
  return sha256Hex(canonicalJson(mnemonicRevisionPayload(record)));
}

function evidencePayload(evidence: Omit<MindTreeEditorialReviewEvidence, "evidenceDigest">): Record<string, unknown> {
  return {
    schemaVersion: evidence.schemaVersion,
    evidenceFormatVersion: evidence.evidenceFormatVersion,
    recordId: evidence.recordId,
    reviewedRevision: evidence.reviewedRevision,
    outcome: evidence.outcome,
    reviewerAttribution: evidence.reviewerAttribution,
    identityTrust: evidence.identityTrust,
    reviewedAt: evidence.reviewedAt,
    timestampTrust: evidence.timestampTrust,
    notes: evidence.notes,
    issueReferences: [...evidence.issueReferences],
    provenanceConcerns: [...evidence.provenanceConcerns],
  };
}

function cleanStringList(values: readonly string[], label: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(values) || values.length > maxItems || values.some((value) => typeof value !== "string" || value.length > maxLength)) {
    throw new Error(`${label} must contain at most ${maxItems} strings, each no longer than ${maxLength} characters.`);
  }
  return values.map((value) => value.trim()).filter(Boolean);
}

/** Creates an explicitly local, non-authenticating review statement for one exact revision. */
export async function createLocalReviewEvidence(
  record: MindTreeMnemonicRecord,
  input: LocalReviewEvidenceInput,
): Promise<MindTreeEditorialReviewEvidence> {
  const reviewerAttribution = input.reviewerAttribution.trim();
  if (!reviewerAttribution || reviewerAttribution.length > 120) throw new Error("Enter a local reviewer attribution (1–120 characters). It will not be authenticated.");
  if (!OUTCOMES.has(input.outcome)) throw new Error("Unsupported review outcome.");
  if (input.notes.length > 2000) throw new Error("Review notes must not exceed 2,000 characters.");
  const evidence: Omit<MindTreeEditorialReviewEvidence, "evidenceDigest"> = {
    schemaVersion: MINDTREE_REVIEW_EVIDENCE_SCHEMA,
    evidenceFormatVersion: MINDTREE_REVIEW_EVIDENCE_FORMAT_VERSION,
    recordId: record.id,
    reviewedRevision: {
      version: record.version,
      digestAlgorithm: "SHA-256",
      contentDigest: await digestMnemonicRevision(record),
    },
    outcome: input.outcome,
    reviewerAttribution,
    identityTrust: "unverified_local_attribution",
    reviewedAt: null,
    timestampTrust: "unavailable",
    notes: input.notes.trim(),
    issueReferences: cleanStringList(input.issueReferences, "Issue references", 30, 240),
    provenanceConcerns: cleanStringList(input.provenanceConcerns, "Provenance concerns", 30, 500),
  };
  return { ...evidence, evidenceDigest: await sha256Hex(canonicalJson(evidencePayload(evidence))) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict parser/verifier for evidence data. Hashes detect change, not identity. */
export async function verifyLocalReviewEvidence(value: unknown): Promise<EvidenceVerification> {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Review evidence must be a JSON object."] };
  if (Object.keys(value).sort().join("\u0000") !== ALLOWED_EVIDENCE_KEYS.join("\u0000")) {
    issues.push("Review evidence has missing or unsupported fields.");
  }
  if (value.schemaVersion !== MINDTREE_REVIEW_EVIDENCE_SCHEMA) issues.push("Unsupported review-evidence schema version.");
  if (value.evidenceFormatVersion !== MINDTREE_REVIEW_EVIDENCE_FORMAT_VERSION) issues.push("Unsupported review-evidence format version.");
  if (typeof value.recordId !== "string" || !value.recordId.trim() || value.recordId.length > 160) issues.push("Invalid review evidence record identifier.");
  const revision = value.reviewedRevision;
  if (!isRecord(revision)
    || Object.keys(revision).sort().join("\u0000") !== ["contentDigest", "digestAlgorithm", "version"].join("\u0000")
    || !Number.isInteger(revision.version) || (revision.version as number) < 1
    || revision.digestAlgorithm !== "SHA-256"
    || typeof revision.contentDigest !== "string" || !SHA256_HEX.test(revision.contentDigest)) {
    issues.push("Invalid reviewed revision shape, version, or content digest.");
  }
  if (typeof value.outcome !== "string" || !OUTCOMES.has(value.outcome as MindTreeReviewOutcome)) issues.push("Unsupported review outcome.");
  if (typeof value.reviewerAttribution !== "string" || !value.reviewerAttribution.trim() || value.reviewerAttribution.length > 120) issues.push("Missing or invalid reviewer attribution.");
  if (value.identityTrust !== "unverified_local_attribution") issues.push("Local review identity must remain explicitly unverified.");
  if (value.reviewedAt !== null || value.timestampTrust !== "unavailable") issues.push("This local format cannot assert an authenticated review timestamp.");
  if (typeof value.notes !== "string" || value.notes.length > 2000) issues.push("Invalid review note.");
  for (const key of ["issueReferences", "provenanceConcerns"] as const) {
    const maxLength = key === "issueReferences" ? 240 : 500;
    if (!Array.isArray(value[key]) || value[key].length > 30 || value[key].some((item) => typeof item !== "string" || item.length > maxLength)) {
      issues.push(`Invalid ${key} list.`);
    }
  }
  if (typeof value.evidenceDigest !== "string" || !SHA256_HEX.test(value.evidenceDigest)) issues.push("Invalid review evidence digest.");
  if (issues.length) return { valid: false, issues };

  const { evidenceDigest, ...unsigned } = value as unknown as MindTreeEditorialReviewEvidence;
  const actualDigest = await sha256Hex(canonicalJson(evidencePayload(unsigned)));
  if (actualDigest !== evidenceDigest) return { valid: false, issues: ["Review evidence digest mismatch; evidence is tampered or corrupted."] };
  return { valid: true, issues: [], evidence: value as unknown as MindTreeEditorialReviewEvidence };
}
