import type { SearchScript } from "./types";

const KANJI_REGEX = /[\u4e00-\u9faf\u3400-\u4dbf]/;
const HIRAGANA_REGEX = /[\u3040-\u309f]/;
const KATAKANA_REGEX = /[\u30a0-\u30ff]/;
const ROMAJI_REGEX = /^[a-zA-Z0-9\s\-–—’'.,!?_()]+$/;

export function detectSearchScript(rawQuery: string): SearchScript {
  const query = rawQuery.trim();
  if (!query) return "empty";

  const hasKanji = KANJI_REGEX.test(query);
  const hasHiragana = HIRAGANA_REGEX.test(query);
  const hasKatakana = KATAKANA_REGEX.test(query);
  const hasKana = hasHiragana || hasKatakana;

  if (hasKanji && !hasKana) {
    return "kanji";
  }

  if (hasKana && !hasKanji) {
    return "kana";
  }

  if (hasKanji && hasKana) {
    return "japanese";
  }

  if (ROMAJI_REGEX.test(query)) {
    // English or Romaji check - basic heuristic: standard latin characters
    return "romaji";
  }

  return "mixed";
}

export function sanitizeSearchQuery(rawQuery: string): string {
  if (typeof rawQuery !== "string") return "";
  // Strip null bytes and normalize whitespace
  return rawQuery.replace(/\0/g, "").trim();
}

/**
 * Escapes characters for SQL ILIKE query safely.
 */
export function escapeLikePattern(str: string): string {
  return str.replace(/([%_\\])/g, "\\$1");
}

/**
 * Calculates a match relevance score from 0 to 1 based on match quality.
 */
export function calculateRelevance(
  query: string,
  candidate: string | null | undefined,
  baseWeight = 1.0
): number {
  if (!candidate || !query) return 0;

  const q = query.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();

  if (c === q) {
    return Number((1.0 * baseWeight).toFixed(3));
  }

  if (c.startsWith(q)) {
    return Number((0.9 * baseWeight).toFixed(3));
  }

  if (c.endsWith(q)) {
    return Number((0.8 * baseWeight).toFixed(3));
  }

  if (c.includes(q)) {
    // Shorter candidate length relative to query means more specific match
    const ratio = Math.min(1, q.length / c.length);
    const score = (0.5 + 0.3 * ratio) * baseWeight;
    return Number(score.toFixed(3));
  }

  return 0;
}
