import { beforeAll, describe, expect, it } from "vitest";
import {
  GrammarPipeline,
  GRAMMAR_MULTI_LEVEL_FIXTURE,
  transformGrammarPattern,
  normalizeSlug,
  normalizeJLPTLevel,
} from "@/etl/grammar";
import { GrammarService } from "@/services/grammar/grammarService";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeRetriever } from "@/services/ai/knowledgeRetriever";
import { db } from "@/db";
import { exampleSentences as sentenceTable } from "@/db/schema";
import { eq } from "drizzle-orm";

beforeAll(async () => {
  await KnowledgeCorpusService.ensureSeeded();
});

describe("Grammar Transformer and Validation", () => {
  it("normalizes and validates JLPT levels across N5 to N1", () => {
    expect(normalizeJLPTLevel("N5")).toBe("N5");
    expect(normalizeJLPTLevel("n4")).toBe("N4");
    expect(normalizeJLPTLevel("3")).toBe("N3");
    expect(normalizeJLPTLevel("N2")).toBe("N2");
    expect(normalizeJLPTLevel("N1")).toBe("N1");

    expect(() => normalizeJLPTLevel("N6")).toThrow("Invalid JLPT level");
    expect(() => normalizeJLPTLevel("invalid")).toThrow("Invalid JLPT level");
  });

  it("normalizes slugs to URL-safe kebab-case", () => {
    expect(normalizeSlug("wake-ni-wa-ikanai")).toBe("wake-ni-wa-ikanai");
    expect(normalizeSlug("〜わけにはいかない")).toBe(""); // Japanese characters stripped for slug
    expect(normalizeSlug("Sou Da (Conjecture)")).toBe("sou-da-conjecture");
  });

  it("validates and transforms grammar pattern input with deterministic ID", () => {
    const input = GRAMMAR_MULTI_LEVEL_FIXTURE[2]; // N3 wake-ni-wa-ikanai
    const result = transformGrammarPattern(input);

    expect(result.isValid).toBe(true);
    expect(result.record).not.toBeNull();
    const pattern = result.record!;

    expect(pattern.id).toBe("gp-wake-ni-wa-ikanai");
    expect(pattern.slug).toBe("wake-ni-wa-ikanai");
    expect(pattern.jlptLevel).toBe("N3");
    expect(pattern.structure).toContain("わけにはいかない");
    expect(pattern.commonMistakes.length).toBeGreaterThan(0);
    expect(pattern.tags).toContain("jlpt:n3");
  });

  it("detects and rejects invalid or malformed patterns", () => {
    const badInput: any = {
      slug: "",
      title: "",
      structure: "",
      meaning: "",
      explanation: "",
      jlptLevel: "N99",
    };
    const result = transformGrammarPattern(badInput);

    expect(result.isValid).toBe(false);
    expect(result.record).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("Grammar Ingestion Pipeline (N5–N1 Multi-Level Pilot)", () => {
  it("ingests multi-level fixture covering N5, N4, N3, N2, N1", async () => {
    const report = await GrammarPipeline.run({
      patterns: GRAMMAR_MULTI_LEVEL_FIXTURE,
    });

    expect(report.sourceRecords).toBe(5);
    expect(report.valid).toBe(5);
    expect(report.invalid).toBe(0);
    expect(report.duplicates).toBe(0);
  });

  it("demonstrates idempotency on re-run", async () => {
    const rerunReport = await GrammarPipeline.run({
      patterns: GRAMMAR_MULTI_LEVEL_FIXTURE,
    });

    expect(rerunReport.sourceRecords).toBe(5);
    expect(rerunReport.valid).toBe(5);
    expect(rerunReport.inserted).toBe(0);
    expect(rerunReport.skipped).toBe(5);
  });
});

describe("Grammar Relationship & Search Verifications", () => {
  it("verifies Grammar → Example Sentences linkage using example_sentences.grammar_id", async () => {
    // 1. Ensure an example sentence exists with grammar_id set to 'gp-wake-ni-wa-ikanai'
    await db
      .insert(sentenceTable)
      .values({
        id: "es-test-wake",
        japanese: "試験の前だから、遊んでいるわけにはいかない。",
        reading: "しけんのまえだから、あそんでいるわけにはいかない。",
        english: "Since the exam is coming up, I cannot afford to be playing around.",
        jlptLevel: "N3",
        grammarId: "gp-wake-ni-wa-ikanai",
        dictionaryEntryIds: [],
        kanjiCharacters: ["試", "験", "前", "遊"],
        tags: ["study", "obligation"],
        sourceRef: "first-party:test:v1",
      })
      .onConflictDoNothing();

    // 2. Query through GrammarService
    const result = await GrammarService.getPatternWithExamples("gp-wake-ni-wa-ikanai");
    expect(result).not.toBeNull();
    expect(result!.pattern.slug).toBe("wake-ni-wa-ikanai");
    expect(result!.examples.length).toBeGreaterThan(0);
    expect(result!.examples[0].grammarId).toBe("gp-wake-ni-wa-ikanai");
    expect(result!.examples[0].japanese).toContain("わけにはいかない");
  });

  it("verifies Grammar → Search across title, structure, and meaning", async () => {
    // Search by title or pattern keyword
    const searchResult = await GrammarService.listPatterns({ keyword: "皮切り" });
    expect(searchResult.length).toBe(1);
    expect(searchResult[0].slug).toBe("o-kawa-kiri-ni");
    expect(searchResult[0].jlptLevel).toBe("N1");

    // Search via KnowledgeRetriever
    const retrieverResult = await KnowledgeRetriever.retrieve("皮切り", {
      domains: ["grammar"],
    });
    expect(retrieverResult.chunks.length).toBeGreaterThan(0);
    expect(retrieverResult.chunks[0].domain).toBe("grammar");
    expect(retrieverResult.chunks[0].title).toContain("皮切り");
  });

  it("verifies Grammar → JLPT Filtering across all levels", async () => {
    const n5Patterns = await GrammarService.listPatterns({ level: "N5" });
    expect(n5Patterns.length).toBeGreaterThan(0);
    expect(n5Patterns.every((p) => p.jlptLevel === "N5")).toBe(true);

    const n4Patterns = await GrammarService.listPatterns({ level: "N4" });
    expect(n4Patterns.length).toBeGreaterThan(0);
    expect(n4Patterns.every((p) => p.jlptLevel === "N4")).toBe(true);

    const n3Patterns = await GrammarService.listPatterns({ level: "N3" });
    expect(n3Patterns.length).toBeGreaterThan(0);
    expect(n3Patterns.every((p) => p.jlptLevel === "N3")).toBe(true);

    const n2Patterns = await GrammarService.listPatterns({ level: "N2" });
    expect(n2Patterns.length).toBeGreaterThan(0);
    expect(n2Patterns.every((p) => p.jlptLevel === "N2")).toBe(true);

    const n1Patterns = await GrammarService.listPatterns({ level: "N1" });
    expect(n1Patterns.length).toBeGreaterThan(0);
    expect(n1Patterns.every((p) => p.jlptLevel === "N1")).toBe(true);
  });
});
