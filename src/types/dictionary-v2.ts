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

export type DictionaryV2Entry = DictionaryEntry & {
  apiVersion: "v2";
};

export type DictionaryV2ErrorCode =
  | "INVALID_QUERY"
  | "INVALID_ID"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type DictionaryV2ApiError = {
  error: { code: DictionaryV2ErrorCode; message: string };
};
