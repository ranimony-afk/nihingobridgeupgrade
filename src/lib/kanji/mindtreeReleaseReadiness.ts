import { assessMnemonicQuality, type MnemonicQualityContext } from "@/lib/kanji/mindtreeMnemonicQuality";
import { validateMnemonicRecords, type MindTreeMnemonicRecord } from "@/lib/kanji/mindtreeMnemonicContent";
import { digestMnemonicRevision, verifyLocalReviewEvidence, type MindTreeEditorialReviewEvidence } from "@/lib/kanji/mindtreeEditorialEvidence";

export type MindTreeReadinessStatus =
  | "blocked"
  | "awaiting_human_review"
  | "changes_requested"
  | "reviewed_not_approved"
  | "stale_review"
  | "eligible_for_separate_release_review";

export type MindTreeReadinessReasonCode =
  | "MISSING_MNEMONIC_RECORD"
  | "RECORD_SCHEMA_INVALID"
  | "QUALITY_SCHEMA_INVALID"
  | "GENERIC_FIRST_PARTY_PROVENANCE"
  | "AI_ORIGIN_CANNOT_BE_RELABELED"
  | "AI_REVISION_HISTORY_INCOMPLETE"
  | "SOURCE_REFERENCES_ARE_CONTEXT_ONLY"
  | "QUALITY_FINDING"
  | "HUMAN_REVIEW_ABSENT"
  | "REVIEW_EVIDENCE_INVALID"
  | "REVIEW_EVIDENCE_DUPLICATED"
  | "REVIEW_DECISIONS_CONFLICT"
  | "REVIEW_EVIDENCE_STALE"
  | "REVIEW_CHANGES_REQUESTED"
  | "REVIEW_REJECTED"
  | "REVIEWER_IDENTITY_UNVERIFIED"
  | "REVIEW_TIMESTAMP_UNAVAILABLE"
  | "APPROVAL_EVIDENCE_ABSENT"
  | "LEGACY_STATUS_IS_NOT_APPROVAL_EVIDENCE"
  | "RELEASE_AUTHORIZATION_ABSENT"
  | "AUTOMATED_CHECKS_DO_NOT_ESTABLISH_LANGUAGE_CORRECTNESS";

export interface MindTreeReadinessReason {
  code: MindTreeReadinessReasonCode;
  severity: "blocker" | "warning" | "information";
  detail: string;
}

export interface MindTreeReadinessResult {
  recordId: string | null;
  character: string;
  currentContentDigest: string | null;
  status: MindTreeReadinessStatus;
  reasons: MindTreeReadinessReason[];
  approvalEvidence: "not_supported";
  releaseAuthorization: "not_granted";
}

const BLOCKING_CODES = new Set<MindTreeReadinessReasonCode>([
  "MISSING_MNEMONIC_RECORD", "RECORD_SCHEMA_INVALID", "QUALITY_SCHEMA_INVALID",
  "GENERIC_FIRST_PARTY_PROVENANCE", "REVIEW_EVIDENCE_INVALID", "REVIEW_EVIDENCE_DUPLICATED",
  "REVIEW_DECISIONS_CONFLICT", "REVIEW_REJECTED",
]);

function reason(code: MindTreeReadinessReasonCode, detail: string, severity?: MindTreeReadinessReason["severity"]): MindTreeReadinessReason {
  return { code, detail, severity: severity ?? (BLOCKING_CODES.has(code) ? "blocker" : "information") };
}

function uniqueReasons(reasons: MindTreeReadinessReason[]): MindTreeReadinessReason[] {
  const byKey = new Map<string, MindTreeReadinessReason>();
  for (const item of reasons) byKey.set(`${item.code}\u0000${item.detail}`, item);
  return [...byKey.values()].sort((left, right) => left.code.localeCompare(right.code) || left.detail.localeCompare(right.detail));
}

/**
 * Fail-closed, local readiness assessment. It never grants approval or release
 * authorization. Local reviewer attribution remains unverified; consequently
 * eligible_for_separate_release_review is intentionally unreachable here.
 */
export async function evaluateMindTreeReadiness(input: {
  record: MindTreeMnemonicRecord | null;
  character: string;
  context: MnemonicQualityContext;
  reviewEvidence: readonly unknown[];
  supportedCharacters?: ReadonlySet<string>;
  visualAnnotations?: ReadonlyMap<string, ReadonlySet<string>>;
}): Promise<MindTreeReadinessResult> {
  const { record, character } = input;
  const reasons: MindTreeReadinessReason[] = [
    reason("RELEASE_AUTHORIZATION_ABSENT", "This local evaluator has no release-authorization model or authority.", "information"),
    reason("AUTOMATED_CHECKS_DO_NOT_ESTABLISH_LANGUAGE_CORRECTNESS", "No schema, digest, or heuristic result establishes Japanese accuracy, etymology, or pedagogical effectiveness.", "warning"),
  ];
  if (!record) {
    reasons.push(reason("MISSING_MNEMONIC_RECORD", "There is no mnemonic record to review; no text or origin is inferred."));
    return {
      recordId: null, character, currentContentDigest: null, status: "blocked", reasons: uniqueReasons(reasons),
      approvalEvidence: "not_supported", releaseAuthorization: "not_granted",
    };
  }

  let currentContentDigest: string;
  try {
    currentContentDigest = await digestMnemonicRevision(record);
  } catch (error) {
    reasons.push(reason("RECORD_SCHEMA_INVALID", error instanceof Error ? error.message : "Unable to digest current record."));
    return {
      recordId: record.id, character, currentContentDigest: null, status: "blocked", reasons: uniqueReasons(reasons),
      approvalEvidence: "not_supported", releaseAuthorization: "not_granted",
    };
  }

  const characterSet = input.supportedCharacters ?? new Set([character]);
  const annotationMap = input.visualAnnotations ?? new Map([[character, new Set(input.context.annotationLabels)]]);
  const schema = validateMnemonicRecords([record], characterSet, annotationMap);
  if (!schema.valid) reasons.push(reason("RECORD_SCHEMA_INVALID", schema.issues.join("; ")));
  const quality = assessMnemonicQuality(record, input.context);
  if (!quality.schemaValid) reasons.push(reason("QUALITY_SCHEMA_INVALID", quality.schemaIssues.join("; ")));
  for (const finding of quality.findings) {
    reasons.push(reason(
      "QUALITY_FINDING",
      `${finding.code} (${finding.severity}, ${finding.field}): ${finding.message}`,
      finding.severity === "error" ? "blocker" : finding.severity === "warning" ? "warning" : "information",
    ));
  }

  if (record.origin === "first_party" && record.sourceReferences.length === 1 && record.sourceReferences[0] === record.provenanceRef) {
    reasons.push(reason("GENERIC_FIRST_PARTY_PROVENANCE", "The record points only to the generic first-party seed identifier; individual authorship/revision evidence is not recorded."));
  }
  if (record.origin === "ai_candidate") {
    reasons.push(reason("AI_ORIGIN_CANNOT_BE_RELABELED", "AI-origin content remains an unpublished candidate; a positive review cannot change its origin or make it learner-visible.", "warning"));
    reasons.push(reason("SOURCE_REFERENCES_ARE_CONTEXT_ONLY", "KanjiVG/KANJIDIC2 references describe the context considered, not the origin or factual support of the generated story.", "warning"));
    if (record.id === "m4-ai-otoko" || record.id === "m4-ai-hashi") {
      reasons.push(reason("AI_REVISION_HISTORY_INCOMPLETE", "The carry-forward is identified as AI-revised, but its source revision history and editing provenance are not represented in the record."));
    }
  }
  if (["approved", "scheduled", "published"].includes(record.editorialStatus)) {
    reasons.push(reason("LEGACY_STATUS_IS_NOT_APPROVAL_EVIDENCE", `The legacy CMS status ${record.editorialStatus} is not an M6 review or release attestation.`, "blocker"));
  }
  reasons.push(reason("APPROVAL_EVIDENCE_ABSENT", "M6 does not implement authenticated approval evidence; a review outcome cannot act as approval.", "information"));

  const verified: MindTreeEditorialReviewEvidence[] = [];
  let invalidEvidence = false;
  for (const raw of input.reviewEvidence) {
    const result = await verifyLocalReviewEvidence(raw);
    if (!result.valid || !result.evidence) {
      invalidEvidence = true;
      reasons.push(reason("REVIEW_EVIDENCE_INVALID", result.issues.join("; ")));
    } else if (result.evidence.recordId !== record.id) {
      invalidEvidence = true;
      reasons.push(reason("REVIEW_EVIDENCE_INVALID", `Evidence record ID ${result.evidence.recordId} does not match selected record ${record.id}.`));
    } else {
      verified.push(result.evidence);
    }
  }
  const digestCounts = new Map<string, number>();
  for (const item of verified) digestCounts.set(item.evidenceDigest, (digestCounts.get(item.evidenceDigest) ?? 0) + 1);
  if ([...digestCounts.values()].some((count) => count > 1)) reasons.push(reason("REVIEW_EVIDENCE_DUPLICATED", "Byte-identical review evidence appears more than once."));

  const onCurrentRevision = verified.filter((item) => item.reviewedRevision.version === record.version
    && item.reviewedRevision.contentDigest === currentContentDigest);
  const staleReviews = verified.filter((item) => item.reviewedRevision.version !== record.version
    || item.reviewedRevision.contentDigest !== currentContentDigest);
  if (staleReviews.length && !onCurrentRevision.length) {
    reasons.push(reason("REVIEW_EVIDENCE_STALE", `${staleReviews.length} verified review event(s) bind to a different content digest or version than current v${record.version}.`));
  } else if (staleReviews.length) {
    reasons.push(reason("REVIEW_EVIDENCE_STALE", `${staleReviews.length} older review event(s) are stale; a separate event matches current v${record.version} and its digest.`, "warning"));
  }

  if (verified.length) {
    reasons.push(reason("REVIEWER_IDENTITY_UNVERIFIED", "Review evidence contains local attribution only and cannot establish identity, role, or authority.", "warning"));
    reasons.push(reason("REVIEW_TIMESTAMP_UNAVAILABLE", "No trustworthy timestamp source is available in this offline browser-only studio.", "warning"));
  }
  const distinctOutcomes = new Set(onCurrentRevision.map((item) => item.outcome));
  if (distinctOutcomes.size > 1) reasons.push(reason("REVIEW_DECISIONS_CONFLICT", "Multiple different outcomes are recorded for the same exact revision; resolve the conflict with an explicit new review event."));

  let status: MindTreeReadinessStatus;
  if (reasons.some((item) => item.severity === "blocker") || invalidEvidence) {
    status = "blocked";
  } else if (staleReviews.length && !onCurrentRevision.length) {
    status = "stale_review";
  } else if (onCurrentRevision.some((item) => item.outcome === "rejected")) {
    reasons.push(reason("REVIEW_REJECTED", "The current revision has an explicit rejected decision."));
    status = "blocked";
  } else if (onCurrentRevision.some((item) => item.outcome === "changes_requested")) {
    reasons.push(reason("REVIEW_CHANGES_REQUESTED", "The current revision has an explicit changes-requested decision."));
    status = "changes_requested";
  } else if (onCurrentRevision.some((item) => item.outcome === "accepted")) {
    status = "reviewed_not_approved";
  } else {
    reasons.push(reason("HUMAN_REVIEW_ABSENT", "No verified review event matches the exact current content digest."));
    status = "awaiting_human_review";
  }

  return {
    recordId: record.id,
    character,
    currentContentDigest,
    status,
    reasons: uniqueReasons(reasons),
    approvalEvidence: "not_supported",
    releaseAuthorization: "not_granted",
  };
}
