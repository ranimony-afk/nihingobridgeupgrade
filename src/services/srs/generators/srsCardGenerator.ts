import { db } from "@/db";
import {
  dictionaryEntries,
  kanjiEntries,
  grammarPatterns,
  exampleSentences,
} from "@/db/schema";
import { SrsService } from "../srsService";
import type { SrsCard } from "@/types/srs";

export interface CardGenerationResult {
  deckId: string;
  sourceType: string;
  cardsCreated: number;
  skipped: number;
  cards: SrsCard[];
}

export class SrsCardGenerator {
  /**
   * Helper to ensure standard default deck exists for a source type.
   */
  static async ensureDefaultDeck(
    userId: string,
    deckName: string,
    description: string,
    defaultSchedulerKey = "sm2"
  ): Promise<string> {
    const decks = await SrsService.listDecks(userId);
    const existing = decks.find((d) => d.name === deckName);
    if (existing) return existing.id;

    const created = await SrsService.createDeck({
      ownerId: userId,
      name: deckName,
      description,
      schedulerKey: defaultSchedulerKey,
    });
    return created.id;
  }

  /**
   * Generate SRS cards from dictionary entries.
   */
  static async fromDictionary(params: {
    userId?: string;
    deckId?: string;
    entryIds?: string[];
    jlptLevel?: string;
    limit?: number;
  }): Promise<CardGenerationResult> {
    const userId = params.userId || "anonymous-user";
    const deckId =
      params.deckId ||
      (await this.ensureDefaultDeck(
        userId,
        "Core Vocabulary",
        "Dictionary words and vocabulary flashcards."
      ));

    let rows = await db.select().from(dictionaryEntries);

    if (params.entryIds && params.entryIds.length > 0) {
      rows = rows.filter((r) => params.entryIds!.includes(r.id));
    }
    if (params.jlptLevel) {
      rows = rows.filter((r) => r.jlptLevel === params.jlptLevel);
    }
    if (params.limit && params.limit > 0) {
      rows = rows.slice(0, params.limit);
    }

    const createdCards: SrsCard[] = [];
    let skipped = 0;

    for (const item of rows) {
      const senses = Array.isArray(item.senses) ? item.senses : [];
      const glosses = senses.flatMap((s: any) => s.glosses || []).join(", ");
      const meaning = glosses || "No definition";

      try {
        const card = await SrsService.createCard({
          deckId,
          cardType: "vocabulary",
          front: item.headword,
          back: `${item.reading} (${item.romaji || ""})\n${meaning}`,
          reading: item.reading,
          meaning,
          hint: item.partsOfSpeech?.join(", ") || undefined,
          sourceType: "dictionary",
          sourceRef: item.id,
        });
        if (card) createdCards.push(card);
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }

    return {
      deckId,
      sourceType: "dictionary",
      cardsCreated: createdCards.length,
      skipped,
      cards: createdCards,
    };
  }

  /**
   * Generate SRS cards from Kanji entries.
   */
  static async fromKanji(params: {
    userId?: string;
    deckId?: string;
    characters?: string[];
    jlptLevel?: string;
    limit?: number;
  }): Promise<CardGenerationResult> {
    const userId = params.userId || "anonymous-user";
    const deckId =
      params.deckId ||
      (await this.ensureDefaultDeck(
        userId,
        "Kanji Knowledge",
        "Kanji characters, stroke counts, kun/on readings and meanings."
      ));

    let rows = await db.select().from(kanjiEntries);

    if (params.characters && params.characters.length > 0) {
      rows = rows.filter((r) => params.characters!.includes(r.character));
    }
    if (params.jlptLevel) {
      rows = rows.filter((r) => r.jlptLevel === params.jlptLevel);
    }
    if (params.limit && params.limit > 0) {
      rows = rows.slice(0, params.limit);
    }

    const createdCards: SrsCard[] = [];
    let skipped = 0;

    for (const item of rows) {
      const readings = [
        ...(item.readingsKun || []).map((r) => `訓: ${r}`),
        ...(item.readingsOn || []).map((r) => `音: ${r}`),
      ].join("\n");

      try {
        const card = await SrsService.createCard({
          deckId,
          cardType: "kanji",
          front: item.character,
          back: `${item.meaning}\n${readings}`,
          reading: item.readingsKun?.[0] || item.readingsOn?.[0] || undefined,
          meaning: item.meaning,
          hint: `${item.strokeCount} strokes · JLPT ${item.jlptLevel}`,
          sourceType: "kanji",
          sourceRef: item.id,
        });
        if (card) createdCards.push(card);
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }

    return {
      deckId,
      sourceType: "kanji",
      cardsCreated: createdCards.length,
      skipped,
      cards: createdCards,
    };
  }

  /**
   * Generate SRS cards from Grammar patterns.
   */
  static async fromGrammar(params: {
    userId?: string;
    deckId?: string;
    grammarIds?: string[];
    jlptLevel?: string;
    limit?: number;
  }): Promise<CardGenerationResult> {
    const userId = params.userId || "anonymous-user";
    const deckId =
      params.deckId ||
      (await this.ensureDefaultDeck(
        userId,
        "Grammar Patterns",
        "Japanese grammar structures, rules, and example usage."
      ));

    let rows = await db.select().from(grammarPatterns);

    if (params.grammarIds && params.grammarIds.length > 0) {
      rows = rows.filter((r) => params.grammarIds!.includes(r.id));
    }
    if (params.jlptLevel) {
      rows = rows.filter((r) => r.jlptLevel === params.jlptLevel);
    }
    if (params.limit && params.limit > 0) {
      rows = rows.slice(0, params.limit);
    }

    const createdCards: SrsCard[] = [];
    let skipped = 0;

    for (const item of rows) {
      try {
        const card = await SrsService.createCard({
          deckId,
          cardType: "grammar",
          front: item.title,
          back: `Meaning: ${item.meaning}\nFormation: ${item.structure}\n${item.explanation}`,
          reading: item.structure,
          meaning: item.meaning,
          hint: `JLPT ${item.jlptLevel}`,
          sourceType: "grammar",
          sourceRef: item.id,
        });
        if (card) createdCards.push(card);
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }

    return {
      deckId,
      sourceType: "grammar",
      cardsCreated: createdCards.length,
      skipped,
      cards: createdCards,
    };
  }

  /**
   * Generate SRS cards from Example Sentences.
   */
  static async fromSentences(params: {
    userId?: string;
    deckId?: string;
    sentenceIds?: string[];
    jlptLevel?: string;
    limit?: number;
  }): Promise<CardGenerationResult> {
    const userId = params.userId || "anonymous-user";
    const deckId =
      params.deckId ||
      (await this.ensureDefaultDeck(
        userId,
        "Example Sentences",
        "Full Japanese sentence reading and translation practice."
      ));

    let rows = await db.select().from(exampleSentences);

    if (params.sentenceIds && params.sentenceIds.length > 0) {
      rows = rows.filter((r) => params.sentenceIds!.includes(r.id));
    }
    if (params.jlptLevel) {
      rows = rows.filter((r) => r.jlptLevel === params.jlptLevel);
    }
    if (params.limit && params.limit > 0) {
      rows = rows.slice(0, params.limit);
    }

    const createdCards: SrsCard[] = [];
    let skipped = 0;

    for (const item of rows) {
      try {
        const card = await SrsService.createCard({
          deckId,
          cardType: "question",
          front: item.japanese,
          back: `${item.reading}\n${item.english}`,
          reading: item.reading,
          meaning: item.english,
          hint: item.tags?.join(", ") || undefined,
          sourceType: "sentence",
          sourceRef: item.id,
        });
        if (card) createdCards.push(card);
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }

    return {
      deckId,
      sourceType: "sentence",
      cardsCreated: createdCards.length,
      skipped,
      cards: createdCards,
    };
  }
}
