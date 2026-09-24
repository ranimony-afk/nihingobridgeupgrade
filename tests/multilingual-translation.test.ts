import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TranslationService } from "@/services/translation/translationService";
import { ReverseSearchService } from "@/services/translation/reverseSearchService";
import { db } from "@/db";
import {
  entityTranslations,
  dictionaryEntries,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { SUPPORTED_LANGUAGES, SUPPORTED_ENTITY_TYPES } from "@/types/translation";

describe("Phase 12B: Multilingual Translation Storage & Reverse Lookup", () => {
  const dictId = `de-test-water-${Date.now()}`;
  let kanjiId = `kj-test-water-${Date.now()}`;
  const grammarId = `gp-test-kara-${Date.now()}`;
  const sentenceId = `es-test-mizu-${Date.now()}`;

  beforeAll(async () => {
    // Check if test kanji already exists in DB
    const [existingKanji] = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "水"))
      .limit(1);

    if (existingKanji) {
      // Use existing seeded kanji ID
      kanjiId = existingKanji.id;
    } else {
      await db.insert(kanjiEntries).values({
        id: kanjiId,
        character: "水",
        meaning: "water",
        readingsKun: ["みず"],
        readingsOn: ["スイ"],
        strokeCount: 4,
        jlptLevel: "N5",
        sourceRef: "first-party:kanji-corpus:v1",
      });
    }

    // Seed test dictionary entry with unique headword
    await db.insert(dictionaryEntries).values({
      id: dictId,
      headword: "水",
      reading: "みず",
      romaji: "mizu",
      jlptLevel: "N5",
      isCommon: true,
      partsOfSpeech: ["noun"],
      senses: [{ glosses: ["water", "cold water"] }],
      sourceRef: "first-party:dictionary-core:v1",
    });

    await db.insert(grammarPatterns).values({
      id: grammarId,
      slug: `te-kara-${Date.now()}`,
      title: "〜てから",
      structure: "Verb て-form + から",
      meaning: "after doing",
      explanation: "Indicates an action occurring after another is completed.",
      jlptLevel: "N5",
      sourceRef: "first-party:grammar-core:v1",
    });

    await db.insert(exampleSentences).values({
      id: sentenceId,
      japanese: "水を飲みます。",
      reading: "みずをのみます。",
      english: "I drink water.",
      jlptLevel: "N5",
      sourceRef: "first-party:sentences-tanaka:v1",
    });
  });

  describe("TranslationService: Insertion & Idempotency", () => {
    it("should insert a translation with deterministic ID without duplicating", async () => {
      const input = {
        entityType: "dictionary" as const,
        entityId: dictId,
        language: "ta" as const,
        translatedText: "தண்ணீர்",
        secondaryText: "Thanneer",
        contextNotes: "Common word for fresh water",
        sourceType: "verified_human" as const,
        sourceRef: "test:tamil-lexicon:v1",
      };

      const res1 = await TranslationService.addTranslation(input);
      expect(res1.id).toBeDefined();
      expect(res1.isVerified).toBe(true);
      expect(res1.translatedText).toBe("தண்ணீர்");

      // Idempotent upsert
      const res2 = await TranslationService.addTranslation(input);
      expect(res2.id).toBe(res1.id);

      const rows = await db
        .select()
        .from(entityTranslations)
        .where(eq(entityTranslations.id, res1.id));
      expect(rows.length).toBe(1);
    });

    it("should store machine translations and support transition to verified_human", async () => {
      const machineInput = {
        entityType: "dictionary" as const,
        entityId: dictId,
        language: "ml" as const,
        translatedText: "വെള്ളം",
        secondaryText: "Vellam",
        sourceType: "machine" as const,
        sourceRef: "model:test-nmt:v1",
      };

      const created = await TranslationService.addTranslation(machineInput);
      expect(created.isVerified).toBe(false);
      expect(created.sourceType).toBe("machine");

      // Human speaker verifies it
      const verified = await TranslationService.verifyTranslation(created.id);
      expect(verified).toBe(true);

      const [updated] = await db
        .select()
        .from(entityTranslations)
        .where(eq(entityTranslations.id, created.id));
      expect(updated.isVerified).toBe(true);
      expect(updated.sourceType).toBe("verified_human");
    });
  });

  describe("TranslationService: Language & Entity Validation", () => {
    it("should reject unsupported languages", async () => {
      await expect(
        TranslationService.addTranslation({
          entityType: "dictionary",
          entityId: dictId,
          language: "fr" as any,
          translatedText: "eau",
          sourceType: "canonical",
        })
      ).rejects.toThrow(/Unsupported language "fr"/);
    });

    it("should reject invalid entity types", async () => {
      await expect(
        TranslationService.addTranslation({
          entityType: "invalid_type" as any,
          entityId: dictId,
          language: "en",
          translatedText: "water",
          sourceType: "canonical",
        })
      ).rejects.toThrow(/Unsupported entityType/);
    });

    it("should retrieve translations filtered by language", async () => {
      const taList = await TranslationService.getTranslations("dictionary", dictId, "ta");
      expect(taList.length).toBeGreaterThanOrEqual(1);
      expect(taList[0].language).toBe("ta");

      const mlList = await TranslationService.getTranslations("dictionary", dictId, "ml");
      expect(mlList.length).toBeGreaterThanOrEqual(1);
      expect(mlList[0].language).toBe("ml");
    });
  });

  describe("ReverseSearchService: Multilingual → Japanese Resolution", () => {
    it("should perform reverse lookup from Tamil to Japanese", async () => {
      const results = await ReverseSearchService.reverseLookup("தண்ணீர்", "ta", "dictionary");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].canonical).toBeDefined();
      expect(results[0].canonical?.displayText).toBe("水");
      expect(results[0].canonical?.reading).toBe("みず");
      expect(results[0].canonical?.romaji).toBe("mizu");
    });

    it("should perform reverse lookup from Malayalam to Japanese", async () => {
      const results = await ReverseSearchService.reverseLookup("വെള്ളം", "ml", "dictionary");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].canonical?.displayText).toBe("水");
    });

    it("should perform reverse lookup across multiple entity types safely", async () => {
      await TranslationService.addTranslation({
        entityType: "kanji",
        entityId: kanjiId,
        language: "ta",
        translatedText: "தண்ணீர் (காஞ்சி)",
        sourceType: "verified_human",
      });

      const kanjiResults = await ReverseSearchService.reverseLookup("காஞ்சி", "ta", "kanji");
      expect(kanjiResults.length).toBeGreaterThan(0);
      expect(kanjiResults[0].canonical?.displayText).toBe("水");
    });
  });

  describe("Canonical Data Integrity", () => {
    it("should ensure canonical Japanese data was NOT modified or corrupted", async () => {
      const [dict] = await db
        .select()
        .from(dictionaryEntries)
        .where(eq(dictionaryEntries.id, dictId));
      expect(dict.headword).toBe("水");
      expect(dict.reading).toBe("みず");
      expect(dict.romaji).toBe("mizu");
      expect(dict.senses).toEqual([{ glosses: ["water", "cold water"] }]);

      const [kanji] = await db
        .select()
        .from(kanjiEntries)
        .where(eq(kanjiEntries.id, kanjiId));
      expect(kanji.character).toBe("水");
      expect(kanji.meaning).toBe("water");
    });
  });

  afterAll(async () => {
    await db.delete(entityTranslations).where(eq(entityTranslations.entityId, dictId));
    await db.delete(dictionaryEntries).where(eq(dictionaryEntries.id, dictId));
    await db.delete(grammarPatterns).where(eq(grammarPatterns.id, grammarId));
    await db.delete(exampleSentences).where(eq(exampleSentences.id, sentenceId));
  });
});
