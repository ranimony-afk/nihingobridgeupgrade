import { describe, expect, it } from "vitest";
import { getMindTreeEntry, listMindTreeEditorialContext } from "../src/lib/kanji/kanjiMindtreeCatalog";
import { getMnemonicAvailabilityForRecord, getMnemonicRecord, getPublishedMnemonic, MINDTREE_MNEMONIC_RECORDS, type MindTreeMnemonicRecord } from "../src/lib/kanji/mindtreeMnemonicContent";
import { canonicalJson, createLocalReviewEvidence, digestMnemonicRevision, sha256Hex, verifyLocalReviewEvidence } from "../src/lib/kanji/mindtreeEditorialEvidence";
import { MINDTREE_M6_PILOT_CASES } from "../src/lib/kanji/mindtreeEditorialPilot";
import { evaluateMindTreeReadiness } from "../src/lib/kanji/mindtreeReleaseReadiness";
import { buildMnemonicExportPackage, verifyMnemonicExportPackage, type MnemonicExportValidationRow } from "../src/lib/kanji/mindtreeMnemonicExport";
import { assessMnemonicQuality } from "../src/lib/kanji/mindtreeMnemonicQuality";

const contexts = listMindTreeEditorialContext();
const supportedCharacters = new Set(contexts.map((item) => item.character));
const visualAnnotations = new Map(contexts.map((item) => [item.character, new Set(item.annotations.map((annotation) => annotation.label))]));
const contextFor = (character: string) => contexts.find((context) => context.character === character)!;

function qualityContext(character: string) {
  const context = contextFor(character);
  return {
    character,
    meaning: context.meaning,
    dictionaryMeanings: context.dictionaryMeanings,
    readingsOn: context.readingsOn,
    readingsKun: context.readingsKun,
    annotationLabels: context.annotations.map((annotation) => annotation.label),
    hasVisualSource: Boolean(context.visualSourceSha256),
    vocabularyCount: context.firstPartyVocabularyCount,
  };
}

function completeEditorialFixture(): MindTreeMnemonicRecord {
  const source = MINDTREE_MNEMONIC_RECORDS.find((record) => record.character === "明")!;
  return {
    ...source,
    id: "synthetic-m6-editorial-review-fixture",
    version: 1,
    origin: "editorial",
    editorialStatus: "draft",
    provenanceRef: "synthetic:editorial-origin-fixture@1",
    sourceReferences: ["synthetic:human-provided-claim-evidence@1"],
    reviewerId: undefined,
    reviewedAt: undefined,
    publishedAt: undefined,
  };
}

function validationRow(record: MindTreeMnemonicRecord): MnemonicExportValidationRow {
  const q = assessMnemonicQuality(record, qualityContext(record.character));
  return {
    recordId: record.id,
    character: record.character,
    schemaValid: q.schemaValid,
    schemaIssues: q.schemaIssues,
    findings: q.findings,
  };
}

async function resignPackage(input: Record<string, unknown>) {
  const { artifactDigest: _discarded, ...unsigned } = input;
  return {
    ...unsigned,
    artifactDigest: {
      algorithm: "SHA-256",
      covers: "canonical JSON of all package fields except artifactDigest",
      value: await sha256Hex(canonicalJson(unsigned)),
    },
  };
}

describe("Kanji MindTree M6 bounded human-review pilot", () => {
  it("selects only inspected fixed-slice cases and does not invent a competing revision", () => {
    expect(MINDTREE_M6_PILOT_CASES.map((item) => [item.character, item.recordId])).toEqual([
      ["明", "first-party-660e"], ["休", "first-party-4f11"], ["一", "m4-ai-4e00"], ["男", "m4-ai-otoko"], ["人", null],
    ]);
    expect(MINDTREE_MNEMONIC_RECORDS).toHaveLength(75);
    expect(new Set(MINDTREE_MNEMONIC_RECORDS.map((record) => record.id)).size).toBe(75);
    expect(MINDTREE_MNEMONIC_RECORDS.every((record) => record.editorialStatus === "draft")).toBe(true);
    expect(MINDTREE_MNEMONIC_RECORDS.every((record) => !record.reviewerId && !record.reviewedAt && !record.publishedAt)).toBe(true);
    expect(MINDTREE_MNEMONIC_RECORDS.filter((record) => record.origin === "first_party" && record.sourceReferences.length === 1 && record.sourceReferences[0] === record.provenanceRef)).toHaveLength(31);
    expect(MINDTREE_MNEMONIC_RECORDS.some((record) => record.character === "人")).toBe(false);
    expect(MINDTREE_MNEMONIC_RECORDS.some((record) => record.version > 1)).toBe(false);
    expect(getMnemonicRecord("男")).toMatchObject({ origin: "ai_candidate", editorialStatus: "draft" });
  });

  it("does not equate legacy published metadata with release authorization or learner visibility", () => {
    const draft = getMnemonicRecord("明")!;
    const legacyPublished = {
      ...draft,
      editorialStatus: "published" as const,
      reviewerId: "local-string-only",
      reviewedAt: "2026-10-29T00:00:00.000Z",
      publishedAt: "2026-10-29T00:00:00.000Z",
    };
    expect(getMnemonicAvailabilityForRecord(legacyPublished)).toBe("release-authorization-missing");
    expect(getPublishedMnemonic("明")).toBeNull();
  });

  it("records strict local evidence against exact content and labels identity/time limitations", async () => {
    const record = completeEditorialFixture();
    const evidence = await createLocalReviewEvidence(record, {
      outcome: "accepted",
      reviewerAttribution: "local operator supplied for test",
      notes: "Synthetic fixture only; no human review is claimed.",
      issueReferences: ["issue:synthetic-1"],
      provenanceConcerns: ["source:synthetic-origin-unverified"],
    });
    expect(evidence).toMatchObject({
      schemaVersion: "nihongobridge-mindtree-editorial-review@1",
      evidenceFormatVersion: 1,
      recordId: record.id,
      reviewedRevision: { version: record.version, digestAlgorithm: "SHA-256" },
      outcome: "accepted",
      identityTrust: "unverified_local_attribution",
      reviewedAt: null,
      timestampTrust: "unavailable",
    });
    expect(evidence.reviewedRevision.contentDigest).toBe(await digestMnemonicRevision(record));
    expect((await verifyLocalReviewEvidence(evidence)).valid).toBe(true);
    expect(await digestMnemonicRevision({ ...record, story: `${record.story} changed` })).not.toBe(evidence.reviewedRevision.contentDigest);
    expect(await digestMnemonicRevision({ ...record, origin: "ai_candidate" })).not.toBe(evidence.reviewedRevision.contentDigest);
    expect(await digestMnemonicRevision({ ...record, version: record.version + 1 })).not.toBe(evidence.reviewedRevision.contentDigest);

    const tampered = { ...evidence, outcome: "rejected" as const };
    expect(await verifyLocalReviewEvidence(tampered)).toMatchObject({ valid: false, issues: [expect.stringMatching(/digest mismatch/)] });
    expect(await verifyLocalReviewEvidence({ ...evidence, schemaVersion: "future-review@9" })).toMatchObject({ valid: false });
    await expect(createLocalReviewEvidence(record, {
      outcome: "accepted", reviewerAttribution: " ", notes: "", issueReferences: [], provenanceConcerns: [],
    })).rejects.toThrow(/local reviewer attribution/);
  });

  it("fails closed across pending, accepted, changes-requested, rejected, stale, duplicate, conflict, and missing cases", async () => {
    const record = completeEditorialFixture();
    const context = qualityContext(record.character);
    const base = { record, character: record.character, context, supportedCharacters, visualAnnotations };
    const pending = await evaluateMindTreeReadiness({ ...base, reviewEvidence: [] });
    expect(pending.status).toBe("awaiting_human_review");
    expect(pending.reasons.map((item) => item.code)).toContain("HUMAN_REVIEW_ABSENT");
    expect(pending.releaseAuthorization).toBe("not_granted");

    const accepted = await createLocalReviewEvidence(record, { outcome: "accepted", reviewerAttribution: "synthetic operator", notes: "", issueReferences: [], provenanceConcerns: [] });
    const reviewed = await evaluateMindTreeReadiness({ ...base, reviewEvidence: [accepted] });
    expect(reviewed.status).toBe("reviewed_not_approved");
    expect(reviewed.reasons.map((item) => item.code)).toEqual(expect.arrayContaining(["REVIEWER_IDENTITY_UNVERIFIED", "REVIEW_TIMESTAMP_UNAVAILABLE", "APPROVAL_EVIDENCE_ABSENT", "RELEASE_AUTHORIZATION_ABSENT"]));

    const changes = await createLocalReviewEvidence(record, { outcome: "changes_requested", reviewerAttribution: "synthetic operator", notes: "", issueReferences: ["fixture"], provenanceConcerns: [] });
    expect((await evaluateMindTreeReadiness({ ...base, reviewEvidence: [changes] })).status).toBe("changes_requested");
    const rejected = await createLocalReviewEvidence(record, { outcome: "rejected", reviewerAttribution: "synthetic operator", notes: "", issueReferences: [], provenanceConcerns: [] });
    expect((await evaluateMindTreeReadiness({ ...base, reviewEvidence: [rejected] })).status).toBe("blocked");

    const edited = { ...record, story: `${record.story} local edit` };
    const stale = await evaluateMindTreeReadiness({ ...base, record: edited, reviewEvidence: [accepted] });
    expect(stale.status).toBe("stale_review");
    expect(stale.reasons.map((item) => item.code)).toContain("REVIEW_EVIDENCE_STALE");

    const duplicate = await evaluateMindTreeReadiness({ ...base, reviewEvidence: [accepted, accepted] });
    expect(duplicate.status).toBe("blocked");
    expect(duplicate.reasons.map((item) => item.code)).toContain("REVIEW_EVIDENCE_DUPLICATED");
    const conflict = await evaluateMindTreeReadiness({ ...base, reviewEvidence: [accepted, rejected] });
    expect(conflict.status).toBe("blocked");
    expect(conflict.reasons.map((item) => item.code)).toContain("REVIEW_DECISIONS_CONFLICT");
    const malformed = await evaluateMindTreeReadiness({ ...base, reviewEvidence: [{ ...accepted, notes: "tampered" }] });
    expect(malformed.status).toBe("blocked");
    expect(malformed.reasons.map((item) => item.code)).toContain("REVIEW_EVIDENCE_INVALID");

    const missing = await evaluateMindTreeReadiness({ record: null, character: "人", context: qualityContext("人"), reviewEvidence: [] });
    expect(missing.status).toBe("blocked");
    expect(missing.reasons.map((item) => item.code)).toContain("MISSING_MNEMONIC_RECORD");

    const genericFirstParty = MINDTREE_MNEMONIC_RECORDS.find((item) => item.character === "休")!;
    const generic = await evaluateMindTreeReadiness({ record: genericFirstParty, character: "休", context: qualityContext("休"), reviewEvidence: [], supportedCharacters, visualAnnotations });
    expect(generic.status).toBe("blocked");
    expect(generic.reasons.map((item) => item.code)).toContain("GENERIC_FIRST_PARTY_PROVENANCE");

    const candidate = getMnemonicRecord("一")!;
    const candidatePending = await evaluateMindTreeReadiness({ record: candidate, character: "一", context: qualityContext("一"), reviewEvidence: [], supportedCharacters, visualAnnotations });
    expect(candidatePending.status).toBe("awaiting_human_review");
    expect(candidatePending.reasons.map((item) => item.code)).toContain("AI_ORIGIN_CANNOT_BE_RELABELED");
    const candidateAccepted = await createLocalReviewEvidence(candidate, { outcome: "accepted", reviewerAttribution: "synthetic operator", notes: "", issueReferences: [], provenanceConcerns: [] });
    expect((await evaluateMindTreeReadiness({ record: candidate, character: "一", context: qualityContext("一"), reviewEvidence: [candidateAccepted], supportedCharacters, visualAnnotations })).status).toBe("reviewed_not_approved");
  });

  it("exports evidence in a deterministic v2 envelope and detects digest, schema, and state tampering", async () => {
    const record = completeEditorialFixture();
    const evidence = await createLocalReviewEvidence(record, { outcome: "changes_requested", reviewerAttribution: "synthetic operator", notes: "Synthetic fixture", issueReferences: [], provenanceConcerns: [] });
    const options = {
      kind: "proposed_human_review" as const,
      records: [record],
      supportedCharacters,
      visualAnnotations,
      validationResults: [validationRow(record)],
      revisionHistory: [{ recordId: record.id, revisions: [record] }],
      reviewEvidence: [evidence],
      readinessResults: [await evaluateMindTreeReadiness({ record, character: record.character, context: qualityContext(record.character), reviewEvidence: [evidence], supportedCharacters, visualAnnotations })],
      reviewAnnotation: { note: "Unverified local note", identityVerified: false as const, checklist: [{ question: "Synthetic", checked: false }] },
    };
    const forward = await buildMnemonicExportPackage(options);
    const reversed = await buildMnemonicExportPackage({ ...options, records: [...options.records].reverse(), validationResults: [...options.validationResults].reverse(), reviewEvidence: [...options.reviewEvidence].reverse() });
    expect(forward).toBe(reversed);
    const packageObject = JSON.parse(forward) as Record<string, unknown>;
    expect(packageObject).toMatchObject({ schemaVersion: "nihongobridge-kanji-mnemonic-export@2", formatVersion: 2, exportKind: "proposed_human_review", approvalEffect: "none", releaseAuthorization: "not_granted" });
    expect((await verifyMnemonicExportPackage(forward, { supportedCharacters, visualAnnotations })).valid).toBe(true);

    const tampered = JSON.parse(forward) as Record<string, unknown>;
    (tampered.records as MindTreeMnemonicRecord[])[0] = { ...(tampered.records as MindTreeMnemonicRecord[])[0], story: "Tampered" };
    expect((await verifyMnemonicExportPackage(JSON.stringify(tampered), { supportedCharacters, visualAnnotations })).issues).toContain("Package SHA-256 digest mismatch; package content was altered or corrupted.");
    expect((await verifyMnemonicExportPackage("{bad-json", { supportedCharacters, visualAnnotations })).issues).toContain("Package is not valid JSON.");
    expect((await verifyMnemonicExportPackage({ ...packageObject, schemaVersion: "nihongobridge-kanji-mnemonic-export@1" }, { supportedCharacters, visualAnnotations })).issues).toEqual(expect.arrayContaining(["Unsupported export schema or format version."]));

    const stateTamper = await resignPackage({ ...packageObject, releaseAuthorization: "authorized" });
    expect((await verifyMnemonicExportPackage(stateTamper, { supportedCharacters, visualAnnotations })).issues).toContain("Package contains a contradictory status, learner-visibility, approval, or release-authorization effect.");
    const readinessClaim = JSON.parse(forward) as Record<string, unknown>;
    (readinessClaim.readinessResults as Array<Record<string, unknown>>)[0].status = "eligible_for_separate_release_review";
    const resignedReadinessClaim = await resignPackage(readinessClaim);
    expect((await verifyMnemonicExportPackage(resignedReadinessClaim, { supportedCharacters, visualAnnotations })).issues).toContain("Readiness result is malformed or claims an unsupported authorization state.");
    const secretField = await resignPackage({ ...packageObject, accessToken: "synthetic-secret-do-not-accept" });
    expect((await verifyMnemonicExportPackage(secretField, { supportedCharacters, visualAnnotations })).issues).toContain("Package contains unsupported or potentially unrelated fields.");
    const badEvidence = JSON.parse(forward) as Record<string, unknown>;
    const reviewEvents = badEvidence.reviewEvidence as Array<Record<string, unknown>>;
    reviewEvents[0].reviewerAttribution = "altered after digest";
    expect((await verifyMnemonicExportPackage(badEvidence, { supportedCharacters, visualAnnotations })).issues.some((issue) => issue.includes("Review evidence digest mismatch"))).toBe(true);
    await expect(buildMnemonicExportPackage({
      kind: "approved_release_candidate", records: [record], supportedCharacters, visualAnnotations,
      validationResults: [validationRow(record)],
    })).rejects.toThrow(/no authenticated approval or release-authorization evidence model/);
  });

  it("keeps M6 review evidence and draft stories out of learner resolution and preserves missing coverage", () => {
    expect(getMindTreeEntry("明")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("一")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("男")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("人")).toMatchObject({ mnemonic: null, mnemonicAvailability: "missing" });
    expect(getMindTreeEntry("龍")).toBeNull();
  });
});
