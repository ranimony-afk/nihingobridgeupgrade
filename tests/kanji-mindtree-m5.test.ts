import { describe, expect, it } from "vitest";
import { getMindTreeEntry, listMindTreeEditorialContext } from "../src/lib/kanji/kanjiMindtreeCatalog";
import {
  MINDTREE_MNEMONIC_RECORDS,
  type MindTreeMnemonicRecord,
} from "../src/lib/kanji/mindtreeMnemonicContent";
import { buildMnemonicExportPackage, type MnemonicExportValidationRow } from "../src/lib/kanji/mindtreeMnemonicExport";
import { assessMnemonicQuality } from "../src/lib/kanji/mindtreeMnemonicQuality";
import { cancelLocalMnemonicRevision, compareMnemonicRevisions, saveLocalMnemonicRevision } from "../src/lib/kanji/mindtreeMnemonicRevisions";
import { INITIAL_MINDTREE_JOURNEY_STATE, MINDTREE_JOURNEY_STAGES, mindTreeJourneyReducer, segmentMnemonicStory } from "../src/lib/kanji/mindtreeLearningJourney";

const contexts = listMindTreeEditorialContext();
const supportedCharacters = new Set(contexts.map((item) => item.character));
const visualAnnotations = new Map(contexts.map((item) => [item.character, new Set(item.annotations.map((annotation) => annotation.label))]));
const contextFor = (character: string) => contexts.find((context) => context.character === character)!;

function qualityRow(record: MindTreeMnemonicRecord): MnemonicExportValidationRow {
  const context = contextFor(record.character);
  const assessment = assessMnemonicQuality(record, {
    character: context.character,
    meaning: context.meaning,
    dictionaryMeanings: context.dictionaryMeanings,
    readingsOn: context.readingsOn,
    readingsKun: context.readingsKun,
    annotationLabels: context.annotations.map((annotation) => annotation.label),
    hasVisualSource: Boolean(context.visualSourceSha256),
    vocabularyCount: context.firstPartyVocabularyCount,
  });
  return {
    recordId: record.id,
    character: record.character,
    schemaValid: assessment.schemaValid,
    schemaIssues: assessment.schemaIssues,
    findings: assessment.findings,
  };
}

describe("Kanji MindTree M5 editorial quality and learning refinements", () => {
  it("reports deterministic human-review prompts without treating them as approval", () => {
    const candidate = MINDTREE_MNEMONIC_RECORDS.find((record) => record.origin === "ai_candidate")!;
    const context = contextFor(candidate.character);
    const assessment = assessMnemonicQuality(candidate, {
      character: context.character,
      meaning: context.meaning,
      dictionaryMeanings: context.dictionaryMeanings,
      readingsOn: context.readingsOn,
      readingsKun: context.readingsKun,
      annotationLabels: context.annotations.map((annotation) => annotation.label),
      hasVisualSource: Boolean(context.visualSourceSha256),
      vocabularyCount: context.firstPartyVocabularyCount,
    });
    expect(assessment.findings.map((item) => item.code)).toContain("CANDIDATE_NOT_REVIEWED");
    expect(assessment.findings.some((item) => item.humanDecisionRequired)).toBe(true);
    expect(assessment.completeness).toMatchObject({ origin: "ai_candidate", editorialStatus: "draft", reviewEvidencePresent: false });
    expect(assessment).not.toHaveProperty("approved");

    const firstParty = MINDTREE_MNEMONIC_RECORDS.find((record) => record.origin === "first_party")!;
    const firstPartyContext = contextFor(firstParty.character);
    const firstPartyAssessment = assessMnemonicQuality(firstParty, {
      character: firstPartyContext.character,
      meaning: firstPartyContext.meaning,
      dictionaryMeanings: firstPartyContext.dictionaryMeanings,
      readingsOn: firstPartyContext.readingsOn,
      readingsKun: firstPartyContext.readingsKun,
      annotationLabels: firstPartyContext.annotations.map((annotation) => annotation.label),
      hasVisualSource: Boolean(firstPartyContext.visualSourceSha256),
      vocabularyCount: firstPartyContext.firstPartyVocabularyCount,
    });
    expect(firstParty.origin).toBe("first_party");
    expect(firstPartyAssessment.completeness.editorialStatus).toBe("draft");
    expect(firstPartyAssessment.findings.map((item) => item.code)).toEqual(expect.arrayContaining(["HUMAN_CLARITY_REVIEW_REQUIRED", "HUMAN_FACT_REVIEW_REQUIRED", "REVIEW_EVIDENCE_MISSING"]));

    const missing = assessMnemonicQuality(null, {
      character: "明", meaning: null, dictionaryMeanings: [], readingsOn: [], readingsKun: [],
      annotationLabels: [], hasVisualSource: false, vocabularyCount: 0,
    });
    expect(missing.findings.map((item) => item.code)).toEqual(expect.arrayContaining(["MISSING_MNEMONIC", "MISSING_MEANING", "MISSING_PROVENANCE", "NO_READINGS", "MISSING_VOCABULARY"]));
  });

  it("builds byte-stable versioned packages and digest without changing records or states", async () => {
    const workingBefore = JSON.stringify(MINDTREE_MNEMONIC_RECORDS);
    const rows = MINDTREE_MNEMONIC_RECORDS.map(qualityRow);
    const first = await buildMnemonicExportPackage({
      kind: "draft_working", records: MINDTREE_MNEMONIC_RECORDS, supportedCharacters,
      visualAnnotations, validationResults: rows,
    });
    const second = await buildMnemonicExportPackage({
      kind: "draft_working", records: [...MINDTREE_MNEMONIC_RECORDS].reverse(), supportedCharacters,
      visualAnnotations, validationResults: [...rows].reverse(),
    });
    expect(first).toBe(second);
    const parsed = JSON.parse(first) as { schemaVersion: string; exportKind: string; artifactDigest: { algorithm: string; value: string }; statusEffect: string; learnerVisibilityEffect: string; approvalEffect: string; releaseAuthorization: string; records: MindTreeMnemonicRecord[] };
    expect(parsed).toMatchObject({ schemaVersion: "nihongobridge-kanji-mnemonic-export@2", exportKind: "draft_working", statusEffect: "none", learnerVisibilityEffect: "none", approvalEffect: "none", releaseAuthorization: "not_granted", artifactDigest: { algorithm: "SHA-256" } });
    expect(parsed.artifactDigest.value).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.records.some((record) => record.origin === "ai_candidate" && record.editorialStatus === "draft")).toBe(true);
    expect(JSON.stringify(MINDTREE_MNEMONIC_RECORDS)).toBe(workingBefore);
  });

  it("keeps proposed review notes explicitly unverified and rejects candidate-only release packages", async () => {
    const candidate = MINDTREE_MNEMONIC_RECORDS.find((record) => record.origin === "ai_candidate")!;
    const proposal = await buildMnemonicExportPackage({
      kind: "proposed_human_review", records: [candidate], supportedCharacters, visualAnnotations,
      validationResults: [qualityRow(candidate)],
      reviewAnnotation: { note: "Check factual separation", identityVerified: false, checklist: [{ question: "Check source claims", checked: false }] },
    });
    expect(JSON.parse(proposal)).toMatchObject({
      exportKind: "proposed_human_review",
      localReviewAnnotation: { identityVerified: false, reviewerIdentity: null, reviewedAt: null, note: "Check factual separation" },
    });
    await expect(buildMnemonicExportPackage({
      kind: "approved_release_candidate", records: [candidate], supportedCharacters, visualAnnotations,
      validationResults: [qualityRow(candidate)],
    })).rejects.toThrow(/no authenticated approval or release-authorization evidence model/);
  });

  it("compares local edits and restores or removes them on cancel", () => {
    const record = MINDTREE_MNEMONIC_RECORDS.find((item) => item.origin === "first_party")!;
    const changed = { ...record, story: `${record.story} Revised locally.` };
    expect(compareMnemonicRevisions(record, changed)).toContainEqual(expect.objectContaining({ field: "story", before: record.story, after: changed.story }));
    const saved = saveLocalMnemonicRevision(changed, record);
    expect(saved.version).toBe(record.version + 1);
    expect(cancelLocalMnemonicRevision([changed], record.id, record)).toEqual([record]);
    const newDraft = { ...record, id: "local-new-draft" };
    expect(cancelLocalMnemonicRevision([newDraft], newDraft.id, null)).toEqual([]);
  });

  it("keeps drafts hidden, distinguishes missing and unsupported characters, and supports recall then Explore", () => {
    expect(getMindTreeEntry("一")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("人")).toMatchObject({ mnemonic: null, mnemonicAvailability: "missing" });
    expect(getMindTreeEntry("龍")).toBeNull();
    expect(MINDTREE_JOURNEY_STAGES).toEqual(["Observe", "Break down", "Associate", "Remember", "Recall", "Explore"]);
    expect(segmentMnemonicStory("Cue one. Cue two!" )).toEqual(["Cue one.", "Cue two!"]);

    const recalled = mindTreeJourneyReducer(INITIAL_MINDTREE_JOURNEY_STATE, { type: "set-stage", stage: "Recall" });
    const answer = mindTreeJourneyReducer(recalled, { type: "reveal-answer" });
    expect(answer.answerVisible).toBe(true);
    const explored = mindTreeJourneyReducer(answer, { type: "advance-stage" });
    expect(explored.stage).toBe("Explore");
    expect(explored.answerVisible).toBe(true);
  });
});
