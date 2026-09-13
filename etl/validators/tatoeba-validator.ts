/**
 * Validation for Tatoeba sentences.
 *
 * Two classes of rule:
 *  - LICENCE rules (C1/C2): a row without a usable attribution is rejected.
 *  - QUALITY rules (C4): Tatoeba explicitly advises filtering before exposing
 *    sentences to learners.
 */

import type { NormalizedSentence } from "../transforms/tatoeba-transform";
import type { ValidationIssue } from "./jmdict-validator";

export type { ValidationIssue };

export const MIN_CHARS = 1;
export const MAX_CHARS = 300;

/** ISO 639-3 is three lowercase letters (Tatoeba also emits "unknown"). */
const LANG_RE = /^[a-z]{3}$/;

/** Control characters that must never reach the database. */
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function containsJapaneseScript(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

export type ValidateOptions = {
  /** When set, the sentence language must be one of these. */
  requireLangs?: string[];
  /** When true, a jpn sentence must actually contain Japanese script. */
  enforceScript?: boolean;
};

export function validateSentence(
  s: NormalizedSentence,
  options: ValidateOptions = {},
): ValidationIssue | null {
  if (!/^\d+$/.test(s.sourceId)) {
    return { sourceId: s.sourceId || "(empty)", reason: "sentence id must be numeric" };
  }
  if (s.text.length === 0) {
    return { sourceId: s.sourceId, reason: "sentence has no text" };
  }
  if (CONTROL_RE.test(s.text)) {
    return { sourceId: s.sourceId, reason: "text contains control characters" };
  }
  if (!LANG_RE.test(s.lang)) {
    return { sourceId: s.sourceId, reason: `invalid ISO 639-3 language: ${s.lang}` };
  }
  if (options.requireLangs && options.requireLangs.length > 0) {
    if (!options.requireLangs.includes(s.lang)) {
      return {
        sourceId: s.sourceId,
        reason: `unexpected language ${s.lang}, wanted ${options.requireLangs.join("|")}`,
      };
    }
  }
  if (s.charLength < MIN_CHARS || s.charLength > MAX_CHARS) {
    return {
      sourceId: s.sourceId,
      reason: `length ${s.charLength} outside ${MIN_CHARS}-${MAX_CHARS}`,
    };
  }
  // --- licence compliance: never store a sentence we cannot attribute ---
  if (s.attribution.trim().length === 0) {
    return { sourceId: s.sourceId, reason: "missing attribution (CC BY requires it)" };
  }
  if (s.license.trim().length === 0) {
    return { sourceId: s.sourceId, reason: "missing license" };
  }
  if (options.enforceScript && s.lang === "jpn" && !containsJapaneseScript(s.text)) {
    return {
      sourceId: s.sourceId,
      reason: "sentence tagged jpn but contains no Japanese script",
    };
  }
  return null;
}
