import { describe, expect, it } from "vitest";
import { getMindTreeEntry, listMindTreeEditorialContext } from "../src/lib/kanji/kanjiMindtreeCatalog";
import { readFile } from "node:fs/promises";
import { getMnemonicRecord, getPublishedMnemonic, MINDTREE_MNEMONIC_RECORDS, validateMnemonicRecords, type MindTreeMnemonicRecord } from "../src/lib/kanji/mindtreeMnemonicContent";
import { canRecordLocalReviewDecision, canonicalJson, createLocalReviewEvidence, digestMnemonicRevision, mnemonicRevisionPayload, sha256Hex, verifyLocalReviewEvidence } from "../src/lib/kanji/mindtreeEditorialEvidence";
import { buildMnemonicExportPackage, verifyMnemonicExportPackage } from "../src/lib/kanji/mindtreeMnemonicExport";
import { assessMnemonicQuality } from "../src/lib/kanji/mindtreeMnemonicQuality";
import { evaluateMindTreeReadiness } from "../src/lib/kanji/mindtreeReleaseReadiness";

describe("Kanji MindTree M7 review freshness and learner containment", () => {
  it("requires an explicit outcome, local attribution, saved revision, and acknowledgement of the exact displayed digest", () => {
    const digest = "a".repeat(64);
    const base = {
      outcome: "" as const,
      reviewerAttribution: "",
      currentContentDigest: digest,
      acknowledgedContentDigest: "",
      revisionSaved: true,
    };
    expect(canRecordLocalReviewDecision(base)).toBe(false);
    expect(canRecordLocalReviewDecision({ ...base, outcome: "accepted", reviewerAttribution: "local label" })).toBe(false);
    expect(canRecordLocalReviewDecision({ ...base, outcome: "accepted", reviewerAttribution: "local label", acknowledgedContentDigest: digest, revisionSaved: false })).toBe(false);
    expect(canRecordLocalReviewDecision({ ...base, outcome: "accepted", reviewerAttribution: "local label", acknowledgedContentDigest: "b".repeat(64) })).toBe(false);
    expect(canRecordLocalReviewDecision({ ...base, outcome: "accepted", reviewerAttribution: "local label", acknowledgedContentDigest: digest, isSubmitting: true })).toBe(false);
    for (const outcome of ["accepted", "changes_requested", "rejected"] as const) {
      expect(canRecordLocalReviewDecision({ ...base, outcome, reviewerAttribution: "local label", acknowledgedContentDigest: digest })).toBe(true);
    }
  });

  it("binds every content/origin/provenance field, but excludes lifecycle state and unrelated UI state from the revision digest", async () => {
    const record = { ...getMnemonicRecord("明")! };
    const digest = await digestMnemonicRevision(record);
    const changedRevisions: Array<Partial<MindTreeMnemonicRecord>> = [
      { id: `${record.id}-other` },
      { character: "休" },
      { version: record.version + 1 },
      { keyword: `${record.keyword} changed` },
      { componentCues: ["synthetic cue"] },
      { story: `${record.story} changed` },
      { readingHook: "synthetic reading hook" },
      { origin: "ai_candidate" },
      { provenanceRef: "synthetic:other-origin@1" },
      { sourceReferences: ["synthetic:other-source@1"] },
      { interpretation: "different-contract" as unknown as MindTreeMnemonicRecord["interpretation"] },
      { schemaVersion: "future-schema@99" as unknown as MindTreeMnemonicRecord["schemaVersion"] },
    ];
    for (const patch of changedRevisions) {
      expect(await digestMnemonicRevision({ ...record, ...patch })).not.toBe(digest);
    }
    expect(mnemonicRevisionPayload(record)).not.toHaveProperty("editorialStatus");
    expect(mnemonicRevisionPayload(record)).not.toHaveProperty("reviewerId");
    expect(mnemonicRevisionPayload(record)).not.toHaveProperty("reviewedAt");
    expect(mnemonicRevisionPayload(record)).not.toHaveProperty("publishedAt");
    expect(await digestMnemonicRevision({ ...record, editorialStatus: "review" })).toBe(digest);
    expect(await digestMnemonicRevision({ ...record, ephemeralUiSelection: "preview-label-2" } as MindTreeMnemonicRecord)).toBe(digest);
  });

  it("rejects unsupported nested evidence fields and marks a re-digested version mismatch stale", async () => {
    const source = getMnemonicRecord("明")!;
    const record: MindTreeMnemonicRecord = {
      ...source,
      id: "synthetic-m7-editorial-freshness-fixture",
      origin: "editorial",
      provenanceRef: "synthetic:m7-editorial-fixture@1",
      sourceReferences: ["synthetic:m7-context-fixture@1"],
    };
    const evidence = await createLocalReviewEvidence(record, {
      outcome: "accepted",
      reviewerAttribution: "synthetic M7 fixture only",
      notes: "Automated fixture; no human review is claimed.",
      issueReferences: [],
      provenanceConcerns: [],
    });
    const withUnknownRevisionKey = {
      ...evidence,
      reviewedRevision: { ...evidence.reviewedRevision, importedSigner: "synthetic test field" },
    };
    const { evidenceDigest: _discarded, ...unsignedUnknown } = withUnknownRevisionKey;
    const malformed = { ...unsignedUnknown, evidenceDigest: await sha256Hex(canonicalJson(unsignedUnknown)) };
    expect(await verifyLocalReviewEvidence(malformed)).toMatchObject({ valid: false, issues: [expect.stringMatching(/revision shape/)] });

    const wrongVersionPayload = {
      ...evidence,
      reviewedRevision: { ...evidence.reviewedRevision, version: evidence.reviewedRevision.version + 1 },
    };
    const { evidenceDigest: _oldDigest, ...unsignedWrongVersion } = wrongVersionPayload;
    const internallyValidButMismatched = {
      ...unsignedWrongVersion,
      evidenceDigest: await sha256Hex(canonicalJson(unsignedWrongVersion)),
    };
    expect((await verifyLocalReviewEvidence(internallyValidButMismatched)).valid).toBe(true);

    const contexts = listMindTreeEditorialContext();
    const context = contexts.find((item) => item.character === record.character)!;
    const readiness = await evaluateMindTreeReadiness({
      record,
      character: record.character,
      context: {
        character: context.character,
        meaning: context.meaning,
        dictionaryMeanings: context.dictionaryMeanings,
        readingsOn: context.readingsOn,
        readingsKun: context.readingsKun,
        annotationLabels: context.annotations.map((item) => item.label),
        hasVisualSource: Boolean(context.visualSourceSha256),
        vocabularyCount: context.firstPartyVocabularyCount,
      },
      reviewEvidence: [internallyValidButMismatched],
      supportedCharacters: new Set(contexts.map((item) => item.character)),
      visualAnnotations: new Map(contexts.map((item) => [item.character, new Set(item.annotations.map((annotation) => annotation.label))])),
    });
    expect(readiness.status).toBe("stale_review");
    expect(readiness.reasons.find((item) => item.code === "REVIEW_EVIDENCE_STALE")?.detail).toMatch(/version/);
    expect(readiness.approvalEvidence).toBe("not_supported");
    expect(readiness.releaseAuthorization).toBe("not_granted");
  });

  it("keeps supported first-party stories hidden for legacy workflow statuses and all local review outcomes", async () => {
    const record = getMnemonicRecord("明")!;
    const original = { ...record };
    const hiddenStatuses: MindTreeMnemonicRecord["editorialStatus"][] = ["draft", "review", "approved", "published", "archived"];
    try {
      for (const status of hiddenStatuses) {
        // Synthetic status metadata exists only to exercise the legacy resolver; it is not a review/approval event.
        const lifecycleFixture = ["approved", "published"].includes(status)
          ? { reviewerId: "M7 synthetic fixture only", reviewedAt: "2026-10-29T00:00:00.000Z", publishedAt: status === "published" ? "2026-10-29T00:00:00.000Z" : undefined }
          : {};
        Object.assign(record, { ...original, ...lifecycleFixture, editorialStatus: status });
        const learnerEntry = getMindTreeEntry("明");
        expect(learnerEntry?.mnemonic).toBeNull();
        const serialized = JSON.stringify(learnerEntry);
        expect(serialized).not.toContain(record.story);
        expect(serialized).not.toContain("M7 internal review note sentinel");
        expect(serialized).not.toContain("internal provenance finding sentinel");
        expect(getPublishedMnemonic("明")).toBeNull();
      }
    } finally {
      Object.assign(record, original);
      for (const key of ["reviewerId", "reviewedAt", "publishedAt"] as const) {
        if (!(key in original)) delete record[key];
      }
    }

    const candidate = getMnemonicRecord("一")!;
    const contexts = listMindTreeEditorialContext();
    const context = contexts.find((item) => item.character === candidate.character)!;
    const readinessContext = {
      character: context.character,
      meaning: context.meaning,
      dictionaryMeanings: context.dictionaryMeanings,
      readingsOn: context.readingsOn,
      readingsKun: context.readingsKun,
      annotationLabels: context.annotations.map((item) => item.label),
      hasVisualSource: Boolean(context.visualSourceSha256),
      vocabularyCount: context.firstPartyVocabularyCount,
    };
    for (const [outcome, expectedStatus] of [["accepted", "reviewed_not_approved"], ["changes_requested", "changes_requested"], ["rejected", "blocked"]] as const) {
      const event = await createLocalReviewEvidence(candidate, {
        outcome,
        reviewerAttribution: "synthetic M7 fixture only",
        notes: "M7 internal review note sentinel",
        issueReferences: [],
        provenanceConcerns: ["internal provenance finding sentinel"],
      });
      const assessment = await evaluateMindTreeReadiness({ record: candidate, character: candidate.character, context: readinessContext, reviewEvidence: [event] });
      expect(assessment.status).toBe(expectedStatus);
      expect(assessment.approvalEvidence).toBe("not_supported");
      expect(assessment.releaseAuthorization).toBe("not_granted");
      const learnerEntry = getMindTreeEntry(candidate.character);
      expect(learnerEntry?.mnemonic).toBeNull();
      const serialized = JSON.stringify(learnerEntry);
      expect(serialized).not.toContain(candidate.story);
      expect(serialized).not.toContain(event.notes);
      expect(serialized).not.toContain(event.provenanceConcerns[0]);
    }

    expect(getMindTreeEntry("男")?.mnemonic).toBeNull();
    expect(getMindTreeEntry("人")).toMatchObject({ mnemonic: null, mnemonicAvailability: "missing" });
    expect(getMindTreeEntry("龍")).toBeNull();
    expect(getMindTreeEntry("明人")).toBeNull();
    expect(MINDTREE_MNEMONIC_RECORDS).toHaveLength(75);
  });

  it("keeps the studio decision action explicit and exposes keyboard/status affordances in source", async () => {
    const studioSource = await readFile("src/components/kanji/KanjiMindTreeMnemonicStudio.tsx", "utf8");
    expect(studioSource).toContain('useState<MindTreeReviewOutcome | "">("")');
    expect(studioSource).toContain("Choose an outcome…");
    expect(studioSource).toContain("I personally inspected the exact record and canonical revision displayed above");
    expect(studioSource).toContain("revisionSaved: !isRecordDirty && savedSelectedRecord !== null");
    expect(studioSource).toContain("disabled={!canSubmitReview}");
    expect(studioSource).toContain("workflowStatusRef.current?.focus()");
    expect(studioSource).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(studioSource).toContain("focus-visible:ring-2");
  });

  it("rejects a manipulated draft package and confirms learner routes do not consume export artifacts", async () => {
    const candidate = getMnemonicRecord("一")!;
    const contexts = listMindTreeEditorialContext();
    const context = contexts.find((item) => item.character === candidate.character)!;
    const quality = assessMnemonicQuality(candidate, {
      character: context.character,
      meaning: context.meaning,
      dictionaryMeanings: context.dictionaryMeanings,
      readingsOn: context.readingsOn,
      readingsKun: context.readingsKun,
      annotationLabels: context.annotations.map((item) => item.label),
      hasVisualSource: Boolean(context.visualSourceSha256),
      vocabularyCount: context.firstPartyVocabularyCount,
    });
    expect(quality.findings.every((finding) => /^[A-Z][A-Z0-9_]+$/u.test(finding.code)
      && ["error", "warning", "info"].includes(finding.severity)
      && typeof finding.message === "string"
      && typeof finding.humanDecisionRequired === "boolean")).toBe(true);
    const supportedCharacters = new Set(contexts.map((item) => item.character));
    const visualAnnotations = new Map(contexts.map((item) => [item.character, new Set(item.annotations.map((annotation) => annotation.label))]));
    const row = {
      recordId: candidate.id,
      character: candidate.character,
      schemaValid: validateMnemonicRecords([candidate], supportedCharacters, visualAnnotations).valid,
      schemaIssues: validateMnemonicRecords([candidate], supportedCharacters, visualAnnotations).issues,
      findings: quality.findings,
    };
    const packageText = await buildMnemonicExportPackage({
      kind: "draft_working",
      records: [candidate],
      supportedCharacters,
      visualAnnotations,
      validationResults: [row],
    });
    const conflictingHistory = JSON.parse(packageText) as Record<string, unknown>;
    const divergentRevision = { ...candidate, story: "Different content under the same local revision number" };
    conflictingHistory.revisionHistory = [{ recordId: candidate.id, revisions: [divergentRevision] }];
    const { artifactDigest: _discardedPackageDigest, ...unsignedConflict } = conflictingHistory;
    const resignedConflict = {
      ...unsignedConflict,
      artifactDigest: {
        algorithm: "SHA-256",
        covers: "canonical JSON of all package fields except artifactDigest",
        value: await sha256Hex(canonicalJson(unsignedConflict)),
      },
    };
    const conflictVerification = await verifyMnemonicExportPackage(resignedConflict, { supportedCharacters, visualAnnotations });
    expect(conflictVerification.valid).toBe(false);
    expect(conflictVerification.issues).toContain(`Current record ${candidate.id} conflicts with revision-history content for the same version ${candidate.version}.`);
    await expect(buildMnemonicExportPackage({
      kind: "draft_working", records: [candidate], supportedCharacters, visualAnnotations,
      validationResults: [row], revisionHistory: [{ recordId: candidate.id, revisions: [divergentRevision] }],
    })).rejects.toThrow(/conflicts with revision-history content/);

    const manipulated = JSON.parse(packageText) as Record<string, unknown>;
    (manipulated.records as MindTreeMnemonicRecord[])[0] = {
      ...(manipulated.records as MindTreeMnemonicRecord[])[0],
      story: "M7 manipulated hidden-story fixture",
    };
    expect((await verifyMnemonicExportPackage(manipulated, { supportedCharacters, visualAnnotations })).valid).toBe(false);
    expect(getMindTreeEntry("一")?.mnemonic).toBeNull();
    expect(JSON.stringify(getMindTreeEntry("一"))).not.toContain("M7 manipulated hidden-story fixture");

    const learnerRouteSource = await readFile("src/app/mindtree/[character]/page.tsx", "utf8");
    expect(learnerRouteSource).toContain("getMindTreeEntry(character)");
    expect(learnerRouteSource).not.toContain("mindtreeMnemonicExport");
    expect(learnerRouteSource).not.toContain("verifyMnemonicExportPackage");
  });
});
