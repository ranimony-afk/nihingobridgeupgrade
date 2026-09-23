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
  jlptLevel: JLPTLevel | "N5" | "N4" | "N3" | "N2" | "N1";
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
