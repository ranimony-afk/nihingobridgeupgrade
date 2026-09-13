/**
 * Version 2 Kanji API contracts.
 *
 * These types contain no Drizzle-inferred shapes so web and future Flutter
 * clients can consume them without duplicating persistence logic.
 *
 * IMPORTANT JLPT NOTE: KANJIDIC2 ships the LEGACY 4-level JLPT scale
 * (jlpt_old, 1–4), which is NOT the modern N1–N5 scale. It is exposed only as
 * `jlptLegacy` and must never be rendered as an N-level. Modern N-levels come
 * exclusively from approved enrichment provenance, and no such source has been
 * reviewed yet, so `jlptLevels` is expected to be empty until one is.
 */

import type { JlptLevel } from "@/types/dictionary-v2";

export type KanjiMatchField = "literal" | "meaning" | "reading";

export type KanjiSearchQuery = {
  /** A kanji literal, an English meaning, or a kana/romaji reading. */
  query: string | null;
  normalizedQuery: string | null;
  /** Complete romaji→kana conversion, when the input was wholly convertible. */
  romajiKana: string | null;
  /** Exact stroke count. */
  strokes: number | null;
  /** 1–6 kyouiku, 8 jouyou, 9–10 jinmeiyou. */
  grade: number | null;
  /** Kangxi/classical radical number (1–214). */
  radical: number | null;
  /** Source-curated modern N1–N5 label from approved enrichment runs. */
  jlpt: JlptLevel | null;
  /** Reverse lookup: kanji containing this single component character. */
  component: string | null;
  /**
   * Multi-radical lookup: kanji containing EVERY one of these components
   * (AND semantics). Empty unless `components=` was supplied.
   */
  components: string[];
  limit: number;
  offset: number;
};

export type KanjiSearchItem = {
  literal: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount: number | null;
  grade: number | null;
  frequencyRank: number | null;
  jlptLevels: JlptLevel[];
  matchedFields: KanjiMatchField[];
};

export type KanjiSearchResponse = {
  apiVersion: "v2";
  query: string | null;
  filters: {
    strokes: number | null;
    grade: number | null;
    radical: number | null;
    jlpt: JlptLevel | null;
    component: string | null;
    components: string[];
  };
  total: number;
  offset: number;
  limit: number;
  results: KanjiSearchItem[];
};

export type KanjiRadical = {
  system: "kangxi-classical" | "nelson_c" | string;
  number: number;
};

export type KanjiVocabularyItem = {
  id: number;
  headword: string;
  primaryReading: string;
  firstGloss: string;
};

export type KanjiDetail = {
  apiVersion: "v2";
  literal: string;
  codepointUcs: string;
  strokeCount: number | null;
  strokeMiscounts: number[];
  grade: number | null;
  frequencyRank: number | null;
  /**
   * KANJIDIC2's legacy 4-level JLPT scale. NOT a modern N1–N5 level and must
   * not be displayed as one.
   */
  jlptLegacy: number | null;
  /** Modern N1–N5 labels from approved enrichment provenance. */
  jlptLevels: JlptLevel[];
  radicals: KanjiRadical[];
  /** KRADFILE component decomposition (kanji → components). */
  components: string[];
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  otherReadings: { type: string; value: string }[];
  nanori: string[];
  variants: { type: string; value: string }[];
  /** Dictionary words whose headword contains this kanji. */
  vocabulary: KanjiVocabularyItem[];
  provenance: {
    source: string;
    sourceUrl: string;
    license: string;
    attribution: string;
    checksumSha256: string;
    checksumVerified: boolean;
    isFixture: boolean;
  } | null;
};

export type KanjiErrorCode =
  | "INVALID_QUERY"
  | "INVALID_LITERAL"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type KanjiApiError = {
  error: { code: KanjiErrorCode; message: string };
};
