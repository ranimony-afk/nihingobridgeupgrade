/**
 * Kanji to JMdict Deterministic Linkage Engine — Phase 14.4B.
 *
 * Prepares deterministic matching between Kanji records and JMdict lexical entries.
 *
 * Features:
 * - Finds dictionary entries containing specific kanji characters
 * - Matches entry readings against Kanji On'yomi and Kun'yomi deterministically
 * - Classifies compound usage (ON_COMPOUND, KUN_COMPOUND, ON_SOLO, KUN_SOLO, SPECIAL)
 * - Surfaces sense glosses and semantic definitions
 */

import { normalizeKunReading } from "@/etl/kanji/transformer";

export type CompoundUsageType =
  | "ON_COMPOUND"
  | "KUN_COMPOUND"
  | "ON_SOLO"
  | "KUN_SOLO"
  | "SPECIAL";

export interface KanjiJmdictLinkage {
  kanjiCharacter: string;
  dictionaryEntryId: string;
  headword: string;
  reading: string;
  compoundType: CompoundUsageType;
  matchedReading: string;
  senses: Array<{ glosses: string[] }>;
}

export interface CandidateDictionaryEntry {
  id: string;
  kanjiCharacters: string[];
  reading: string;
  senses: Array<{
    note?: string | null;
    glosses: Array<{ text?: string } | string>;
  }>;
}

/**
 * Converts Katakana string to Hiragana string for reading comparison.
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * Determines whether a dictionary word reading matches On'yomi or Kun'yomi of a kanji.
 */
export function classifyCompoundReading(
  kanji: string,
  wordReading: string,
  onReadings: string[],
  kunReadings: string[],
  isMultiKanji: boolean
): { compoundType: CompoundUsageType; matchedReading: string } {
  const normWordReading = wordReading.trim();
  const hiraganaOnReadings = onReadings.map((r) => katakanaToHiragana(r.trim()));
  const normalizedKunReadings = kunReadings.map((r) => normalizeKunReading(r));

  // 1. Check exact match with Kun'yomi (e.g. 食 -> 食べる, reading たべる matches た.べる)
  for (let i = 0; i < kunReadings.length; i++) {
    const rawKun = kunReadings[i];
    const normKun = normalizedKunReadings[i];
    if (normWordReading === normKun || normWordReading.startsWith(normKun)) {
      return {
        compoundType: isMultiKanji ? "KUN_COMPOUND" : "KUN_SOLO",
        matchedReading: rawKun,
      };
    }
  }

  // 2. Check match with On'yomi (e.g. 食 -> 食事, reading しょくじ begins with しょく)
  for (let i = 0; i < onReadings.length; i++) {
    const rawOn = onReadings[i];
    const hiraOn = hiraganaOnReadings[i];
    if (normWordReading.startsWith(hiraOn)) {
      return {
        compoundType: isMultiKanji ? "ON_COMPOUND" : "ON_SOLO",
        matchedReading: rawOn,
      };
    }
  }

  // 3. Fallback: check if any part contains On or Kun
  for (let i = 0; i < onReadings.length; i++) {
    const rawOn = onReadings[i];
    const hiraOn = hiraganaOnReadings[i];
    if (normWordReading.includes(hiraOn)) {
      return {
        compoundType: "ON_COMPOUND",
        matchedReading: rawOn,
      };
    }
  }

  return {
    compoundType: "SPECIAL",
    matchedReading: "ateji/gikun",
  };
}

/**
 * Prepares deterministic linkage between a Kanji character and candidate dictionary entries.
 */
export function prepareKanjiJmdictLinkage(
  character: string,
  onReadings: string[],
  kunReadings: string[],
  entries: CandidateDictionaryEntry[]
): KanjiJmdictLinkage[] {
  const linkages: KanjiJmdictLinkage[] = [];

  for (const entry of entries) {
    if (!entry.kanjiCharacters || !entry.kanjiCharacters.includes(character)) {
      continue;
    }

    const isMultiKanji = entry.kanjiCharacters.length > 1;
    const { compoundType, matchedReading } = classifyCompoundReading(
      character,
      entry.reading,
      onReadings,
      kunReadings,
      isMultiKanji
    );

    const extractedSenses = (entry.senses || []).map((s) => ({
      glosses: (s.glosses || []).map((g) =>
        typeof g === "string" ? g : g.text || ""
      ).filter(Boolean),
    }));

    linkages.push({
      kanjiCharacter: character,
      dictionaryEntryId: entry.id,
      headword: entry.kanjiCharacters.join(""),
      reading: entry.reading,
      compoundType,
      matchedReading,
      senses: extractedSenses,
    });
  }

  return linkages;
}
