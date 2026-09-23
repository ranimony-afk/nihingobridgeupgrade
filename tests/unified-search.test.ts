import { describe, it, expect, beforeAll } from "vitest";
import { UnifiedSearchService } from "@/services/search/unifiedSearchService";
import { detectSearchScript, sanitizeSearchQuery } from "@/services/search/matcher";

describe("Phase 7: Unified Search Engine", () => {
  beforeAll(async () => {
    // Warm up the database and ensure seeding
    await UnifiedSearchService.ensureInitialized();
  });

  describe("Query Script Detection & Sanitization", () => {
    it("detects Japanese, kana, kanji, romaji, and empty correctly", () => {
      expect(detectSearchScript("")).toBe("empty");
      expect(detectSearchScript("   ")).toBe("empty");
      expect(detectSearchScript("日")).toBe("kanji");
      expect(detectSearchScript("みず")).toBe("kana");
      expect(detectSearchScript("食べる")).toBe("japanese");
      expect(detectSearchScript("taberu")).toBe("romaji");
      expect(detectSearchScript("water")).toBe("romaji");
    });

    it("sanitizes malformed inputs safely", () => {
      expect(sanitizeSearchQuery("   test\0with\0nulls   ")).toBe("testwithnulls");
      expect(sanitizeSearchQuery(null as any)).toBe("");
      expect(sanitizeSearchQuery(undefined as any)).toBe("");
    });
  });

  describe("Search Targets and Modes", () => {
    it("should perform exact Japanese search", async () => {
      const result = await UnifiedSearchService.search("水");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("kanji");

      // Should find kanji, radicals, and dictionary entries
      const entityTypes = new Set(result.results.map((r) => r.entityType));
      expect(entityTypes.has("kanji") || entityTypes.has("dictionary")).toBe(true);

      const topResult = result.results[0];
      expect(topResult.displayText).toContain("水");
      expect(topResult.relevance).toBeGreaterThanOrEqual(0.9);
      expect(topResult.source).toBeTruthy();
    });

    it("should perform partial Japanese search", async () => {
      const result = await UnifiedSearchService.search("勉強");
      expect(result.results.length).toBeGreaterThan(0);
      const matches = result.results.filter(
        (r) => r.displayText.includes("勉強") || (r.meaning && r.meaning.includes("study"))
      );
      expect(matches.length).toBeGreaterThan(0);
    });

    it("should search by reading (kana)", async () => {
      const result = await UnifiedSearchService.search("みず");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("kana");

      const match = result.results.find(
        (r) => r.reading?.includes("みず") || r.displayText === "水"
      );
      expect(match).toBeDefined();
    });

    it("should search by romaji", async () => {
      const result = await UnifiedSearchService.search("mizu");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.detectedScript).toBe("romaji");

      const match = result.results.find(
        (r) => r.displayText === "水" || r.reading === "みず" || r.meaning.toLowerCase().includes("water")
      );
      expect(match).toBeDefined();
    });

    it("should search by English meaning", async () => {
      const result = await UnifiedSearchService.search("water");
      expect(result.results.length).toBeGreaterThan(0);

      const match = result.results.find((r) => r.meaning.toLowerCase().includes("water"));
      expect(match).toBeDefined();
    });

    it("should search kanji specifically and include radicals", async () => {
      const result = await UnifiedSearchService.search("木", {
        targets: ["kanji", "radicals"],
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.targetsSearched).toEqual(["kanji", "radicals"]);

      const hasKanji = result.results.some((r) => r.entityType === "kanji");
      const hasRadical = result.results.some((r) => r.entityType === "radicals");
      expect(hasKanji || hasRadical).toBe(true);
    });

    it("should filter by JLPT level", async () => {
      const result = await UnifiedSearchService.search("", {
        jlptLevel: "N5",
        limit: 10,
      });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.appliedJlptLevel).toBe("N5");

      for (const item of result.results) {
        if (item.jlptLevel) {
          expect(item.jlptLevel).toBe("N5");
        }
      }
    });

    it("should handle empty search gracefully", async () => {
      const result = await UnifiedSearchService.search("");
      expect(result.results).toEqual([]);
      expect(result.totalResults).toBe(0);
      expect(result.detectedScript).toBe("empty");
    });

    it("should handle malformed / special characters without crashing", async () => {
      const weirdQueries = [
        "%' OR 1=1 --",
        "\\'; DROP TABLE dictionary_entries; --",
        "!@#$%^&*()_+{}[]|\":;<>?,./~`",
        "   \t\n   ",
      ];

      for (const q of weirdQueries) {
        const result = await UnifiedSearchService.search(q);
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("Performance Benchmarking", () => {
    it("should measure and log query performance across all targets", async () => {
      const queries = ["水", "taberu", "teacher", "N5", "私"];

      console.log("\n=== Unified Search Engine Benchmark ===");
      for (const q of queries) {
        const res = await UnifiedSearchService.search(q, { limit: 20 });
        console.log(
          `Query "${q}": ${res.results.length} results in ${res.metrics.durationMs}ms (Breakdown: ${JSON.stringify(
            res.metrics.targetDurationsMs
          )})`
        );
        expect(res.metrics.durationMs).toBeLessThan(500); // Expect sub-500ms on SQLite/PostgreSQL
      }
    });
  });
});
