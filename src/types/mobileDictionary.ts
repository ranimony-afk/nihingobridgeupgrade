/**
 * Phase 14.4A — Flutter/Android Mobile Dictionary API Contracts
 *
 * Defines the request/response payloads, card view abstractions, swipe section
 * models, and versioned offline sync contracts for the future NihongoBridge Flutter app.
 */

import type { SupportedLanguage } from "./translation";
import type { RegisterLevel, KeigoType, ConjugationForm } from "./lexicalGraph";

// ---------------------------------------------------------------------------
// 1. Mobile Search & Card Abstractions
// ---------------------------------------------------------------------------

export interface MobileSearchFilters {
  jlptLevel?: "N5" | "N4" | "N3" | "N2" | "N1";
  isCommon?: boolean;
  partsOfSpeech?: string[];
  hasKanji?: boolean;
  hasExamples?: boolean;
  hasKeigo?: boolean;
  register?: RegisterLevel;
}

export interface MobileSearchRequest {
  query: string;
  detectedScript?: "japanese" | "kana" | "kanji" | "romaji" | "english" | "tamil" | "malayalam";
  filters?: MobileSearchFilters;
  limit?: number;
  offset?: number;
  targetLanguage?: SupportedLanguage;
}

export interface MobileDictionaryEntryCard {
  id: string; // e.g. "de-jmdict-1358280"
  headword: string;
  reading: string;
  romaji: string;
  primaryGlosses: string[];
  localizedGlosses?: Record<SupportedLanguage, string[]>;
  jlptLevel: string;
  isCommon: boolean;
  isKeigo: boolean;
  keigoType?: KeigoType | null;
  hasAudio: boolean;
  audioUrl?: string | null;
  kanjiCharacters: string[];
}

export interface MobileSearchResponse {
  query: string;
  results: MobileDictionaryEntryCard[];
  totalResults: number;
  executionTimeMs: number;
  page: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// 2. Mobile Entry Detail & Swipe Sections
// ---------------------------------------------------------------------------

export interface MobileSwipeSectionMeaning {
  order: number;
  partsOfSpeech: string[];
  glosses: string[];
  localizedGlosses: Record<string, string[]>;
  contextTags: string[];
  notes?: string | null;
}

export interface MobileSwipeSectionConjugation {
  form: ConjugationForm;
  nameJa: string;
  nameEn: string;
  affirmative: string;
  affirmativeReading: string;
  negative: string;
  negativeReading: string;
  politeness: "casual" | "polite";
}

export interface MobileSwipeSectionKeigo {
  standardForm: string;
  teineigo: string[];
  sonkeigo: string[];
  kenjougo: string[];
  businessExample?: {
    japanese: string;
    reading: string;
    english: string;
    tamil?: string;
    malayalam?: string;
  };
}

export interface MobileSwipeSectionKanji {
  character: string;
  meaning: string;
  readings: { on: string[]; kun: string[] };
  strokeCount: number;
  strokeOrderSvgUrl?: string;
  radical: string;
  visualAsset?: KanjiVisualAsset;
}

// ---------------------------------------------------------------------------
// 2.1 Mobile Visual Kanji & Stroke Order Contract (Phase 14.4D)
// ---------------------------------------------------------------------------

export interface MobileVisualStroke {
  order: number;
  id: string;
  path: string;
  type?: string;
}

export interface MobileVisualComponent {
  element: string;
  position?: string | null;
  radical?: string | null;
}

export interface KanjiVisualAsset {
  character: string;
  canonicalKanjiId: string;
  sourceRef: string;
  svg: string;
  viewBox: string;
  strokeCount: number;
  strokes: MobileVisualStroke[];
  components: MobileVisualComponent[];
  primaryRadical?: {
    element: string;
    type: string;
    position?: string | null;
  } | null;
  version: string;
}

export interface MobileSwipeSectionSentence {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  tamil?: string;
  malayalam?: string;
  sourceRef: string;
  difficulty?: string;
}

export interface MobileDictionaryDetailResponse {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  alternativeHeadwords: string[];
  alternativeReadings: string[];
  meanings: MobileSwipeSectionMeaning[];
  conjugations?: MobileSwipeSectionConjugation[];
  keigo?: MobileSwipeSectionKeigo;
  kanjiList: MobileSwipeSectionKanji[];
  exampleSentences: MobileSwipeSectionSentence[];
  synonyms: Array<{ id: string; headword: string; reading: string; relationType: string }>;
  antonyms: Array<{ id: string; headword: string; reading: string; relationType: string }>;
  phrases: Array<{ id: string; phrase: string; meaning: string }>;
  collocations: Array<{ expression: string; meaning: string }>;
  userState?: {
    isBookmarked: boolean;
    userLists: string[];
    hasPersonalNote: boolean;
    srsStatus?: "new" | "learning" | "review" | "mastered";
  };
  provenance: {
    sourceId: string;
    license: string;
    attribution: string;
  };
}

// ---------------------------------------------------------------------------
// 3. Versioned Offline Sync Contracts (Future Flutter Ready)
// ---------------------------------------------------------------------------

export interface MobileSyncDatasetManifest {
  manifestVersion: string;
  datasetName: "jmdict_core" | "kanji_core" | "tatoeba_sentences" | "keigo_relations";
  upstreamVersion: string;
  releaseDate: string;
  recordCount: number;
  uncompressedSizeBytes: number;
  archiveSizeBytes: number;
  archiveSha256: string;
  downloadUrl: string;
  deltaSupport: boolean;
  deltaBaseVersion?: string | null;
  deltaPatchUrl?: string | null;
  deltaPatchSha256?: string | null;
}

export interface MobileIncrementalSyncRequest {
  datasetName: string;
  clientCurrentVersion: string;
  clientLastSyncTimestamp: string;
}

export interface MobileIncrementalSyncResponse {
  datasetName: string;
  updateAvailable: boolean;
  syncType: "delta_patch" | "full_rebuild" | "up_to_date";
  targetVersion: string;
  patchSizeBytes?: number;
  patchSha256?: string;
  downloadUrl?: string;
}
