import type { CmsStatus } from "@/services/cms/types";
import type { MindTreeMnemonicRecord } from "@/lib/kanji/mindtreeMnemonicContent";

export type MnemonicQualitySeverity = "error" | "warning" | "info";
export type MnemonicQualityCode =
  | "MISSING_MNEMONIC"
  | "MISSING_MEANING"
  | "UNSUPPORTED_COMPONENT_CUE"
  | "READING_NOT_IN_SOURCE"
  | "MISSING_PROVENANCE"
  | "MISSING_SOURCE_REFERENCES"
  | "CANDIDATE_NOT_REVIEWED"
  | "REVIEW_EVIDENCE_MISSING"
  | "POSSIBLE_ETYMOLOGY_CLAIM"
  | "MNEMONIC_TOO_LONG"
  | "KEYWORD_NOT_PRESENT"
  | "MISSING_VOCABULARY"
  | "NO_COMPONENT_ANNOTATIONS"
  | "NO_READINGS"
  | "HUMAN_CLARITY_REVIEW_REQUIRED"
  | "HUMAN_FACT_REVIEW_REQUIRED";

export interface MnemonicQualityFinding {
  code: MnemonicQualityCode;
  severity: MnemonicQualitySeverity;
  field: string;
  message: string;
  humanDecisionRequired: boolean;
}

export interface MnemonicQualityContext {
  character: string;
  meaning: string | null;
  dictionaryMeanings: string[];
  readingsOn: string[];
  readingsKun: string[];
  annotationLabels: string[];
  hasVisualSource: boolean;
  vocabularyCount: number;
}

export interface MnemonicCompleteness {
  hasMnemonic: boolean;
  hasMeaning: boolean;
  hasVisualSource: boolean;
  componentCueCount: number;
  availableAnnotationCount: number;
  hasReadings: boolean;
  hasReadingHook: boolean;
  vocabularyCount: number;
  origin: MindTreeMnemonicRecord["origin"] | null;
  editorialStatus: CmsStatus | null;
  reviewEvidencePresent: boolean;
  meaningRecallEligible: boolean;
  componentRecallEligible: boolean;
}

export interface MnemonicQualityAssessment {
  character: string;
  findings: MnemonicQualityFinding[];
  completeness: MnemonicCompleteness;
  schemaValid: boolean;
  schemaIssues: string[];
}

const ETYMOLOGY_PATTERN = /\b(etymolog\w*|historical(?:ly)?|originally|originates? from|derived from|comes? from|evolved? from|ancient(?:ly)?|radical means|phonetic(?:ally)? represents?)\b/iu;

function finding(
  code: MnemonicQualityCode,
  severity: MnemonicQualitySeverity,
  field: string,
  message: string,
  humanDecisionRequired = false,
): MnemonicQualityFinding {
  return { code, severity, field, message, humanDecisionRequired };
}

function norm(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function statusEvidenceComplete(record: MindTreeMnemonicRecord | null): boolean {
  return Boolean(record?.reviewerId?.trim() && record.reviewedAt && Number.isFinite(Date.parse(record.reviewedAt)));
}

/** Deterministic flags for editorial attention; findings never approve content. */
export function assessMnemonicQuality(
  record: MindTreeMnemonicRecord | null,
  context: MnemonicQualityContext,
): MnemonicQualityAssessment {
  const findings: MnemonicQualityFinding[] = [];
  const hasMeaning = Boolean(context.meaning?.trim() || context.dictionaryMeanings.some((item) => item.trim()));
  const hasReadings = context.readingsOn.length + context.readingsKun.length > 0;
  const reviewEvidencePresent = statusEvidenceComplete(record);

  if (!record) {
    findings.push(finding("MISSING_MNEMONIC", "warning", "story", "No mnemonic record exists for this supported character."));
  }
  if (!hasMeaning) findings.push(finding("MISSING_MEANING", "error", "meaning", "No primary meaning is available in the supplied facts."));
  if (!context.hasVisualSource) findings.push(finding("MISSING_PROVENANCE", "error", "visualSource", "No pinned visual-source record is available."));
  if (!hasReadings) findings.push(finding("NO_READINGS", "info", "readingHook", "No On/Kun readings are present for reading-hook review."));
  if (context.annotationLabels.length === 0) findings.push(finding("NO_COMPONENT_ANNOTATIONS", "info", "componentCues", "The pinned SVG has no nested component labels; do not infer a component."));
  if (context.vocabularyCount === 0) findings.push(finding("MISSING_VOCABULARY", "info", "vocabulary", "No first-party vocabulary examples are recorded; lexical lookup remains in the dictionary feature."));

  if (record) {
    if (!record.provenanceRef.trim()) findings.push(finding("MISSING_PROVENANCE", "error", "provenanceRef", "Origin provenance is required."));
    if (!record.sourceReferences.length || record.sourceReferences.some((ref) => !ref.trim())) findings.push(finding("MISSING_SOURCE_REFERENCES", "error", "sourceReferences", "At least one valid source/context reference is required."));
    for (const cue of record.componentCues) {
      if (!context.annotationLabels.includes(cue)) {
        findings.push(finding("UNSUPPORTED_COMPONENT_CUE", "warning", "componentCues", `“${cue}” is not an exact nested KanjiVG element label for ${context.character}. This does not assess any semantic claim.`, true));
      }
    }
    if (record.readingHook?.trim()) {
      const suppliedReadings = [...context.readingsOn, ...context.readingsKun].map(norm).filter(Boolean);
      const hook = norm(record.readingHook);
      if (!suppliedReadings.some((reading) => hook.includes(reading))) {
        findings.push(finding("READING_NOT_IN_SOURCE", "warning", "readingHook", "The reading hook contains no exact normalized reading from the supplied KANJIDIC2 fact set; check it manually.", true));
      }
    }
    if (record.origin === "ai_candidate" && !reviewEvidencePresent) {
      findings.push(finding("CANDIDATE_NOT_REVIEWED", "warning", "origin", "AI-origin content remains a candidate and cannot be promoted by this quality check."));
    }
    if (!reviewEvidencePresent) {
      findings.push(finding(
        "REVIEW_EVIDENCE_MISSING",
        ["approved", "scheduled", "published"].includes(record.editorialStatus) ? "error" : "info",
        "reviewerId/reviewedAt",
        "No reviewer identity and valid review date are recorded. Studio-entered names are not authenticated.",
        true,
      ));
    }
    if (ETYMOLOGY_PATTERN.test(record.story)) {
      findings.push(finding("POSSIBLE_ETYMOLOGY_CLAIM", "warning", "story", "Wording resembles a historical/etymological assertion. A human must decide whether to remove or substantiate it; the heuristic is not a factual verdict.", true));
    }
    if (record.story.length > 240) findings.push(finding("MNEMONIC_TOO_LONG", "warning", "story", `Story is ${record.story.length} characters; consider a shorter learner cue. This is a length check only.`));
    const keyword = norm(record.keyword);
    if (keyword.length >= 2 && !norm(record.story).includes(keyword)) {
      findings.push(finding("KEYWORD_NOT_PRESENT", "info", "keyword/story", "The exact normalized keyword is not present in the story. Synonyms and learner clarity require human judgment.", true));
    }
    findings.push(finding("HUMAN_CLARITY_REVIEW_REQUIRED", "info", "story", "A person must judge whether the story is comprehensible and useful for its intended learner.", true));
    findings.push(finding("HUMAN_FACT_REVIEW_REQUIRED", "info", "story/sourceReferences", "A person must verify factual claims and confirm that source references support only the claims attributed to them.", true));
  }

  const completeness: MnemonicCompleteness = {
    hasMnemonic: Boolean(record?.story.trim()),
    hasMeaning,
    hasVisualSource: context.hasVisualSource,
    componentCueCount: record?.componentCues.length ?? 0,
    availableAnnotationCount: context.annotationLabels.length,
    hasReadings,
    hasReadingHook: Boolean(record?.readingHook?.trim()),
    vocabularyCount: context.vocabularyCount,
    origin: record?.origin ?? null,
    editorialStatus: record?.editorialStatus ?? null,
    reviewEvidencePresent,
    meaningRecallEligible: hasMeaning,
    componentRecallEligible: context.annotationLabels.length > 0,
  };
  const schemaIssues: string[] = [];
  if (record && record.schemaVersion !== "nihongobridge-kanji-mnemonic@2") schemaIssues.push("Unsupported schema version.");
  if (record && (!record.story.trim() || record.story.length > 600)) schemaIssues.push("Story must contain 1–600 characters.");
  if (record && (!record.keyword.trim() || record.keyword.length > 120)) schemaIssues.push("Keyword must contain 1–120 characters.");
  if (record && record.origin === "ai_candidate" && ["approved", "scheduled", "published"].includes(record.editorialStatus)) schemaIssues.push("AI candidate cannot be approved, scheduled, or published.");
  if (record && ["approved", "scheduled", "published"].includes(record.editorialStatus) && !reviewEvidencePresent) schemaIssues.push("Approval status requires reviewer identity and review date evidence.");
  if (record?.editorialStatus === "published" && (!record.publishedAt || !Number.isFinite(Date.parse(record.publishedAt)))) schemaIssues.push("Published status requires a valid publication date.");
  return { character: context.character, findings, completeness, schemaValid: schemaIssues.length === 0, schemaIssues };
}
