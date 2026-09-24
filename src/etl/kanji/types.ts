import type { JLPTLevel } from "@/etl/grammar/types";

export interface KanjiVocabItem {
  word: string;
  reading: string;
  meaning: string;
}

export interface KanjiRadicalInput {
  id: string; // e.g., "rad-water", "rad-tree"
  character: string;
  altForms?: string[];
  meaning: string;
  readingKun: string;
  readingOn?: string | null;
  strokeCount: number;
  kangxiNumber?: number | null;
  category: "radical" | "primitive";
  typicalRole: "semantic" | "phonetic" | "structural";
  mnemonic?: string | null;
  sourceRef?: string;
}

export interface KanjiCompositionInput {
  kanjiId: string;
  elementId: string;
  role: "semantic" | "phonetic" | "structural" | "positional";
  position?: "left" | "right" | "top" | "bottom" | "enclosure" | "surround" | "integrated" | "inside" | "repeating" | "anywhere" | null;
  renderedAs?: string | null;
  rendering?: string | null;
  orderIndex: number;
  sourceRef?: string;
}

export interface KanjiEntryInput {
  id: string; // e.g., "kanji-rest", "kanji-mountain"
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: JLPTLevel | "N5" | "N4" | "N3" | "N2" | "N1" | "NONE";
  gradeLevel?: number | null;
  primaryRadicalId?: string | null;
  mnemonic?: string | null;
  vocabulary: KanjiVocabItem[];
  sourceRef?: string;
  // Associated composition relations and radicals
  radicals?: KanjiRadicalInput[];
  composition?: KanjiCompositionInput[];
}

export interface KanjiETLResult {
  radicalsProcessed: number;
  radicalsInserted: number;
  radicalsUpdated: number;
  radicalsSkipped: number;
  kanjiProcessed: number;
  kanjiInserted: number;
  kanjiUpdated: number;
  kanjiSkipped: number;
  compositionProcessed: number;
  compositionInserted: number;
  compositionUpdated: number;
  compositionSkipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// KANJIDIC2 Raw & Parsed Types
// ---------------------------------------------------------------------------

export interface RawKanjidicCodepoint {
  type: string; // "ucs", "jis208", "jis212", "jis213"
  value: string;
}

export interface RawKanjidicRadical {
  type: string; // "classical", "nelson_c"
  value: number;
}

export interface RawKanjidicVariant {
  type: string;
  value: string;
}

export interface RawKanjidicMeaning {
  lang: string; // "en", "fr", "es", "pt"
  text: string;
}

export interface RawKanjidicReading {
  type: "ja_on" | "ja_kun" | "pinyin" | "korean_r" | "korean_h" | "vietnam";
  value: string;
}

export interface RawKanjidicCharacter {
  literal: string;
  codepoints: RawKanjidicCodepoint[];
  radicals: RawKanjidicRadical[];
  grade: number | null;
  strokeCounts: number[];
  variants: RawKanjidicVariant[];
  frequency: number | null;
  radicalNames: string[];
  jlptOld: number | null;
  dicRefs: Array<{ type: string; value: string }>;
  queryCodes: Array<{ type: string; value: string }>;
  readings: RawKanjidicReading[];
  meanings: RawKanjidicMeaning[];
  nanori: string[];
}

// ---------------------------------------------------------------------------
// Canonical Transformed KANJIDIC2 Record
// ---------------------------------------------------------------------------

export interface CanonicalKanjiRecord {
  id: string; // e.g. "kanji-学"
  character: string;
  unicode: string; // e.g. "U+5B66"
  hexCodepoint: string; // e.g. "5b66"
  strokeCount: number;
  additionalStrokeCounts: number[];
  gradeLevel: number | null;
  jlptLevel: "N5" | "N4" | "N3" | "N2" | "N1" | "NONE";
  jlptOld: number | null;
  frequencyRank: number | null;
  classicalRadical: number | null;
  nelsonRadical: number | null;
  readingsOn: string[];
  readingsKun: string[]; // with okurigana preserved (e.g. "まな.ぶ")
  normalizedReadingsKun: string[]; // without okurigana (e.g. "まなぶ")
  readingsNanori: string[];
  meanings: string[]; // English meanings
  primaryMeaning: string;
  variants: Array<{ type: string; value: string }>;
  radicalNames: string[];
  sourceRef: string; // "upstream:kanjidic2:2023-08"
}

export interface KanjidicTransformResult {
  record: CanonicalKanjiRecord | null;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface KanjidicDryRunReport {
  sourceId: string;
  sourceRelease: string;
  sourceSha256: string;
  totalRecords: number;
  validRecords: number;
  rejectedRecords: number;
  warningsCount: number;
  onReadingsCount: number;
  kunReadingsCount: number;
  nanoriCount: number;
  kanjiWithMeaningsCount: number;
  kanjiWithJlptCount: number;
  kanjiWithGradeCount: number;
  kanjiWithFrequencyCount: number;
  kanjiWithVariantsCount: number;
  kanjiWithRadicalCount: number;
  strokeCountDistribution: Record<number, number>;
  duplicateCharactersCount: number;
  conflictingRecordsCount: number;
  durationMs: number;
  throughput: number;
  peakHeapMb: number;
  deterministicIdSample: Array<{ char: string; id: string }>;
}
