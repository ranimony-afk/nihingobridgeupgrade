import {
  exportMnemonicRecords,
  validateMnemonicRecords,
  type MindTreeMnemonicRecord,
} from "@/lib/kanji/mindtreeMnemonicContent";
import {
  canonicalJson,
  digestMnemonicRevision,
  sha256Hex,
  verifyLocalReviewEvidence,
  type MindTreeEditorialReviewEvidence,
} from "@/lib/kanji/mindtreeEditorialEvidence";
import type { MnemonicQualityFinding } from "@/lib/kanji/mindtreeMnemonicQuality";
import type { MindTreeReadinessResult } from "@/lib/kanji/mindtreeReleaseReadiness";

export const MINDTREE_EXPORT_SCHEMA = "nihongobridge-kanji-mnemonic-export@2" as const;
export const MINDTREE_EXPORT_FORMAT_VERSION = 2 as const;
export type MindTreeMnemonicExportKind = "draft_working" | "proposed_human_review" | "approved_release_candidate";

export const MINDTREE_SOURCE_ARTIFACT_DIGESTS = {
  kanjivgSliceSha256: "03a7c668aa303b9d98023ff58b11eaedb94f4104764e676acb9a0867988d5862",
  kanjidic2SliceSha256: "4cb8ca5902dede834827b5af1a73ad891f214d8d33478341ec3f42820c480db6",
} as const;

export interface MnemonicExportValidationRow {
  recordId: string;
  character: string;
  schemaValid: boolean;
  schemaIssues: string[];
  findings: MnemonicQualityFinding[];
}

export interface MnemonicExportOptions {
  kind: MindTreeMnemonicExportKind;
  records: readonly MindTreeMnemonicRecord[];
  supportedCharacters: ReadonlySet<string>;
  visualAnnotations: ReadonlyMap<string, ReadonlySet<string>>;
  validationResults: readonly MnemonicExportValidationRow[];
  revisionHistory?: readonly { recordId: string; revisions: readonly MindTreeMnemonicRecord[] }[];
  reviewEvidence?: readonly MindTreeEditorialReviewEvidence[];
  readinessResults?: readonly MindTreeReadinessResult[];
  reviewAnnotation?: { note: string; identityVerified: false; checklist?: readonly { question: string; checked: boolean }[] };
}

export interface MnemonicExportVerification {
  valid: boolean;
  issues: string[];
  package?: Record<string, unknown>;
}

function orderedRows(rows: readonly MnemonicExportValidationRow[]): MnemonicExportValidationRow[] {
  return [...rows].sort((left, right) => (left.character.codePointAt(0) ?? 0) - (right.character.codePointAt(0) ?? 0) || left.recordId.localeCompare(right.recordId));
}

function stableRecords(records: readonly MindTreeMnemonicRecord[]): MindTreeMnemonicRecord[] {
  return JSON.parse(exportMnemonicRecords(records)) as MindTreeMnemonicRecord[];
}

async function revisionHistoryIssues(
  records: readonly MindTreeMnemonicRecord[],
  history: readonly { recordId: string; revisions: readonly MindTreeMnemonicRecord[] }[],
): Promise<string[]> {
  const issues: string[] = [];
  const currentById = new Map(records.map((record) => [record.id, record]));
  for (const item of history) {
    const current = currentById.get(item.recordId);
    if (!current) {
      issues.push(`Revision history references absent packaged record ${item.recordId}.`);
      continue;
    }
    for (const revision of item.revisions) {
      if (revision.character !== current.character) issues.push(`Revision-history character mismatch for ${item.recordId}.`);
      if (revision.version > current.version) issues.push(`Revision history for ${item.recordId} contains future version ${revision.version} above current v${current.version}.`);
      if (revision.version === current.version && await digestMnemonicRevision(revision) !== await digestMnemonicRevision(current)) {
        issues.push(`Current record ${item.recordId} conflicts with revision-history content for the same version ${current.version}.`);
      }
    }
  }
  return issues;
}

async function assertEvidenceBindsToPackagedRevision(
  evidence: MindTreeEditorialReviewEvidence,
  records: readonly MindTreeMnemonicRecord[],
  history: readonly { recordId: string; revisions: readonly MindTreeMnemonicRecord[] }[],
): Promise<void> {
  const candidates = [
    ...records.filter((record) => record.id === evidence.recordId),
    ...history.filter((item) => item.recordId === evidence.recordId).flatMap((item) => item.revisions),
  ];
  for (const candidate of candidates) {
    if (candidate.version === evidence.reviewedRevision.version
      && await digestMnemonicRevision(candidate) === evidence.reviewedRevision.contentDigest) return;
  }
  throw new Error(`Review evidence for ${evidence.recordId} references a revision absent from this package and its revision history.`);
}

/**
 * Builds a deterministic offline export. The canonical digest is not a
 * signature and confers neither reviewer identity nor approval/release rights.
 */
export async function buildMnemonicExportPackage(options: MnemonicExportOptions): Promise<string> {
  const { kind } = options;
  let records = [...options.records];
  if (kind === "proposed_human_review" && records.length !== 1) {
    throw new Error("A proposed review package must contain exactly one selected record.");
  }
  if (kind === "approved_release_candidate") {
    throw new Error("M6 has no authenticated approval or release-authorization evidence model; this package category is fail-closed and cannot be generated locally.");
  }

  const validation = validateMnemonicRecords(records, options.supportedCharacters, options.visualAnnotations);
  if (!validation.valid) throw new Error(`Export blocked by schema validation: ${validation.issues.join("; ")}`);
  if (records.some((record) => record.origin === "ai_candidate" && ["approved", "scheduled", "published"].includes(record.editorialStatus))) {
    throw new Error("AI candidate content cannot enter an approved or release-candidate export.");
  }
  if (kind === "proposed_human_review" && options.reviewAnnotation?.identityVerified !== false) {
    throw new Error("Review annotations must be explicitly marked unverified in the local studio.");
  }

  const orderedRecords = stableRecords(records);
  const orderedHistory = [...(options.revisionHistory ?? [])]
    .map((item) => ({ recordId: item.recordId, revisions: stableRecords(item.revisions) }))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const historyIssues = await revisionHistoryIssues(orderedRecords, orderedHistory);
  if (historyIssues.length) throw new Error(`Export blocked by inconsistent revision history: ${historyIssues.join("; ")}`);
  const reviewEvidence: MindTreeEditorialReviewEvidence[] = [];
  for (const raw of options.reviewEvidence ?? []) {
    const verification = await verifyLocalReviewEvidence(raw);
    if (!verification.valid || !verification.evidence) throw new Error(`Review evidence rejected: ${verification.issues.join("; ")}`);
    if (!orderedRecords.some((record) => record.id === verification.evidence!.recordId)) {
      throw new Error(`Review evidence record ${verification.evidence.recordId} is not included in this package.`);
    }
    await assertEvidenceBindsToPackagedRevision(verification.evidence, orderedRecords, orderedHistory);
    reviewEvidence.push(verification.evidence);
  }
  reviewEvidence.sort((left, right) => left.recordId.localeCompare(right.recordId)
    || left.reviewedRevision.contentDigest.localeCompare(right.reviewedRevision.contentDigest)
    || left.evidenceDigest.localeCompare(right.evidenceDigest));

  const validationRows = orderedRows(options.validationResults);
  const validationIds = new Set(validationRows.map((row) => row.recordId));
  if (validationIds.size !== orderedRecords.length || orderedRecords.some((record) => !validationIds.has(record.id))) {
    throw new Error("Validation results must contain exactly one row for each exported record.");
  }
  for (const row of validationRows) {
    const record = orderedRecords.find((item) => item.id === row.recordId);
    if (!record || record.character !== row.character) throw new Error(`Validation result does not match exported record ${row.recordId}.`);
  }

  const unsigned: Record<string, unknown> = {
    schemaVersion: MINDTREE_EXPORT_SCHEMA,
    formatVersion: MINDTREE_EXPORT_FORMAT_VERSION,
    exportKind: kind,
    generatedBy: "offline_mindtree_editorial_studio",
    sourceArtifactDigests: MINDTREE_SOURCE_ARTIFACT_DIGESTS,
    records: orderedRecords,
    revisionHistory: orderedHistory,
    reviewEvidence,
    validationResults: validationRows,
    readinessResults: [...(options.readinessResults ?? [])].sort((left, right) => (left.character.codePointAt(0) ?? 0) - (right.character.codePointAt(0) ?? 0) || (left.recordId ?? "").localeCompare(right.recordId ?? "")),
    statusEffect: "none",
    learnerVisibilityEffect: "none",
    approvalEffect: "none",
    releaseAuthorization: "not_granted",
    ...(kind === "proposed_human_review" ? {
      localReviewAnnotation: {
        note: options.reviewAnnotation?.note ?? "",
        identityVerified: false,
        reviewerIdentity: null,
        reviewedAt: null,
        checklist: [...(options.reviewAnnotation?.checklist ?? [])].sort((left, right) => left.question.localeCompare(right.question)),
      },
    } : {}),
  };
  const canonicalUnsignedPackage = canonicalJson(unsigned);
  const artifactDigest = await sha256Hex(canonicalUnsignedPackage);
  const output = { ...unsigned, artifactDigest: { algorithm: "SHA-256", covers: "canonical JSON of all package fields except artifactDigest", value: artifactDigest } };
  return `${JSON.stringify(output, null, 2)}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeRecord(value: unknown): value is MindTreeMnemonicRecord {
  if (!isObject(value)) return false;
  const allowedKeys = ["schemaVersion", "id", "character", "version", "keyword", "componentCues", "story", "readingHook", "origin", "editorialStatus", "provenanceRef", "sourceReferences", "interpretation", "reviewerId", "reviewedAt", "publishedAt"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  return typeof value.schemaVersion === "string" && typeof value.id === "string" && typeof value.character === "string"
    && typeof value.version === "number" && Number.isInteger(value.version) && typeof value.keyword === "string" && Array.isArray(value.componentCues)
    && value.componentCues.every((cue) => typeof cue === "string") && typeof value.story === "string"
    && (typeof value.readingHook === "string" || value.readingHook === null)
    && typeof value.origin === "string" && typeof value.editorialStatus === "string"
    && typeof value.provenanceRef === "string" && Array.isArray(value.sourceReferences)
    && value.sourceReferences.every((ref) => typeof ref === "string")
    && (value.reviewerId === undefined || typeof value.reviewerId === "string")
    && (value.reviewedAt === undefined || typeof value.reviewedAt === "string")
    && (value.publishedAt === undefined || typeof value.publishedAt === "string")
    && value.interpretation === "memory-aid-not-etymology";
}

/**
 * Verification only: there is deliberately no import/apply/publish function.
 * V1 packages are unsupported after M6 because they cannot bind review evidence.
 */
export async function verifyMnemonicExportPackage(
  input: string | unknown,
  options: { supportedCharacters: ReadonlySet<string>; visualAnnotations: ReadonlyMap<string, ReadonlySet<string>> },
): Promise<MnemonicExportVerification> {
  let value: unknown = input;
  const issues: string[] = [];
  if (typeof input === "string") {
    try { value = JSON.parse(input) as unknown; }
    catch { return { valid: false, issues: ["Package is not valid JSON."] }; }
  }
  if (!isObject(value)) return { valid: false, issues: ["Package root must be a JSON object."] };
  const allowedPackageKeys = ["schemaVersion", "formatVersion", "exportKind", "generatedBy", "sourceArtifactDigests", "records", "revisionHistory", "reviewEvidence", "validationResults", "readinessResults", "statusEffect", "learnerVisibilityEffect", "approvalEffect", "releaseAuthorization", "localReviewAnnotation", "artifactDigest"].sort();
  if (Object.keys(value).some((key) => !allowedPackageKeys.includes(key))) issues.push("Package contains unsupported or potentially unrelated fields.");
  if (value.schemaVersion !== MINDTREE_EXPORT_SCHEMA || value.formatVersion !== MINDTREE_EXPORT_FORMAT_VERSION) {
    issues.push("Unsupported export schema or format version.");
  }
  if (!["draft_working", "proposed_human_review"].includes(String(value.exportKind))) {
    issues.push("Unsupported export category; approval/release-candidate packages are not supported in M6.");
  }
  if (value.generatedBy !== "offline_mindtree_editorial_studio") issues.push("Unknown or missing package provenance.");
  if (!isObject(value.sourceArtifactDigests) || canonicalJson(value.sourceArtifactDigests) !== canonicalJson(MINDTREE_SOURCE_ARTIFACT_DIGESTS)) issues.push("Package source artifact pins do not match this tool version.");
  if (value.statusEffect !== "none" || value.learnerVisibilityEffect !== "none" || value.approvalEffect !== "none" || value.releaseAuthorization !== "not_granted") {
    issues.push("Package contains a contradictory status, learner-visibility, approval, or release-authorization effect.");
  }
  if (!Array.isArray(value.records) || !value.records.every(looksLikeRecord)) issues.push("Package records are malformed.");
  if (!isObject(value.artifactDigest) || value.artifactDigest.algorithm !== "SHA-256"
    || value.artifactDigest.covers !== "canonical JSON of all package fields except artifactDigest"
    || typeof value.artifactDigest.value !== "string" || !/^[a-f0-9]{64}$/u.test(value.artifactDigest.value)) {
    issues.push("Package digest metadata is malformed or unsupported.");
  }
  if (issues.length) return { valid: false, issues };

  const { artifactDigest, ...unsigned } = value as Record<string, unknown> & { artifactDigest: { value: string } };
  const recomputedDigest = await sha256Hex(canonicalJson(unsigned));
  if (recomputedDigest !== artifactDigest.value) issues.push("Package SHA-256 digest mismatch; package content was altered or corrupted.");

  const records = value.records as MindTreeMnemonicRecord[];
  if (!Array.isArray(value.revisionHistory)) issues.push("Revision history must be an array.");
  const rawHistory = Array.isArray(value.revisionHistory) ? value.revisionHistory : [];
  const validHistory: Array<{ recordId: string; revisions: MindTreeMnemonicRecord[] }> = [];
  const historyKeys = new Set<string>();
  for (const item of rawHistory) {
    if (!isObject(item) || Object.keys(item).some((key) => !["recordId", "revisions"].includes(key))
      || typeof item.recordId !== "string" || !Array.isArray(item.revisions) || !item.revisions.every(looksLikeRecord)) {
      issues.push("Revision history contains a malformed entry.");
      continue;
    }
    validHistory.push({ recordId: item.recordId, revisions: item.revisions as MindTreeMnemonicRecord[] });
    for (const revision of item.revisions as MindTreeMnemonicRecord[]) {
      const key = `${item.recordId}:${revision.version}`;
      if (revision.id !== item.recordId) issues.push(`Revision-history record ID mismatch for ${item.recordId}.`);
      if (historyKeys.has(key)) issues.push(`Duplicate revision-history version ${key}.`);
      historyKeys.add(key);
    }
  }
  issues.push(...await revisionHistoryIssues(records, validHistory));
  const validation = validateMnemonicRecords(records, options.supportedCharacters, options.visualAnnotations);
  if (!validation.valid) issues.push(...validation.issues.map((issue) => `Record validation: ${issue}`));
  if (records.some((record) => record.origin === "ai_candidate" && ["approved", "scheduled", "published"].includes(record.editorialStatus))) {
    issues.push("AI candidate is contradictory to its unpublished-only policy.");
  }
  if (!Array.isArray(value.reviewEvidence)) issues.push("Review evidence must be an array.");
  else {
    const history = validHistory;
    const seenEvidenceDigests = new Set<string>();
    const outcomesByRevision = new Map<string, Set<string>>();
    for (const raw of value.reviewEvidence) {
      const verified = await verifyLocalReviewEvidence(raw);
      if (!verified.valid || !verified.evidence) {
        issues.push(...verified.issues.map((issue) => `Review evidence: ${issue}`));
        continue;
      }
      if (seenEvidenceDigests.has(verified.evidence.evidenceDigest)) issues.push(`Duplicate review evidence ${verified.evidence.evidenceDigest}.`);
      seenEvidenceDigests.add(verified.evidence.evidenceDigest);
      const revisionKey = `${verified.evidence.recordId}:${verified.evidence.reviewedRevision.contentDigest}`;
      const revisionOutcomes = outcomesByRevision.get(revisionKey) ?? new Set<string>();
      revisionOutcomes.add(verified.evidence.outcome);
      outcomesByRevision.set(revisionKey, revisionOutcomes);
      if (revisionOutcomes.size > 1) issues.push(`Conflicting review outcomes for exact revision ${revisionKey}.`);
      if (!records.some((record) => record.id === verified.evidence!.recordId)) {
        issues.push(`Review evidence references absent record ${verified.evidence.recordId}.`);
        continue;
      }
      try { await assertEvidenceBindsToPackagedRevision(verified.evidence, records, history); }
      catch (error) { issues.push(error instanceof Error ? error.message : "Review evidence is not bound to a packaged revision."); }
    }
  }
  if (!Array.isArray(value.validationResults) || !Array.isArray(value.readinessResults)) issues.push("Validation/readiness results must be arrays.");
  else {
    const recordById = new Map(records.map((record) => [record.id, record]));
    const rows = value.validationResults;
    const rowIds = new Set<string>();
    if (rows.length !== records.length) issues.push("Validation rows do not correspond one-to-one with the packaged records.");
    for (const raw of rows) {
      if (!isObject(raw) || Object.keys(raw).some((key) => !["recordId", "character", "schemaValid", "schemaIssues", "findings"].includes(key))
        || typeof raw.recordId !== "string" || typeof raw.character !== "string" || typeof raw.schemaValid !== "boolean"
        || !Array.isArray(raw.schemaIssues) || !raw.schemaIssues.every((item) => typeof item === "string") || !Array.isArray(raw.findings)
        || !raw.findings.every((finding) => isObject(finding) && Object.keys(finding).every((key) => ["code", "severity", "field", "message", "humanDecisionRequired"].includes(key))
          && typeof finding.code === "string" && ["error", "warning", "info"].includes(String(finding.severity))
          && typeof finding.field === "string" && typeof finding.message === "string" && typeof finding.humanDecisionRequired === "boolean")) {
        issues.push("Validation result row is malformed or contains unknown fields.");
        continue;
      }
      if (rowIds.has(raw.recordId)) issues.push(`Duplicate validation result for ${raw.recordId}.`);
      rowIds.add(raw.recordId);
      const record = recordById.get(raw.recordId);
      if (!record || record.character !== raw.character) {
        issues.push(`Validation result does not match exported record ${raw.recordId}.`);
        continue;
      }
      const actual = validateMnemonicRecords([record], options.supportedCharacters, options.visualAnnotations);
      if (raw.schemaValid !== actual.valid || canonicalJson(raw.schemaIssues) !== canonicalJson(actual.issues)) {
        issues.push(`Schema-validation result for ${raw.recordId} does not match recomputed validation.`);
      }
    }
    for (const record of records) if (!rowIds.has(record.id)) issues.push(`Missing validation result for ${record.id}.`);
    for (const raw of value.readinessResults) {
      if (!isObject(raw) || Object.keys(raw).some((key) => !["recordId", "character", "currentContentDigest", "status", "reasons", "approvalEvidence", "releaseAuthorization"].includes(key))
        || (raw.recordId !== null && typeof raw.recordId !== "string") || typeof raw.character !== "string"
        || (raw.currentContentDigest !== null && (typeof raw.currentContentDigest !== "string" || !/^[a-f0-9]{64}$/u.test(raw.currentContentDigest)))
        || !["blocked", "awaiting_human_review", "changes_requested", "reviewed_not_approved", "stale_review"].includes(String(raw.status))
        || !Array.isArray(raw.reasons) || raw.reasons.some((item) => !isObject(item)
          || Object.keys(item).some((key) => !["code", "severity", "detail"].includes(key))
          || typeof item.code !== "string" || !/^[A-Z][A-Z0-9_]{2,80}$/u.test(item.code)
          || !["blocker", "warning", "information"].includes(String(item.severity))
          || typeof item.detail !== "string")
        || raw.approvalEvidence !== "not_supported" || raw.releaseAuthorization !== "not_granted") {
        issues.push("Readiness result is malformed or claims an unsupported authorization state.");
        continue;
      }
      if (raw.recordId === null) {
        if (raw.currentContentDigest !== null || raw.status !== "blocked") issues.push("A missing-record readiness result must be blocked with no revision digest.");
      } else {
        const record = recordById.get(raw.recordId);
        if (!record || record.character !== raw.character) {
          issues.push(`Readiness result does not match packaged record ${raw.recordId}.`);
          continue;
        }
        if (raw.currentContentDigest !== await digestMnemonicRevision(record)) issues.push(`Readiness digest does not match packaged record ${raw.recordId}.`);
      }
    }
  }
  if (value.exportKind === "proposed_human_review") {
    if (records.length !== 1 || !isObject(value.localReviewAnnotation) || Object.keys(value.localReviewAnnotation).some((key) => !["note", "identityVerified", "reviewerIdentity", "reviewedAt", "checklist"].includes(key))
      || typeof value.localReviewAnnotation.note !== "string" || value.localReviewAnnotation.identityVerified !== false
      || value.localReviewAnnotation.reviewerIdentity !== null || value.localReviewAnnotation.reviewedAt !== null
      || !Array.isArray(value.localReviewAnnotation.checklist)
      || value.localReviewAnnotation.checklist.some((item) => !isObject(item) || Object.keys(item).some((key) => !["question", "checked"].includes(key)) || typeof item.question !== "string" || typeof item.checked !== "boolean")) {
      issues.push("Proposed-review package must contain one record and explicitly unverified local annotation metadata.");
    }
  } else if (value.localReviewAnnotation !== undefined) {
    issues.push("Working package must not contain a review-only annotation section.");
  }

  return issues.length ? { valid: false, issues } : { valid: true, issues: [], package: value };
}
