import { describe, expect, it } from "vitest";
import {
  kanaToRomaji,
  normalizeJlpt,
  normalizePos,
  extractKanjiCharacters,
  transformJMdictEntry,
  DictionaryPipeline,
  JMDICT_PILOT_50_RECORDS,
  JMDICT_SOURCE_REF,
} from "@/etl/dictionary";

describe("Romaji Generation", () => {
  it("converts basic hiragana and katakana to romaji", () => {
    expect(kanaToRomaji("みず")).toBe("mizu");
    expect(kanaToRomaji("たべる")).toBe("taberu");
    expect(kanaToRomaji("きょう")).toBe("kyou");
    expect(kanaToRomaji("がっこう")).toBe("gakkou");
    expect(kanaToRomaji("でんしゃ")).toBe("densha");
    expect(kanaToRomaji("コーヒー")).toBe("koohii");
    expect(kanaToRomaji("ありがとう")).toBe("arigatou");
  });

  it("handles sokuon (small tsu) properly", () => {
    expect(kanaToRomaji("きって")).toBe("kitte");
    expect(kanaToRomaji("ざっし")).toBe("zasshi");
    expect(kanaToRomaji("マッチ")).toBe("matchi");
  });
});

describe("Field Mapping and Normalization", () => {
  it("normalizes JLPT levels", () => {
    expect(normalizeJlpt("N5")).toBe("N5");
    expect(normalizeJlpt("n5")).toBe("N5");
    expect(normalizeJlpt("5")).toBe("N5");
    expect(normalizeJlpt("N1")).toBe("N1");
    expect(normalizeJlpt("")).toBe("NONE");
    expect(normalizeJlpt(null)).toBe("NONE");
    expect(normalizeJlpt("invalid")).toBe("NONE");
  });

  it("normalizes parts of speech", () => {
    expect(normalizePos(["n", "vs"])).toEqual(["noun", "suru verb"]);
    expect(normalizePos(["adj-i"])).toEqual(["i-adjective"]);
    expect(normalizePos(["v1", "vt"])).toEqual(["ichidan verb", "transitive verb"]);
  });

  it("extracts kanji characters from headwords", () => {
    expect(extractKanjiCharacters("食べる")).toEqual(["食"]);
    expect(extractKanjiCharacters("学生")).toEqual(["学", "生"]);
    expect(extractKanjiCharacters("きれい")).toEqual([]);
    expect(extractKanjiCharacters("日本時間")).toEqual(["日", "本", "時", "間"]);
  });
});

describe("Transformer and Validation", () => {
  it("correctly transforms valid JMdict entry", () => {
    const raw = JMDICT_PILOT_50_RECORDS[0]; // 水
    const result = transformJMdictEntry(raw);

    expect(result.isValid).toBe(true);
    expect(result.record).not.toBeNull();
    const entry = result.record!;

    expect(entry.id).toBe("de-jmdict-1000010");
    expect(entry.headword).toBe("水");
    expect(entry.reading).toBe("みず");
    expect(entry.romaji).toBe("mizu");
    expect(entry.jlptLevel).toBe("N5");
    expect(entry.isCommon).toBe(true);
    expect(entry.frequencyRank).toBe(120);
    expect(entry.partsOfSpeech).toContain("noun");
    expect(entry.senses[0].glosses).toContain("water (esp. cool, fresh)");
    expect(entry.kanjiCharacters).toEqual(["水"]);
    expect(entry.sourceRef).toBe(JMDICT_SOURCE_REF);
  });

  it("rejects malformed records", () => {
    const invalidRecord: any = {
      entSeq: "",
      kanji: [],
      readings: [],
      senses: [],
    };
    const result = transformJMdictEntry(invalidRecord);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.record).toBeNull();
  });

  it("handles duplicate records in batch gracefully", async () => {
    const duplicatePilot = [
      JMDICT_PILOT_50_RECORDS[0],
      JMDICT_PILOT_50_RECORDS[0], // Duplicate
    ];

    const report = await DictionaryPipeline.run({
      sourceRecords: duplicatePilot,
      dryRun: true,
    });

    expect(report.sourceRecords).toBe(2);
    expect(report.parsed).toBe(2);
    expect(report.valid).toBe(1);
    expect(report.duplicates).toBe(1);
    expect(report.invalid).toBe(0);
  });
});

describe("Controlled Pilot Execution (50 records)", () => {
  it("executes dry-run pipeline across all 50 pilot records", async () => {
    const report = await DictionaryPipeline.run({
      dryRun: true,
    });

    expect(report.sourceRecords).toBe(50);
    expect(report.parsed).toBe(50);
    expect(report.valid).toBe(50);
    expect(report.invalid).toBe(0);
    expect(report.duplicates).toBe(0);
    expect(report.errors).toHaveLength(0);
  });
});
