/**
 * Kanji Reading Normalization & Classification Service — Phase 14.4B.
 *
 * Provides reading classification, normalization, extraction, and detailed
 * lookup contracts for Kanji and related vocabulary compounds.
 *
 * Preserves okurigana notation boundaries (e.g., "た.べる") while providing
 * normalized query forms.
 */

import { db as defaultDb } from "@/db";
import { kanjiEntries, dictionaryEntries, kanjiComposition, kanjiRadicals } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { normalizeKunReading } from "@/etl/kanji/transformer";
import { kanjiVisualService } from "./kanjiVisualService";
import type { KanjiVisualAsset } from "@/etl/kanji/kanjiVgTransformer";

export type ReadingType = "on" | "kun" | "nanori" | "special" | "unknown";

export interface ClassifiedReading {
  reading: string;
  normalized: string;
  type: ReadingType;
  hasOkurigana: boolean;
  okuriganaStem?: string;
  okuriganaSuffix?: string;
}

export interface KanjiDetailReadings {
  on: string[];
  kun: string[]; // with okurigana preserved (e.g. "た.べる")
  kunNormalized: string[]; // without okurigana (e.g. "たべる")
  nanori: string[];
  special: string[];
  all: ClassifiedReading[];
}

export interface KanjiDetailResponse {
  id: string;
  character: string;
  unicode: string;
  codepoint: string;
  strokeCount: number;
  strokeCountAlternatives: number[];
  grade: number | null;
  jlpt: string | null;
  frequency: number | null;
  onyomi: string[];
  kunyomi: string[];
  nanori: string[];
  specialReadings: string[];
  meanings: string[];
  primaryMeaning: string;
  readings: KanjiDetailReadings;
  radicals: Array<{
    id: string;
    character: string;
    meaning: string;
    role?: string;
  }>;
  components: Array<{
    id: string;
    character: string;
    role: string;
  }>;
  compounds: Array<{
    word: string;
    reading: string;
    meaning: string;
    source: "kanji_vocabulary" | "dictionary_linkage";
  }>;
  provenance: {
    sourceRef: string;
    verified: boolean;
  };
  visualAsset?: KanjiVisualAsset | null;
}

export interface KanjiReadingServiceOptions {
  db?: typeof defaultDb;
}

export class KanjiReadingService {
  private db: typeof defaultDb;

  constructor(options?: KanjiReadingServiceOptions) {
    this.db = options?.db ?? defaultDb;
  }

  /**
   * Classifies a reading string into on, kun, nanori, special, or unknown.
   *
   * Rules:
   * 1. If reading contains '.', it is Kun'yomi with okurigana.
   * 2. If reading is predominantly Katakana ([\u30A0-\u30FF]), it is On'yomi.
   * 3. If reading is predominantly Hiragana ([\u3040-\u309F]), it is Kun'yomi.
   * 4. If reading contains '-' prefixes/suffixes, it is categorized as Kun'yomi affix.
   */
  classifyReading(reading: string): ClassifiedReading {
    const trimmed = reading.trim();
    if (!trimmed) {
      return {
        reading: "",
        normalized: "",
        type: "unknown",
        hasOkurigana: false,
      };
    }

    const hasOkurigana = trimmed.includes(".");
    let okuriganaStem: string | undefined;
    let okuriganaSuffix: string | undefined;

    if (hasOkurigana) {
      const parts = trimmed.split(".");
      okuriganaStem = parts[0];
      okuriganaSuffix = parts.slice(1).join("");
    }

    const normalized = normalizeKunReading(trimmed);

    // Katakana detection: \u30A0-\u30FF
    const katakanaRegex = /^[\u30A0-\u30FFー]+$/;
    // Hiragana detection: \u3040-\u309F
    const hiraganaRegex = /^[\u3040-\u309Fー]+$/;

    let type: ReadingType = "unknown";
    if (hasOkurigana) {
      type = "kun";
    } else if (katakanaRegex.test(normalized)) {
      type = "on";
    } else if (hiraganaRegex.test(normalized)) {
      type = "kun";
    } else {
      type = "special";
    }

    return {
      reading: trimmed,
      normalized,
      type,
      hasOkurigana,
      okuriganaStem,
      okuriganaSuffix,
    };
  }

  /**
   * Gets On'yomi readings for a kanji character from the database.
   */
  async getOnReadings(character: string): Promise<string[]> {
    const [row] = await this.db
      .select({ readingsOn: kanjiEntries.readingsOn })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, character))
      .limit(1);

    if (!row || !Array.isArray(row.readingsOn)) return [];
    return (row.readingsOn as string[]).map((r) => r.trim()).filter(Boolean);
  }

  /**
   * Gets Kun'yomi readings for a kanji character, preserving okurigana delimiters.
   */
  async getKunReadings(character: string): Promise<string[]> {
    const [row] = await this.db
      .select({ readingsKun: kanjiEntries.readingsKun })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, character))
      .limit(1);

    if (!row || !Array.isArray(row.readingsKun)) return [];
    return (row.readingsKun as string[]).map((r) => r.trim()).filter(Boolean);
  }

  /**
   * Gets Nanori readings for a character.
   */
  async getNanori(character: string): Promise<string[]> {
    // Nanori can be looked up from stored kanji or classified from reading entries
    const [row] = await this.db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, character))
      .limit(1);

    if (!row) return [];
    // If stored in extended metadata or vocabulary
    return [];
  }

  /**
   * Gets special / irregular readings for a character.
   */
  async getSpecialReadings(character: string): Promise<string[]> {
    const all = await this.getAllReadings(character);
    return all
      .filter((c) => c.type === "special")
      .map((c) => c.reading);
  }

  /**
   * Gets all classified readings for a character.
   */
  async getAllReadings(character: string): Promise<ClassifiedReading[]> {
    const [onReadings, kunReadings] = await Promise.all([
      this.getOnReadings(character),
      this.getKunReadings(character),
    ]);

    const results: ClassifiedReading[] = [];

    for (const on of onReadings) {
      results.push(this.classifyReading(on));
    }

    for (const kun of kunReadings) {
      results.push(this.classifyReading(kun));
    }

    return results;
  }

  /**
   * Finds vocabulary compounds using a specific reading.
   */
  async getVocabularyUsingReading(
    reading: string
  ): Promise<Array<{ kanji: string; word: string; reading: string; meaning: string }>> {
    const normalized = normalizeKunReading(reading);
    const rows = await this.db
      .select({
        character: kanjiEntries.character,
        vocabulary: kanjiEntries.vocabulary,
      })
      .from(kanjiEntries);

    const matches: Array<{ kanji: string; word: string; reading: string; meaning: string }> = [];

    for (const row of rows) {
      const vocabList = Array.isArray(row.vocabulary)
        ? (row.vocabulary as Array<{ word: string; reading: string; meaning: string }>)
        : [];

      for (const item of vocabList) {
        if (
          item.reading === reading ||
          normalizeKunReading(item.reading) === normalized
        ) {
          matches.push({
            kanji: row.character,
            word: item.word,
            reading: item.reading,
            meaning: item.meaning,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Fetches full kanji detail matching the Phase 14.4B contract.
   */
  async getKanjiDetail(character: string): Promise<KanjiDetailResponse | null> {
    const [row] = await this.db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, character))
      .limit(1);

    if (!row) return null;

    const codePoint = row.character.codePointAt(0);
    const hex = codePoint ? codePoint.toString(16).toUpperCase().padStart(4, "0") : "";
    const unicode = hex ? `U+${hex}` : "";

    const onReadings = Array.isArray(row.readingsOn) ? (row.readingsOn as string[]) : [];
    const kunReadings = Array.isArray(row.readingsKun) ? (row.readingsKun as string[]) : [];
    const normalizedKun = kunReadings.map((k) => normalizeKunReading(k));

    const allReadings: ClassifiedReading[] = [
      ...onReadings.map((r) => this.classifyReading(r)),
      ...kunReadings.map((r) => this.classifyReading(r)),
    ];

    const vocabCompounds = Array.isArray(row.vocabulary)
      ? (row.vocabulary as Array<{ word: string; reading: string; meaning: string }>).map((v) => ({
          word: v.word,
          reading: v.reading,
          meaning: v.meaning,
          source: "kanji_vocabulary" as const,
        }))
      : [];

    // Optionally retrieve matching dictionary compounds if dictionary_entries exists
    let dictCompounds: Array<{
      word: string;
      reading: string;
      meaning: string;
      source: "dictionary_linkage";
    }> = [];

    try {
      const dictRows = await this.db
        .select({
          headword: dictionaryEntries.headword,
          reading: dictionaryEntries.reading,
          senses: dictionaryEntries.senses,
          kanjiCharacters: dictionaryEntries.kanjiCharacters,
        })
        .from(dictionaryEntries)
        .where(
          sql`${dictionaryEntries.kanjiCharacters} @> ${JSON.stringify([character])}::jsonb`
        )
        .limit(5);

      dictCompounds = dictRows.map((d) => ({
        word: d.headword || character,
        reading: d.reading,
        meaning:
          Array.isArray(d.senses) &&
          d.senses[0] &&
          Array.isArray(d.senses[0].glosses) &&
          d.senses[0].glosses[0]
            ? String(d.senses[0].glosses[0])
            : "",
        source: "dictionary_linkage" as const,
      }));
    } catch {
      // dictionaryEntries linkage optional or empty in dry run
    }

    // Retrieve components from kanji_composition if modeled
    const components: Array<{ id: string; character: string; role: string }> = [];
    const radicalsList: Array<{ id: string; character: string; meaning: string; role?: string }> = [];

    try {
      const compRows = await this.db
        .select()
        .from(kanjiComposition)
        .where(eq(kanjiComposition.kanjiId, row.id));

      if (compRows.length > 0) {
        const elementIds = compRows.map((c) => c.elementId);
        const elRows = await this.db
          .select()
          .from(kanjiRadicals)
          .where(inArray(kanjiRadicals.id, elementIds));
        const elMap = new Map(elRows.map((e) => [e.id, e]));

        for (const c of compRows) {
          const el = elMap.get(c.elementId);
          components.push({
            id: c.elementId,
            character: c.renderedAs || el?.character || "",
            role: c.role,
          });
          if (el) {
            radicalsList.push({
              id: el.id,
              character: el.character,
              meaning: el.meaning,
              role: c.role,
            });
          }
        }
      } else if (row.primaryRadicalId) {
        const [radRow] = await this.db
          .select()
          .from(kanjiRadicals)
          .where(eq(kanjiRadicals.id, row.primaryRadicalId))
          .limit(1);
        if (radRow) {
          radicalsList.push({
            id: radRow.id,
            character: radRow.character,
            meaning: radRow.meaning,
          });
        }
      }
    } catch {
      // Composition or radicals lookup optional
    }

    const specialList = allReadings.filter((r) => r.type === "special").map((r) => r.reading);

    const visualAsset = kanjiVisualService.getVisualAsset(character);
    const altStrokes: number[] = [];
    if (visualAsset && visualAsset.strokeCount !== row.strokeCount) {
      altStrokes.push(visualAsset.strokeCount);
    }

    return {
      id: row.id,
      character: row.character,
      unicode,
      codepoint: hex.toLowerCase(),
      strokeCount: row.strokeCount,
      strokeCountAlternatives: altStrokes,
      grade: row.gradeLevel,
      jlpt: row.jlptLevel,
      frequency: null,
      onyomi: onReadings,
      kunyomi: kunReadings,
      nanori: [],
      specialReadings: specialList,
      meanings: row.meaning ? [row.meaning] : [],
      primaryMeaning: row.meaning,
      readings: {
        on: onReadings,
        kun: kunReadings,
        kunNormalized: normalizedKun,
        nanori: [],
        special: specialList,
        all: allReadings,
      },
      radicals: radicalsList,
      components,
      compounds: [...vocabCompounds, ...dictCompounds],
      provenance: {
        sourceRef: row.sourceRef,
        verified: true,
      },
      visualAsset,
    };
  }
}

export const kanjiReadingService = new KanjiReadingService();
