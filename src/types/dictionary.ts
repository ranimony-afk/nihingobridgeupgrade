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

/* ---------------- Phase 05.3: full detail-page aggregate ------------------ */

export type DictionaryExample = {
  id: number;
  text: string;
  translation: string | null;
  translationLang: string | null;
  /** Per-sentence CC BY attribution. Must be rendered wherever text is shown. */
  attribution: string;
  license: string;
};

export type DictionaryKanjiComponent = {
  id: number;
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  /** KANJIDIC2 legacy 4-level scale — NOT modern N1–N5. */
  jlptOld: number | null;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
};

export type DictionaryRelatedEntry = {
  id: number;
  headword: string;
  primaryReading: string;
  isCommon: boolean;
  reason: "shares_kanji" | "same_reading";
};

/**
 * Audio is modelled explicitly so clients can render an honest state.
 * Tatoeba audio was excluded on licence grounds (Phase 04.4); no licensed
 * pronunciation asset is currently held for any entry.
 */
export type DictionaryAudio =
  | { status: "available"; url: string; attribution: string; license: string }
  | { status: "unavailable"; reason: string };

export type DictionaryEntryDetail = DictionaryEntry & {
  /** Modern N1–N5 labels from provenance-approved sources (source-curated). */
  jlptLevels: string[];
  examples: DictionaryExample[];
  kanjiComponents: DictionaryKanjiComponent[];
  related: DictionaryRelatedEntry[];
  audio: DictionaryAudio;
};

export type ApiError = {
  error: {
    code: "INVALID_QUERY" | "INVALID_ID" | "NOT_FOUND" | "INTERNAL_ERROR";
    message: string;
  };
};
