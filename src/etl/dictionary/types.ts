/**
 * Schema types, mappings, and validation for Dictionary Ingestion Pipeline.
 * Phase 14.2: Production-grade Dictionary ETL Foundation.
 */

import type { ETLDryRunManifest } from "@/services/knowledge/provenance";
import {
  JMDICT_EDRDG_ATTRIBUTION,
  JMDICT_LICENSE,
  JMDICT_LICENSE_QUALIFICATION,
} from "./jmdictContract";

export const JMDICT_SOURCE_REF = "upstream:jmdict:2024-07";
export const LEGACY_JMDICT_SOURCE_REF = "jmdict:edrdg:2024-07";

export const JMDICT_KNOWLEDGE_SOURCE = {
  id: JMDICT_SOURCE_REF,
  name: "JMdict Japanese-Multilingual Dictionary",
  version: "2024-07",
  license: JMDICT_LICENSE,
  url: "https://www.edrdg.org/jmdict/j_jmdict.html",
  description:
    `Comprehensive Japanese-English dictionary with part-of-speech, readings, frequency markings, and glosses from the ${JMDICT_EDRDG_ATTRIBUTION}. ${JMDICT_LICENSE_QUALIFICATION}`,
  domain: "dictionary" as const,
};

export interface DictionarySenseData {
  glosses: string[];
  note?: string | null;
}

/**
 * Canonical dictionary entry matching src/db/schema.ts dictionary_entries row.
 */
export interface CanonicalDictionaryEntry {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  frequencyRank: number | null;
  partsOfSpeech: string[];
  senses: DictionarySenseData[];
  kanjiCharacters: string[];
  tags: string[];
  sourceRef: string;
}

/**
 * Diagnostic severity levels.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * Structured diagnostic produced across ETL pipeline stages.
 */
export interface ETLDiagnostic {
  entSeq?: string;
  stage:
    | "parse"
    | "normalize"
    | "transform"
    | "validate"
    | "deduplicate"
    | "provenance"
    | "persist";
  severity: DiagnosticSeverity;
  field?: string;
  code: string;
  message: string;
  value?: unknown;
}

/* ============================================================
 * PIPELINE STAGE TYPES
 * ============================================================ */

/** Stage 1: Raw record input (XML snippet or raw parsed JSON) */
export interface RawJMdictKanji {
  keb: string;
  keInf?: string[];
  kePri?: string[];
}

export interface RawJMdictReading {
  reb: string;
  reNoKanji?: boolean;
  reRestr?: string[];
  reInf?: string[];
  rePri?: string[];
}

export interface RawJMdictGloss {
  lang?: string;
  text: string;
}

export interface RawJMdictSense {
  pos: string[];
  misc?: string[];
  dial?: string[];
  field?: string[];
  sInf?: string;
  stagk?: string[];
  stagr?: string[];
  glosses: RawJMdictGloss[];
}

export interface RawJMdictSourceRecord {
  entSeq: string;
  kanji: RawJMdictKanji[];
  readings: RawJMdictReading[];
  senses: RawJMdictSense[];
  jlptLevel?: string;
  frequencyRank?: number;
}

/** Stage 2: Parsed record with validated structure */
export interface ParsedJMdictEntry extends RawJMdictSourceRecord {
  isParsed: true;
}

/** Stage 3: Normalized record (Unicode NFKC, trimmed, orthographies identified) */
export interface NormalizedJMdictEntry {
  entSeq: string;
  primaryHeadword: string;
  alternativeHeadwords: string[];
  primaryReading: string;
  alternativeReadings: string[];
  readingRestrictions: Array<{ reading: string; targetHeadword: string }>;
  isKanaOnly: boolean;
  rawPosList: string[];
  senses: Array<{
    pos: string[];
    glosses: string[];
    multilingualGlosses?: Array<{ lang: string; text: string }>;
    note: string | null;
    fieldTags: string[];
    miscTags: string[];
    dialTags: string[];
  }>;
  priorityTags: string[];
  isCommon: boolean;
  frequencyRank: number | null;
  rawJlptLevel?: string;
}

/** Stage 4: Transformed entry mapped to canonical platform representations */
export interface TransformedDictionaryEntry {
  id: string; // de-jmdict-${entSeq}
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  frequencyRank: number | null;
  partsOfSpeech: string[];
  senses: DictionarySenseData[];
  kanjiCharacters: string[];
  tags: string[];
  sourceRef: string;
  alternativeHeadwords: string[];
  alternativeReadings: string[];
}

/** Stage 5: Validated entry after passing schema rules */
export interface ValidatedDictionaryEntry extends TransformedDictionaryEntry {
  isValid: true;
}

/** Stage 6: Deduplicated entry */
export interface DeduplicatedDictionaryEntry extends ValidatedDictionaryEntry {
  dedupedAt: number;
}

/** Stage 7 & 8: Persistence candidate ready for database insertion */
export type PersistenceCandidate = CanonicalDictionaryEntry;

/* ============================================================
 * PART OF SPEECH MAPPING
 * ============================================================ */

/**
 * Complete EDRDG JMdict part-of-speech entity abbreviations mapped to
 * standardized human-readable names.
 */
export const POS_CODE_MAP: Record<string, string> = {
  n: "noun",
  "n-adv": "adverbial noun",
  "n-pr": "proper noun",
  "n-pref": "noun prefix",
  "n-suf": "noun suffix",
  "n-t": "temporal noun",
  v1: "ichidan verb",
  "v1-s": "ichidan verb (kureru special)",
  v5k: "godan verb (ku)",
  "v5k-s": "godan verb (iku/yuku special)",
  v5s: "godan verb (su)",
  v5t: "godan verb (tsu)",
  v5n: "godan verb (nu)",
  v5m: "godan verb (mu)",
  v5r: "godan verb (ru)",
  "v5r-i": "godan verb (ru irregular)",
  v5b: "godan verb (bu)",
  v5g: "godan verb (gu)",
  v5u: "godan verb (u)",
  "v5u-s": "godan verb (u special)",
  v5z: "godan verb (zu)",
  "v5aru": "godan verb (-aru special)",
  vi: "intransitive verb",
  vt: "transitive verb",
  vs: "suru verb",
  "vs-i": "suru verb (irregular)",
  "vs-s": "suru verb (special)",
  "vs-c": "su verb (precursor to suru)",
  vk: "kuru verb",
  vz: "ichidan verb (zuru)",
  "adj-i": "i-adjective",
  "adj-ix": "i-adjective (yoi/ii irregular)",
  "adj-na": "na-adjective",
  "adj-no": "no-adjective",
  "adj-pn": "pre-noun adjectival",
  "adj-t": "taru adjective",
  "adj-f": "prenominal noun/verb",
  adv: "adverb",
  "adv-to": "adverb taking to",
  aux: "auxiliary",
  "aux-v": "auxiliary verb",
  "aux-adj": "auxiliary adjective",
  cop: "copula",
  exp: "expression",
  int: "interjection",
  prt: "particle",
  pn: "pronoun",
  num: "numeric",
  ctr: "counter",
  suf: "suffix",
  pref: "prefix",
  conj: "conjunction",
  unc: "unclassified",
};

export interface PosMappingResult {
  mapped: string[];
  diagnostics: ETLDiagnostic[];
}

export function normalizePosWithDiagnostics(
  rawCodes: string[],
  entSeq?: string
): PosMappingResult {
  const mapped = new Set<string>();
  const diagnostics: ETLDiagnostic[] = [];

  for (const raw of rawCodes) {
    const clean = raw.trim().toLowerCase().replace(/^&|;$/g, "");
    const found = POS_CODE_MAP[clean];
    if (found) {
      mapped.add(found);
    } else {
      mapped.add(clean);
      diagnostics.push({
        entSeq,
        stage: "transform",
        severity: "warning",
        field: "partsOfSpeech",
        code: "UNKNOWN_POS_CODE",
        message: `Unknown JMdict POS code: "${raw}". Preserving raw code.`,
        value: raw,
      });
    }
  }

  return {
    mapped: [...mapped],
    diagnostics,
  };
}

export function normalizePos(rawCodes: string[]): string[] {
  return normalizePosWithDiagnostics(rawCodes).mapped;
}

/* ============================================================
 * JLPT NORMALIZATION
 * ============================================================ */

export const VALID_JLPT_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1", "NONE"]);

export function normalizeJlpt(rawLevel: string | undefined | null): string {
  if (!rawLevel) return "NONE";
  const upper = rawLevel.trim().toUpperCase();
  if (VALID_JLPT_LEVELS.has(upper)) return upper;
  const match = upper.match(/N?[1-5]/);
  if (match) {
    const num = match[0].replace("N", "");
    return `N${num}`;
  }
  return "NONE";
}

/* ============================================================
 * KANJI CHARACTER EXTRACTION
 * ============================================================ */

/** CJK Unified Ideographs regex */
const KANJI_REGEX = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

export function extractKanjiCharacters(text: string): string[] {
  const matches = text.match(KANJI_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

/* ============================================================
 * PIPELINE OPTIONS & EXECUTION REPORT
 * ============================================================ */

export interface DictionaryPipelineOptions {
  sourceId?: string;
  sourceRecords?: RawJMdictSourceRecord[];
  xmlInput?: string;
  limit?: number;
  batchSize?: number;
  dryRun?: boolean;
  /** Default abort. Update is applied only when the caller sets "update". */
  conflictPolicy?: "abort" | "update";
}

export interface DictionaryETLReport {
  sourceId: string;
  sourceVersion: string;
  sourceRecords: number;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ entSeq?: string; message?: string; issues?: any }>;
  diagnostics: ETLDiagnostic[];
  isDryRun: boolean;
  durationMs: number;
  sampleRecords: CanonicalDictionaryEntry[];
  dryRunManifest?: ETLDryRunManifest;
}

/* ============================================================
 * PERSISTENCE ADAPTER CONTRACT
 * ============================================================ */

export interface PersistenceBatchResult {
  batchSize: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors?: Array<{ id: string; error: string }>;
}

/**
 * Backward compatibility alias for PersistenceBatchResult.
 */
export type BatchLoadResult = PersistenceBatchResult;

export interface DictionaryPersistenceAdapter {
  upsertBatch(
    candidates: PersistenceCandidate[],
    options?: { dryRun?: boolean; conflictPolicy?: "abort" | "update"; injectFailureAfterWrites?: boolean }
  ): Promise<PersistenceBatchResult>;
  getExistingByIds(ids: string[]): Promise<Map<string, PersistenceCandidate>>;
  count(): Promise<number>;
}
