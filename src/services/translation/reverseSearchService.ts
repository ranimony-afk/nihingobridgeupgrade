import { db } from "@/db";
import {
  entityTranslations,
  dictionaryEntries,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
} from "@/db/schema";
import { eq, and, sql, ilike } from "drizzle-orm";
import {
  type SupportedLanguage,
  type SupportedEntityType,
  type ReverseLookupResult,
  SUPPORTED_LANGUAGES,
} from "@/types/translation";
import { normalizeTranslatedText } from "./translationService";
import { sortTranslationsVerifiedFirst } from "@/services/publication";

export class ReverseSearchService {
  /**
   * Reverse lookup from translated text back to canonical Japanese entity.
   */
  static async reverseLookup(
    text: string,
    language: SupportedLanguage,
    entityType?: SupportedEntityType
  ): Promise<ReverseLookupResult[]> {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw new Error(`Unsupported language "${language}". Must be one of: ${SUPPORTED_LANGUAGES.join(", ")}`);
    }

    const normalized = normalizeTranslatedText(text);
    if (!normalized) return [];

    const pattern = `%${normalized}%`;
    const conditions = [
      eq(entityTranslations.language, language),
      ilike(entityTranslations.translatedText, pattern),
    ];

    if (entityType) {
      conditions.push(eq(entityTranslations.entityType, entityType));
    }

    const matches = await db
      .select()
      .from(entityTranslations)
      .where(and(...conditions))
      .limit(50);

    // 13.5F: verified translations resolve first among the matches.
    // Ranking applies within the existing limit — no index redesign.
    const results: ReverseLookupResult[] = [];

    for (const match of sortTranslationsVerifiedFirst(matches)) {
      const canonical = await this.resolveCanonicalEntity(
        match.entityType as SupportedEntityType,
        match.entityId
      );

      results.push({
        entityType: match.entityType as SupportedEntityType,
        entityId: match.entityId,
        language: match.language as SupportedLanguage,
        translatedText: match.translatedText,
        matchedText: normalized,
        isVerified: match.isVerified,
        canonical,
      });
    }

    return results;
  }

  /**
   * Safe polymorphic resolver for canonical Japanese entities.
   */
  private static async resolveCanonicalEntity(
    entityType: SupportedEntityType,
    entityId: string
  ): Promise<ReverseLookupResult["canonical"]> {
    switch (entityType) {
      case "dictionary": {
        const [dict] = await db
          .select()
          .from(dictionaryEntries)
          .where(eq(dictionaryEntries.id, entityId))
          .limit(1);
        if (!dict) return null;
        const senses = Array.isArray(dict.senses) ? dict.senses : [];
        const glossList = senses.flatMap((s: any) => s.glosses || []);
        return {
          displayText: dict.headword,
          reading: dict.reading,
          romaji: dict.romaji,
          jlptLevel: dict.jlptLevel,
          canonicalEnglish: glossList.join("; "),
        };
      }
      case "kanji": {
        const [kanji] = await db
          .select()
          .from(kanjiEntries)
          .where(eq(kanjiEntries.id, entityId))
          .limit(1);
        if (!kanji) return null;
        return {
          displayText: kanji.character,
          reading: (kanji.readingsKun || []).concat(kanji.readingsOn || []).join(", "),
          jlptLevel: kanji.jlptLevel,
          canonicalEnglish: kanji.meaning,
        };
      }
      case "grammar": {
        const [grammar] = await db
          .select()
          .from(grammarPatterns)
          .where(eq(grammarPatterns.id, entityId))
          .limit(1);
        if (!grammar) return null;
        return {
          displayText: grammar.title,
          reading: grammar.structure,
          jlptLevel: grammar.jlptLevel,
          canonicalEnglish: grammar.meaning,
        };
      }
      case "sentence": {
        const [sentence] = await db
          .select()
          .from(exampleSentences)
          .where(eq(exampleSentences.id, entityId))
          .limit(1);
        if (!sentence) return null;
        return {
          displayText: sentence.japanese,
          reading: sentence.reading,
          jlptLevel: sentence.jlptLevel,
          canonicalEnglish: sentence.english,
        };
      }
      default:
        return null;
    }
  }
}
