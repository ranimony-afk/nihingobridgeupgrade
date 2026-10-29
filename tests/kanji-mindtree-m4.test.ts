import { describe, expect, it } from "vitest";
import { getMindTreeEntry, listMindTreeEditorialContext, validateMindTreeSlice } from "../src/lib/kanji/kanjiMindtreeCatalog";
import {
  createEditorialRewrite,
  exportMnemonicRecords,
  getMnemonicAvailability,
  getMnemonicAvailabilityForRecord,
  getMnemonicRecord,
  MINDTREE_MNEMONIC_RECORDS,
  statusCounts,
  transitionMnemonicRecord,
  validateMnemonicRecords,
} from "../src/lib/kanji/mindtreeMnemonicContent";

describe("M4 structured mnemonic content and release gate", () => {
  it("keeps M3 at 100 characters and reports content, evidence, and publication as separate dimensions", () => {
    expect(validateMindTreeSlice()).toEqual({ valid: true, issues: [] });
    const contexts = listMindTreeEditorialContext();
    expect(contexts).toHaveLength(100);
    expect(contexts.every((context) => context.visualSourceSha256.length === 64)).toBe(true);
    expect(contexts.every((context) => context.dictionaryMeanings.length > 0)).toBe(true);
    expect(contexts.every((context) => !("learningGraph" in context) && !("paths" in context))).toBe(true);

    const counts = statusCounts(MINDTREE_MNEMONIC_RECORDS);
    expect(MINDTREE_MNEMONIC_RECORDS).toHaveLength(75);
    expect(counts).toMatchObject({ draft: 75, review: 0, approved: 0, scheduled: 0, published: 0, archived: 0 });
    expect(MINDTREE_MNEMONIC_RECORDS.filter((item) => item.origin === "first_party")).toHaveLength(31);
    expect(MINDTREE_MNEMONIC_RECORDS.filter((item) => item.origin === "ai_candidate")).toHaveLength(44);
    expect(new Set(MINDTREE_MNEMONIC_RECORDS.map((item) => item.character)).size).toBe(75);
    expect(contexts.length - new Set(MINDTREE_MNEMONIC_RECORDS.map((item) => item.character)).size).toBe(25);
    expect(MINDTREE_MNEMONIC_RECORDS.every((item) => !item.reviewerId && !item.reviewedAt && !item.publishedAt)).toBe(true);

    const annotationMap = new Map(contexts.map((context) => [context.character, new Set(context.annotations.map((annotation) => annotation.label))]));
    expect(validateMnemonicRecords(MINDTREE_MNEMONIC_RECORDS, new Set(contexts.map((context) => context.character)), annotationMap)).toEqual({ valid: true, issues: [] });
  });

  it("serves no draft or AI-candidate story to learners and distinguishes pending from missing coverage", () => {
    expect(getMindTreeEntry("明")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("一")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMindTreeEntry("男")).toMatchObject({ mnemonic: null, mnemonicAvailability: "draft" });
    expect(getMnemonicRecord("男")?.origin).toBe("ai_candidate");
    expect(getMindTreeEntry("人")).toMatchObject({ mnemonic: null, mnemonicAvailability: "missing" });
    expect(getMindTreeEntry("龍")).toBeNull();
    expect(getMnemonicAvailability("龍")).toBe("missing");
  });

  it("reuses the CMS lifecycle edges but blocks AI promotion and requires actual review evidence", () => {
    const authored = getMnemonicRecord("明");
    const aiCandidate = getMnemonicRecord("一");
    expect(authored?.editorialStatus).toBe("draft");
    expect(aiCandidate?.editorialStatus).toBe("draft");
    expect(() => transitionMnemonicRecord(authored!, "approved")).toThrow(/Invalid editorial transition/);
    const submitted = transitionMnemonicRecord(authored!, "review");
    expect(submitted.editorialStatus).toBe("review");
    expect(getMnemonicAvailabilityForRecord(submitted)).toBe("review-pending");
    expect(() => transitionMnemonicRecord(submitted, "approved")).toThrow(/real reviewer identity/);
    expect(transitionMnemonicRecord(submitted, "approved", { reviewerId: "human-reviewer", reviewedAt: "2026-10-29" })).toMatchObject({
      editorialStatus: "approved",
      reviewerId: "human-reviewer",
      reviewedAt: "2026-10-29",
    });
    expect(() => transitionMnemonicRecord(transitionMnemonicRecord(aiCandidate!, "review"), "approved", { reviewerId: "human-reviewer", reviewedAt: "2026-10-29" })).toThrow(/AI-assisted candidate content must remain unpublished/);

    const rewrite = createEditorialRewrite(aiCandidate!, "editorial-4e00-1");
    expect(rewrite).toMatchObject({ origin: "editorial", editorialStatus: "draft", story: "", componentCues: [] });
    expect(rewrite.story).not.toContain(aiCandidate?.story ?? "never-match");
    expect(() => transitionMnemonicRecord(rewrite, "review")).toThrow(/Record is not ready for editorial review/);
  });

  it("produces a stable export without inventing reviewer/date metadata", () => {
    const forward = exportMnemonicRecords(MINDTREE_MNEMONIC_RECORDS);
    const reversed = exportMnemonicRecords([...MINDTREE_MNEMONIC_RECORDS].reverse());
    expect(forward).toBe(reversed);
    expect(forward.endsWith("\n")).toBe(true);
    expect(forward).toContain('"origin": "ai_candidate"');
    expect(forward).toContain('"editorialStatus": "draft"');
    expect(forward).not.toContain('"reviewerId"');
    expect(forward).not.toContain('"reviewedAt"');
    expect(forward).not.toContain('"publishedAt"');
  });
});
