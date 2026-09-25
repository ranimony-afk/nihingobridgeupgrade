export const GRAMMAR_CORE_SOURCE_REF = "first-party:grammar-core:v1";

export const VALID_JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JLPTLevel = (typeof VALID_JLPT_LEVELS)[number];

export function isValidJLPTLevel(level: string): level is JLPTLevel {
  return VALID_JLPT_LEVELS.includes(level as JLPTLevel);
}

/**
 * Normalizes a raw JLPT designator to a canonical level, or throws.
 *
 * ## Gate A1 — anchoring
 *
 * This function previously fell back to an unanchored `upper.match(/N?[1-5]/)`,
 * the same defect that existed in `src/etl/dictionary/types.ts`. It searched for
 * any digit 1–5 anywhere in the string, so `"2024-07"` produced `"N2"` and
 * `"v1.5"` produced `"N1"` — a JLPT classification invented from text that is not
 * a level. Here the invented value is worse than in the dictionary path, because
 * this function's callers treat a returned value as *validated*: the kanji
 * transformer stores it, and `GrammarService.listPatterns` would filter database
 * rows by it.
 *
 * The match is now anchored, so **the whole trimmed string** must be a level
 * token. Accepted forms:
 *
 * | Input | Class | Result |
 * | :--- | :--- | :--- |
 * | `"N5"` … `"N1"` | explicit | same value |
 * | `"n5"` | explicit | `"N5"` — case-insensitive |
 * | `"5"` … `"1"` | shorthand | `"N5"` … `"N1"` — retained, pinned by test |
 * | anything else | malformed | **throws** |
 *
 * The throwing contract is unchanged and is deliberate: unlike
 * `normalizeJlpt` (dictionary), which returns the `"NONE"` sentinel and is used in
 * paths where `jlpt_level` is `NOT NULL`, this function is used where a *valid*
 * level is required, so rejecting is more honest than substituting. Callers that
 * need a non-throwing path catch the error — `transformGrammarPattern` already
 * does, and reports it as a field error.
 *
 * Note that `"N6"` and `"invalid"` still throw, exactly as before.
 */
export function normalizeJLPTLevel(level: string): JLPTLevel {
  const upper = level.trim().toUpperCase();
  if (isValidJLPTLevel(upper)) return upper;
  // Anchored: a bare digit is a level, a digit embedded in other text is not.
  const shorthand = /^([1-5])$/.exec(upper);
  if (shorthand) {
    const candidate = `N${shorthand[1]}`;
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
