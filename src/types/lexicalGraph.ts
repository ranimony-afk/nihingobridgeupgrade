/**
 * Phase 14.4A — Takoboto-Class Dictionary Intelligence & Lexical Graph Architecture
 *
 * Formal TypeScript models, controlled taxonomies, and architectural contracts
 * for the interconnected NihongoBridge dictionary knowledge graph.
 */

// ---------------------------------------------------------------------------
// 1. Controlled Taxonomies & Relation Types
// ---------------------------------------------------------------------------

export const SYNONYM_RELATION_TYPES = [
  "EXACT_SYNONYM",
  "NEAR_SYNONYM",
  "FORMAL_SYNONYM",
  "INFORMAL_SYNONYM",
  "WRITTEN_SYNONYM",
  "SPOKEN_SYNONYM",
  "CONTEXTUAL_SYNONYM",
] as const;
export type SynonymRelationType = (typeof SYNONYM_RELATION_TYPES)[number];

export const ANTONYM_RELATION_TYPES = [
  "DIRECT_ANTONYM",
  "CONTEXTUAL_ANTONYM",
  "GRADABLE_OPPOSITE",
  "RECIPROCAL_OPPOSITE",
] as const;
export type AntonymRelationType = (typeof ANTONYM_RELATION_TYPES)[number];

export const COLLOCATION_PATTERNS = [
  "verb_noun",
  "adjective_noun",
  "noun_verb",
  "noun_adjective",
  "adverb_verb",
  "fixed_expression",
] as const;
export type CollocationPattern = (typeof COLLOCATION_PATTERNS)[number];

export const CONTROLLED_CONTEXT_TAGS = [
  "formal",
  "informal",
  "spoken",
  "written",
  "business",
  "academic",
  "casual",
  "literary",
  "archaic",
  "slang",
  "internet",
  "technical",
  "medical",
  "legal",
  "polite",
  "humble",
  "honorific",
  "childrens_speech",
  "female_coded",
  "male_coded",
  "dialect",
] as const;
export type ControlledContextTag = (typeof CONTROLLED_CONTEXT_TAGS)[number];

export const REGISTER_LEVELS = [
  "CASUAL",
  "STANDARD",
  "POLITE",
  "FORMAL",
  "BUSINESS",
  "HONORIFIC",
  "HUMBLE",
] as const;
export type RegisterLevel = (typeof REGISTER_LEVELS)[number];

export const KEIGO_TYPES = [
  "TEINEIGO",      // 丁寧語 (Polite speech, e.g. ます / です)
  "SONKEIGO",      // 尊敬語 (Respectful language elevating the other party, e.g. なさる / 召し上がる)
  "KENJOUGO_I",    // 謙譲語 I (Humble speech directed towards a recipient, e.g. 伺う / 申し上げる)
  "KENJOUGO_II",   // 謙譲語 II / 丁重語 (Courteous speech regardless of recipient, e.g. 参る / いたす)
] as const;
export type KeigoType = (typeof KEIGO_TYPES)[number];

export const READING_TYPES = [
  "onyomi_goon",
  "onyomi_kanon",
  "onyomi_toon",
  "onyomi_kanyon",
  "kunyomi_standard",
  "kunyomi_okurigana",
  "kunyomi_special",
  "jukujikun",
  "ateji",
  "nanori",
  "irregular",
] as const;
export type ReadingType = (typeof READING_TYPES)[number];

export const CONJUGATION_FORMS = [
  "dictionary",
  "masu_present",
  "masu_negative",
  "masu_past",
  "masu_past_negative",
  "te_form",
  "ta_past",
  "nai_negative",
  "nakatta_past_negative",
  "tai_desire",
  "takunai_negative_desire",
  "potential",
  "passive",
  "causative",
  "causative_passive",
  "imperative",
  "volitional",
  "conditional_ba",
  "conditional_tara",
  "conditional_nara",
  "provisional",
  "progressive",
] as const;
export type ConjugationForm = (typeof CONJUGATION_FORMS)[number];

export const VERIFICATION_STATUSES = [
  "machine",
  "review",
  "human_verified",
  "published",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// 2. Multi-Headword & Reading Structures
// ---------------------------------------------------------------------------

export interface OrthographicVariant {
  headword: string;
  isPrimary: boolean;
  priorityRank: number;
  isCommon: boolean;
  orthographyType: "kanji" | "kana" | "historical" | "alternative";
  restrictions?: string[];
}

export interface DetailedLexicalReading {
  reading: string;
  readingType: ReadingType;
  normalizedReading: string;
  romaji: string;
  isPrimary: boolean;
  restrictions?: string[];
  notes?: string | null;
  priorityRank?: number;
}

// ---------------------------------------------------------------------------
// 3. Relational Graph Edge Models
// ---------------------------------------------------------------------------

export interface SynonymRelation {
  id: string;
  sourceEntryId: string;
  targetEntryId: string;
  relationType: SynonymRelationType;
  sourceRef: string;
  confidence: number; // 0.0 to 1.0
  notes?: string | null;
  verificationStatus: VerificationStatus;
  createdAt: Date;
}

export interface AntonymRelation {
  id: string;
  sourceEntryId: string;
  targetEntryId: string;
  relationType: AntonymRelationType;
  sourceRef: string;
  confidence: number;
  notes?: string | null;
  verificationStatus: VerificationStatus;
  createdAt: Date;
}

export interface CollocationRelation {
  id: string;
  primaryEntryId: string;
  collocateEntryId?: string | null;
  expression: string;
  reading: string;
  pattern: CollocationPattern;
  meaning: string;
  exampleSentence?: string | null;
  sourceRef: string;
  verificationStatus: VerificationStatus;
}

export interface PhraseEntity {
  id: string;
  phrase: string;
  reading: string;
  romaji: string;
  meaning: string;
  literalMeaning?: string | null;
  usageNotes?: string | null;
  register: RegisterLevel;
  jlptLevel?: "N5" | "N4" | "N3" | "N2" | "N1" | "NONE";
  linkedDictionaryEntryIds: string[];
  sourceRef: string;
  verificationStatus: VerificationStatus;
}

// ---------------------------------------------------------------------------
// 4. Keigo & Register System
// ---------------------------------------------------------------------------

export interface KeigoRelation {
  id: string;
  standardEntryId: string; // e.g. "de-jmdict-1358280" (食べる)
  keigoEntryId: string;     // e.g. "de-jmdict-1158520" (いただく) or "召し上がる"
  keigoType: KeigoType;
  meaning: string;
  directionality: "speaker_lowering" | "listener_elevating" | "neutral_courteous";
  contextUsage: string;     // e.g. "Used when eating food provided by a host or superior"
  exampleSentence?: {
    japanese: string;
    reading: string;
    english: string;
    tamil?: string;
    malayalam?: string;
  };
  notes?: string | null;
  sourceRef: string;
  verificationStatus: VerificationStatus;
}

export interface RegisterProfile {
  entryId: string;
  formality: RegisterLevel;
  politeness: "casual" | "polite" | "respectful" | "humble";
  respectLevel: 0 | 1 | 2 | 3;
  humilityLevel: 0 | 1 | 2 | 3;
  isBusinessAppropriate: boolean;
  channel: "spoken" | "written" | "both";
  contextTags: ControlledContextTag[];
}

// ---------------------------------------------------------------------------
// 5. Kanji Mind Tree & Decomposition
// ---------------------------------------------------------------------------

export type ReadingClassificationType =
  | "ON"
  | "KUN"
  | "NANORI"
  | "SPECIAL"
  | "JUKUJIKUN"
  | "ATEJI"
  | "IRREGULAR"
  | "UNKNOWN";

export interface KanjiWordEdge {
  id: string; // Deterministic: kanji:${char}:dict:${entryId}:pos:${pos}
  kanji: string;
  kanjiId: string;
  entryId: string;
  headword: string;
  position: number; // 0-based character position in headword
  totalKanji: number;
  wordReading: string;
  readingType: ReadingClassificationType;
  matchedReading: string | null;
  isSolo: boolean;
  isPrefix: boolean;
  isSuffix: boolean;
  jlptLevel: string | null;
  isCommon: boolean;
  frequencyRank: number | null;
  senses: Array<{ glosses: string[] }>;
  sourceRef: string;
  provenance: {
    sourceRef: string;
    derivationType: "lexical_joined" | "source_derived" | "first_party_curated";
    confidence: number;
    verified: boolean;
  };
}

export interface WordKanjiEdge {
  id: string; // Deterministic: word:${entryId}:kanji:${char}:pos:${pos}
  entryId: string;
  headword: string;
  kanji: string;
  kanjiId: string;
  position: number;
  wordReading: string;
  sourceRef: string;
}

export interface KanjiReadingEdge {
  id: string; // Deterministic: kanji:${char}:reading:${readingType}:${reading}
  kanji: string;
  reading: string;
  normalizedReading: string;
  readingType: ReadingClassificationType;
  hasOkurigana: boolean;
  okuriganaStem?: string;
  okuriganaSuffix?: string;
  source: "kanjidic2" | "jmdict" | "first_party";
  sourceRef: string;
}

export interface SpecialReadingRelationship {
  compound: string;
  reading: string;
  type: "jukujikun" | "ateji" | "irregular";
  explanation: string;
  characters: string[];
  sourceRef: string;
}

export interface CompoundQueryFilter {
  position?: "prefix" | "suffix" | "any" | number;
  coOccurringWith?: string; // e.g. contains 食 and 事
  reading?: string;
  jlpt?: string;
  isCommon?: boolean;
  limit?: number;
}

export interface ReadingClassificationResult {
  reading: string;
  normalized: string;
  type: ReadingClassificationType;
  hasOkurigana: boolean;
  okuriganaStem?: string;
  okuriganaSuffix?: string;
  isPrimary?: boolean;
}

export interface KanjiDecompositionNode {
  character: string;
  radical: string;
  radicalNumber: number;
  strokeCount: number;
  primitives: string[];
  compositionType: "left_right" | "top_bottom" | "enclosure" | "single_unit" | "complex";
  sourceRef: string;
  verificationStatus: VerificationStatus;
}

export interface KanjiMindTreeNode {
  character: string;
  meaning: string;
  readings: { on: string[]; kun: string[] };
  radical: string;
  components: string[];
  derivedKanji: string[];
  relatedVocabulary: Array<{
    id: string;
    headword: string;
    reading: string;
    meaning: string;
  }>;
}

export interface KanjiMindTreeModel {
  character: string;
  unicode: string;
  codepoint: string;
  meaning: string;
  meanings: string[];
  strokeCount: number;
  strokeCountAlternatives: number[];
  strokeOrderDiagramSvg?: string | null;
  animatedStrokeSvg?: string | null;
  radical: {
    id: string;
    character: string;
    meaning: string;
    radicalNumber?: number;
  } | null;
  components: Array<{
    id: string;
    character: string;
    role: string;
  }>;
  readings: {
    on: string[];
    kun: string[];
    nanori: string[];
    special: string[];
    all: ReadingClassificationResult[];
  };
  grade: number | null;
  jlpt: string | null;
  frequency: number | null;
  vocabulary: {
    n5: KanjiWordEdge[];
    n4: KanjiWordEdge[];
    n3: KanjiWordEdge[];
    n2: KanjiWordEdge[];
    n1: KanjiWordEdge[];
    other: KanjiWordEdge[];
    totalCount: number;
  };
  compounds: {
    beginsWith: KanjiWordEdge[];
    endsWith: KanjiWordEdge[];
    contains: KanjiWordEdge[];
  };
  neighbors: Array<{
    character: string;
    meaning: string;
    relationship: "shares_radical" | "shares_component" | "similar_strokes";
  }>;
  provenance: {
    sourceRef: string;
    verified: boolean;
  };
}

// ---------------------------------------------------------------------------
// 6. User Custom Lists & Notes (Relational References, Never Duplicated)
// ---------------------------------------------------------------------------

export interface UserCustomList {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  isPublic: boolean;
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCustomListItem {
  id: string;
  listId: string;
  entityType: "dictionary" | "kanji" | "grammar" | "phrase" | "sentence";
  entityId: string; // Deterministic pointer, e.g. "de-jmdict-1358280"
  userNote?: string | null;
  priorityOrder: number;
  createdAt: Date;
}

export interface UserLexicalNote {
  id: string;
  userId: string;
  entityType: "dictionary" | "kanji" | "grammar" | "phrase";
  entityId: string;
  personalNote: string;
  mnemonic?: string | null;
  personalTags: string[];
  isPrivate: true; // Private by default
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// 7. Architectural Safety Guards & Invariants
// ---------------------------------------------------------------------------

/**
 * Architectural invariant: AI generated content can NEVER become canonical directly.
 */
export function canAIOutputBeCanonical(): false {
  return false;
}

/**
 * Verifies that a context tag belongs strictly to the controlled taxonomy.
 */
export function isControlledContext(tag: string): tag is ControlledContextTag {
  return (CONTROLLED_CONTEXT_TAGS as readonly string[]).includes(tag);
}

/**
 * Enforces provenance compliance: no external entity or relationship may exist
 * without an active source reference.
 */
export function validateProvenanceRequired(obj: { sourceRef?: string | null }): boolean {
  if (!obj.sourceRef || obj.sourceRef.trim().length === 0) {
    throw new Error("Linguistic Architecture Violation: sourceRef is required for all knowledge graph entities.");
  }
  return true;
}

/**
 * Enforces user reference isolation: custom list items and notes must reference
 * existing canonical IDs rather than duplicating underlying dictionary entries.
 */
export function assertEntityReferenceOnly(item: {
  entityId: string;
  duplicatedPayload?: unknown;
}): boolean {
  if (item.duplicatedPayload !== undefined) {
    throw new Error(
      "Architectural Invariant Violation: Custom lists and user notes must reference entityId and must not clone canonical data."
    );
  }
  return Boolean(item.entityId && item.entityId.length > 0);
}
