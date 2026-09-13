/**
 * Version 2 dictionary API contracts.
 *
 * `q` may be Japanese text, kana, Hepburn-style romaji, or English.
 * `jlpt` is an optional N1–N5 source-curated filter. It is never described as
 * an official JLPT syllabus because no current fixed official item list exists.
 */

import type {
  DictionaryEntry,
  DictionarySearchItem,
} from "@/types/dictionary";

export type JlptLevel = "N1" | "N2" | "N3" | "N4" | "N5";

export type DictionaryV2SearchQuery = {
  rawQuery: string | null;
  normalizedQuery: string | null;
  /** Original literal query and, for complete romaji conversion, kana form. */
  searchTerms: string[];
  /** Null unless the input had a complete safe romaji-to-kana conversion. */
  romajiKana: string | null;
  limit: number;
  jlptLevel: JlptLevel | null;
};

export type DictionaryV2MatchField =
  | "japanese"
  | "kana"
  | "romaji"
  | "english";

export type DictionaryV2SearchItem = DictionarySearchItem & {
  matchedFields: DictionaryV2MatchField[];
  jlptLevels: JlptLevel[];
};

export type DictionaryV2SearchResponse = {
  apiVersion: "v2";
  query: string | null;
  filters: { jlpt: JlptLevel | null };
  total: number;
  results: DictionaryV2SearchItem[];
};

/** Kanji breakdown for each ideograph in a headword. */
export type DictionaryV2KanjiComponent = {
  literal: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount: number | null;
  grade: number | null;
  /**
   * KANJIDIC2 ships the LEGACY 4-level JLPT scale, not modern N1–N5. It is
   * exposed here only as a clearly-labelled legacy field and must never be
   * rendered as an N-level.
   */
  jlptOld: number | null;
};

/**
 * Example sentence from the sentence corpus.
 *
 * `attribution` and `license` are REQUIRED — Tatoeba text is CC BY 2.0 FR and
 * each sentence must be attributed to its contributor wherever it is shown.
 */
export type DictionaryV2Example = {
  id: number;
  japanese: string;
  translation: string | null;
  attribution: string;
  license: string;
};

export type DictionaryV2RelatedItem = {
  id: number;
  headword: string;
  primaryReading: string;
  firstGloss: string;
  relation: "shared-kanji" | "shared-reading";
};

export type DictionaryV2Entry = DictionaryEntry & {
  apiVersion: "v2";
  /** Source-curated N1–N5 labels from approved enrichment provenance. */
  jlptLevels: JlptLevel[];
  kanjiComponents: DictionaryV2KanjiComponent[];
  examples: DictionaryV2Example[];
  related: DictionaryV2RelatedItem[];
};

export type DictionaryV2ErrorCode =
  | "INVALID_QUERY"
  | "INVALID_ID"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type DictionaryV2ApiError = {
  error: { code: DictionaryV2ErrorCode; message: string };
};
