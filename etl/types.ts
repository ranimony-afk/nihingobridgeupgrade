/**
 * Shared ETL types — the contracts between pipeline stages.
 */

// ─────────────────────────────────────────────
// Pipeline infrastructure
// ─────────────────────────────────────────────

export interface ImportRunReport {
  runId: string;
  sourceId: string;
  sourceName: string;
  sourceVersion: string;
  pipelineVersion: string;
  status: "success" | "partial" | "failed";
  startedAt: Date;
  completedAt: Date;
  counts: {
    parsed: number;
    validated: number;
    skippedUnchanged: number;
    inserted: number;
    updated: number;
    errors: number;
  };
  errors: ValidationError[];
  durationMs: number;
}

export interface ValidationError {
  sourceId: string;
  field: string;
  message: string;
  value?: unknown;
}

export interface Checkpoint {
  pipelineId: string;
  cursor: string;
  processedCount: number;
  savedAt: Date;
}

// ─────────────────────────────────────────────
// Parsed data (output of parsers, input to transforms)
// ─────────────────────────────────────────────

/** Raw JMdict entry as parsed from XML. */
export interface JMdictEntryRaw {
  entSeq: string;
  kanjiElements: Array<{
    keb: string;
    keInf: string[];
    kePri: string[];
  }>;
  readingElements: Array<{
    reb: string;
    reRestr: string[];
    reInf: string[];
    rePri: string[];
  }>;
  senses: Array<{
    pos: string[];
    gloss: Array<{ lang: string; text: string }>;
    field: string[];
    misc: string[];
    sInf: string[];
    dial: string[];
  }>;
}

/** Raw KANJIDIC2 entry as parsed from XML. */
export interface KanjidicEntryRaw {
  literal: string;
  codepoint: string;
  radical: number | null;
  grade: number | null;
  strokeCount: number;
  frequency: number | null;
  jlpt: number | null;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  nanori: string[];
}

/** Raw Tatoeba sentence pair. */
export interface TatoebaSentenceRaw {
  id: string;
  lang: string;
  text: string;
  translationId?: string;
  translationLang?: string;
  translationText?: string;
}

// ─────────────────────────────────────────────
// Canonical records (output of transforms, input to adapters)
// ─────────────────────────────────────────────

/** Base provenance fields required on every knowledge record. */
export interface ProvenanceFields {
  source: string;
  sourceId: string;
  sourceVersion: string;
  importVersion: string;
  checksum: string;
}

export interface DictionaryEntryCanonical extends ProvenanceFields {
  id: string;
  headword: string;
  reading: string;
  isCommon: boolean;
  jlptLevel: number | null;
  frequencyRank: number | null;
  pos: string[] | null;
  senses: DictionarySenseCanonical[];
  readings: DictionaryReadingCanonical[];
}

export interface DictionarySenseCanonical {
  id: string;
  position: number;
  glosses: Record<string, string[]>;
  pos: string[] | null;
  field: string[] | null;
  misc: string[] | null;
  info: string | null;
  dialect: string[] | null;
}

export interface DictionaryReadingCanonical {
  id: string;
  reading: string;
  isPrimary: boolean;
  restrictions: string[] | null;
  info: string[] | null;
}

export interface KanjiEntryCanonical extends ProvenanceFields {
  id: string;
  character: string;
  unicodeCodepoint: string;
  strokeCount: number;
  grade: number | null;
  jlptLevel: number | null;
  frequencyRank: number | null;
  meanings: string[];
  onReadings: string[] | null;
  kunReadings: string[] | null;
  nanori: string[] | null;
  radicalNumber: number | null;
  readings: KanjiReadingCanonical[];
}

export interface KanjiReadingCanonical {
  id: string;
  kind: "on" | "kun" | "nanori";
  reading: string;
}

export interface SentenceCanonical extends ProvenanceFields {
  id: string;
  japanese: string;
  reading: string | null;
  jlptLevel: number | null;
  translations: SentenceTranslationCanonical[];
}

export interface SentenceTranslationCanonical {
  id: string;
  lang: string;
  translation: string;
  source: string | null;
}
