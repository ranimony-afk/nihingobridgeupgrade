export const GRAMMAR_CORE_SOURCE_REF = "first-party:grammar-core:v1";

export const VALID_JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JLPTLevel = (typeof VALID_JLPT_LEVELS)[number];

export function isValidJLPTLevel(level: string): level is JLPTLevel {
  return VALID_JLPT_LEVELS.includes(level as JLPTLevel);
}

export function normalizeJLPTLevel(level: string): JLPTLevel {
  const upper = level.trim().toUpperCase();
  if (isValidJLPTLevel(upper)) return upper;
  const match = upper.match(/N?[1-5]/);
  if (match) {
    const num = match[0].replace("N", "");
    const candidate = `N${num}`;
    if (isValidJLPTLevel(candidate)) return candidate;
  }
  throw new Error(`Invalid JLPT level: ${level}. Must be one of: ${VALID_JLPT_LEVELS.join(", ")}`);
}

export interface GrammarPatternInput {
  id?: string;
  slug: string;
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  formation?: string | null;
  jlptLevel: string;
  commonMistakes?: string[];
  tags?: string[];
  sourceRef?: string;
}

export interface CanonicalGrammarPattern {
  id: string;
  slug: string;
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  formation: string | null;
  jlptLevel: JLPTLevel;
  commonMistakes: string[];
  tags: string[];
  sourceRef: string;
}
