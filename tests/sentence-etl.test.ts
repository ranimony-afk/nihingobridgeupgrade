import { beforeAll, describe, expect, it } from "vitest";
import {
  SentenceMatcher,
  transformSentenceEntry,
  SentencePipeline,
  TATOEBA_PILOT_FIXTURE,
  TATOEBA_SOURCE_REF,
} from "@/etl/sentence";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { KnowledgeRetriever } from "@/services/ai/knowledgeRetriever";

beforeAll(async () => {
  await KnowledgeCorpusService.ensureSeeded();
  await KnowledgeService.ensureSeeded();
  await SentenceMatcher.load();
});

describe("Sentence Transformer and Entity Matcher", () => {
  it("extracts kanji characters from sentence", () => {
    const raw = TATOEBA_PILOT_FIXTURE[0]; // 冷たい水を一杯飲みました。
    const result = transformSentenceEntry(raw);

    expect(result.isValid).toBe(true);
    expect(result.record).not.toBeNull();
    const sentence = result.record!;

    expect(sentence.id).toBe("es-tat-1001");
    expect(sentence.japanese).toBe("冷たい水を一杯飲みました。");
    expect(sentence.reading).toBe("つめたいみずをいっぱいのみました。");
    expect(sentence.english).toBe("I drank a glass of cold water.");
    expect(sentence.kanjiCharacters).toEqual(expect.arrayContaining(["冷", "水", "一", "杯", "飲"]));
    expect(sentence.sourceRef).toBe(TATOEBA_SOURCE_REF);
  });

  it("links matching dictionary entries automatically", () => {
    const raw = TATOEBA_PILOT_FIXTURE[0]; // 冷たい水を一杯飲みました。 (contains 水)
    const result = transformSentenceEntry(raw);

    expect(result.isValid).toBe(true);
    const entryIds = result.record!.dictionaryEntryIds;
    // Should match 水 (e.g. de-mizu or de-jmdict-1000010)
    const hasWater = entryIds.some((id) => id === "de-mizu" || id === "de-jmdict-1000010");
    expect(hasWater).toBe(true);
  });

  it("links matching grammar pattern automatically", () => {
    const raw = TATOEBA_PILOT_FIXTURE[2]; // 朝ご飯を食べてから、学校へ行きます。 (contains 〜てから)
    const result = transformSentenceEntry(raw);

    expect(result.isValid).toBe(true);
    expect(result.record!.grammarId).toBe("gp-te-kara");
  });

  it("rejects malformed records missing Japanese or English", () => {
    const badRecord1: any = {
      tatoebaId: "9999",
      japanese: "",
      english: "Valid English",
    };
    const badRecord2: any = {
      tatoebaId: "9998",
      japanese: "有効な日本語",
      english: "",
    };
    const badRecord3: any = {
      tatoebaId: "",
      japanese: "有効な日本語",
      english: "Valid English",
    };

    expect(transformSentenceEntry(badRecord1).isValid).toBe(false);
    expect(transformSentenceEntry(badRecord2).isValid).toBe(false);
    expect(transformSentenceEntry(badRecord3).isValid).toBe(false);
  });
});

describe("Sentence Ingestion Pipeline Pilot Execution", () => {
  it("executes ingestion pilot and loads records into database", async () => {
    const report = await SentencePipeline.run({
      sourceRecords: TATOEBA_PILOT_FIXTURE,
    });

    expect(report.sourceRecords).toBe(25);
    expect(report.parsed).toBe(25);
    expect(report.valid).toBe(25);
    expect(report.invalid).toBe(0);
    expect(report.duplicates).toBe(0);
    expect(report.errors).toHaveLength(0);
  });

  it("is idempotent on repeated runs", async () => {
    const rerunReport = await SentencePipeline.run({
      sourceRecords: TATOEBA_PILOT_FIXTURE,
    });

    expect(rerunReport.sourceRecords).toBe(25);
    expect(rerunReport.valid).toBe(25);
    expect(rerunReport.inserted).toBe(0);
    expect(rerunReport.skipped).toBe(25);
  });
});

describe("Cross-Entity Relationship Verification", () => {
  it("verifies Dictionary → Example Sentence relationship", async () => {
    // Lookup dictionary entry for 水 (de-mizu)
    const result = await KnowledgeRetriever.retrieveEntity("dictionary", "de-mizu");
    expect(result.chunks.length).toBeGreaterThan(1);

    const sentenceChunks = result.chunks.filter((c) => c.domain === "sentence");
    expect(sentenceChunks.length).toBeGreaterThan(0);
    // At least one sentence contains 水
    const hasMizuSentence = sentenceChunks.some((s) => s.content.includes("水"));
    expect(hasMizuSentence).toBe(true);
  });

  it("verifies Kanji → Example Sentence relationship", async () => {
    // Lookup kanji 花 (which exists in canonical kanji_entries)
    const result = await KnowledgeRetriever.retrieveEntity("kanji", "花");
    expect(result.chunks.length).toBeGreaterThan(0);

    // Chunks should contain the kanji, linked dictionary words, and example sentences
    const kanjiChunk = result.chunks.find((c) => c.domain === "kanji");
    expect(kanjiChunk).toBeDefined();
    expect(kanjiChunk!.title).toBe("花");

    const sentenceChunks = result.chunks.filter((c) => c.domain === "sentence");
    expect(sentenceChunks.length).toBeGreaterThan(0);
    const hasHanaSentence = sentenceChunks.some((s) => s.content.includes("花"));
    expect(hasHanaSentence).toBe(true);
  });

  it("verifies Grammar → Example Sentence relationship", async () => {
    // Lookup grammar 〜てから (gp-te-kara)
    const result = await KnowledgeRetriever.retrieveEntity("grammar", "gp-te-kara");
    expect(result.chunks.length).toBeGreaterThan(1);

    const linkedSentences = result.chunks.filter((c) => c.domain === "sentence");
    expect(linkedSentences.length).toBeGreaterThan(0);

    // Sentence should have te-kara link
    const teKaraSentence = linkedSentences.find((s) => s.content.includes("てから"));
    expect(teKaraSentence).toBeDefined();
  });
});
