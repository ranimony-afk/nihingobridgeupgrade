import type { KanjiSummary, VocabularyEntry } from "@/types/knowledge";

export type GrammarRelationKind =
  | "prerequisite"
  | "similar"
  | "contrast"
  | "related"
  | "variant";

export interface GrammarPatternSummary {
  id: number;
  pattern: string;
  /** Literal surface form used by the ETL to harvest corpus evidence */
  matchText: string;
  isCore: boolean;
  note: string | null;
}

export interface GrammarExampleMatch {
  matchedText: string;
  startIndex: number;
  endIndex: number;
}

export interface GrammarExample {
  id: number;
  japanese: string;
  english: string;
  externalId: string | null;
  length: number;
  matches: GrammarExampleMatch[];
}

export interface GrammarRelatedPoint {
  id: number;
  slug: string;
  title: string;
  titleEn: string | null;
  relation: GrammarRelationKind;
  /** true when the relation was declared on the other point */
  inbound: boolean;
  /** hops from the root point (1 = directly related) */
  depth: number;
  note: string | null;
}

export interface GrammarPointSummary {
  id: number;
  slug: string;
  title: string;
  titleEn: string | null;
  summary: string | null;
  jlptLevel: number | null;
  register: string;
  exampleCount: number;
  tags: string[];
  patterns: string[];
}

export interface GrammarStructure {
  id: number;
  position: number;
  label: string;
  content: string;
  required: boolean;
  note: string | null;
}

export interface GrammarMistake {
  id: number;
  position: number;
  incorrect: string;
  correction: string;
  explanation: string;
  severity: "common" | "subtle" | "critical";
}

export interface GrammarNeighbour {
  slug: string;
  title: string;
  direction: "previous" | "next";
}

export interface GrammarPointDetail extends GrammarPointSummary {
  /** Ordered structural slots ("[V-て] + しまう") */
  structures: GrammarStructure[];
  /** Curated learner errors */
  mistakes: GrammarMistake[];
  neighbours: GrammarNeighbour[];
  explanation: string | null;
  formation: string | null;
  notes: string | null;
  patternDetails: GrammarPatternSummary[];
  examples: GrammarExample[];
  related: GrammarRelatedPoint[];
  kanji: KanjiSummary[];
  vocabulary: VocabularyEntry[];
  provenance: Array<{ code: string; name: string; license: string }>;
}

export interface GrammarCatalog {
  total: number;
  results: GrammarPointSummary[];
  tookMs: number;
  filters: {
    query: string | null;
    jlptLevel: number | null;
    tag: string | null;
    register: string | null;
    sort: string;
  };
}

export interface GrammarStats {
  points: number;
  patterns: number;
  examples: number;
  matches: number;
  relations: number;
  byLevel: Array<{ jlptLevel: number | null; total: number }>;
  sources: number;
}
