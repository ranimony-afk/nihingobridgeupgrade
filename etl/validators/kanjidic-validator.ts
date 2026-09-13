/**
 * Validation for KANJIDIC2 records. Rejected rows are sampled, never written.
 */

import type { NormalizedCharacter } from "../transforms/kanjidic-transform";
import { isKanjiLiteral } from "../transforms/kanjidic-transform";
import type { ValidationIssue } from "./jmdict-validator";

export type { ValidationIssue };

export function validateCharacter(c: NormalizedCharacter): ValidationIssue | null {
  if (c.literal.length === 0) {
    return { sourceId: "(empty)", reason: "character has no literal" };
  }
  if (!isKanjiLiteral(c.literal)) {
    return {
      sourceId: c.literal,
      reason: "literal is not a single CJK ideograph",
    };
  }
  if (c.strokeCount === null) {
    return { sourceId: c.literal, reason: "character has no stroke_count" };
  }
  if (c.strokeCount < 1 || c.strokeCount > 64) {
    return {
      sourceId: c.literal,
      reason: `implausible stroke_count: ${c.strokeCount}`,
    };
  }
  if (c.grade !== null && !(c.grade >= 1 && c.grade <= 10)) {
    return { sourceId: c.literal, reason: `grade out of range: ${c.grade}` };
  }
  // KANJIDIC2 uses the legacy 4-level JLPT scale here, not modern N1-N5.
  if (c.jlptOld !== null && !(c.jlptOld >= 1 && c.jlptOld <= 4)) {
    return { sourceId: c.literal, reason: `legacy jlpt out of range: ${c.jlptOld}` };
  }
  if (c.readings.length === 0 && c.meanings.length === 0) {
    return {
      sourceId: c.literal,
      reason: "character has neither readings nor meanings",
    };
  }
  return null;
}
