import { describe, it, expect, beforeAll } from "vitest";
import { DictionaryService } from "@/services/dictionary";

describe("Phase 8: Dictionary Service and UI API", () => {
  beforeAll(async () => {
    await DictionaryService.ensureInitialized();
  });

  describe("Dictionary Search with real database records", () => {
    it("should search by exact Japanese headword (e.g. 水)", async () => {
      const result = await DictionaryService.searchEntries({ query: "水" });
      expect(result.entries.length).toBeGreaterThan(0);
      const mizu = result.entries.find((e) => e.headword === "水");
      expect(mizu).toBeDefined();
      expect(mizu?.reading).toBe("みず");
      expect(mizu?.jlptLevel).toBe("N5");
      expect(mizu?.isCommon).toBe(true);
    });

    it("should search by reading (e.g. たべる)", async () => {
      const result = await DictionaryService.searchEntries({ query: "たべる" });
      expect(result.entries.length).toBeGreaterThan(0);
      const taberu = result.entries.find((e) => e.reading === "たべる");
      expect(taberu).toBeDefined();
      expect(taberu?.headword).toBe("食べる");
    });

    it("should search by romaji (e.g. nomu)", async () => {
      const result = await DictionaryService.searchEntries({ query: "nomu" });
      expect(result.entries.length).toBeGreaterThan(0);
      const nomu = result.entries.find((e) => e.romaji === "nomu");
      expect(nomu).toBeDefined();
      expect(nomu?.headword).toBe("飲む");
    });

    it("should search by English gloss (e.g. water)", async () => {
      const result = await DictionaryService.searchEntries({ query: "water" });
      expect(result.entries.length).toBeGreaterThan(0);
      const mizu = result.entries.find((e) => e.headword === "水");
      expect(mizu).toBeDefined();
    });

    it("should filter by JLPT level and common words", async () => {
      const result = await DictionaryService.searchEntries({
        jlptLevel: "N5",
        isCommon: true,
      });
      expect(result.entries.length).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.jlptLevel).toBe("N5");
        expect(entry.isCommon).toBe(true);
      }
    });

    it("should provide fast autocomplete suggestions", async () => {
      const suggestions = await DictionaryService.autocomplete("み", 5);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(5);
      expect(suggestions[0].headword).toBeDefined();
      expect(suggestions[0].reading).toBeDefined();
      expect(suggestions[0].gloss).toBeDefined();
    });
  });

  describe("Dictionary Detailed Entry Page Support", () => {
    it("should retrieve full detailed view for a real entry (de-mizu)", async () => {
      const detail = await DictionaryService.getEntryDetail("de-mizu");
      expect(detail).not.toBeNull();
      expect(detail?.entry.headword).toBe("水");
      expect(detail?.entry.reading).toBe("みず");
      expect(detail?.entry.partsOfSpeech).toContain("noun");

      // Verify Source Provenance
      expect(detail?.source).not.toBeNull();
      expect(detail?.source?.name).toContain("NihongoBridge");

      // Verify Kanji Decomposition
      expect(detail?.kanji.length).toBeGreaterThanOrEqual(1);
      const kanji = detail?.kanji[0];
      expect(kanji?.character).toBe("水");
      expect(kanji?.strokeCount).toBe(4);

      // Verify Example Sentences
      expect(detail?.sentences.length).toBeGreaterThanOrEqual(1);
      const sentence = detail?.sentences[0];
      expect(sentence?.japanese).toBeDefined();
      expect(sentence?.english).toBeDefined();
    });

    it("should return null for non-existent entry", async () => {
      const detail = await DictionaryService.getEntryDetail("non-existent-xyz");
      expect(detail).toBeNull();
    });
  });
});
