/**
 * Stable, API-safe Dictionary domain contracts.
 *
 * Database/Drizzle types never leave repositories. These types are consumed by
 * route handlers, web clients, and future Flutter clients through the API.
 */

export type DictionarySearchKind = "exact" | "prefix" | "contains";

export type DictionarySearchQuery = {
  query: string;
  normalizedQuery: string;
  limit: number;
};

export type DictionarySearchItem = {
  id: number;
  headword: string;
  primaryReading: string;
  firstGloss: string;
  isCommon: boolean;
  match: DictionarySearchKind;
};

export type DictionarySearchResponse = {
  query: string;
  total: number;
  results: DictionarySearchItem[];
};

export type DictionaryForm = {
  text: string;
  common: boolean;
  priorityTags: string[];
  infoTags: string[];
};

export type DictionarySense = {
  glosses: string[];
  partsOfSpeech: string[];
  fields: string[];
  misc: string[];
  dialects: string[];
  info: string;
};

export type DictionaryEnrichment = {
  kind:
    | "furigana"
    | "jlpt"
    | "frequency"
    | "radical"
    | "strokes"
    | "pitch"
    | "conjugation";
  variantKey: string;
  value: Record<string, unknown>;
  derivationMethod: string;
  derivationVersion: string;
  sourceRecordKey: string;
};

export type DictionaryProvenance = {
  source: string;
  sourceId: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  isFixture: boolean;
};

export type DictionaryEntry = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  frequencyRank: number | null;
  jlptLevel: string | null;
  kanji: DictionaryForm[];
  readings: DictionaryForm[];
  senses: DictionarySense[];
  enrichments: DictionaryEnrichment[];
  provenance: DictionaryProvenance | null;
};

export type ApiError = {
  error: {
    code: "INVALID_QUERY" | "INVALID_ID" | "NOT_FOUND" | "INTERNAL_ERROR";
    message: string;
  };
};
