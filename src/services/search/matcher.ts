import type { SearchScript } from "./types";
import { containsKanji } from "@/lib/japanese/kanjiText";

const HIRAGANA_REGEX = /[\u3040-\u309f]/;
const KATAKANA_REGEX = /[\u30a0-\u30ff]/;
const ROMAJI_REGEX = /^[a-zA-Z0-9\s\-–—’'.,!?_()]+$/;

export function detectSearchScript(rawQuery: string): SearchScript {
  const query = rawQuery.trim();
  if (!query) return "empty";

  // Gate 6: delegated to the canonical, stateless kanji test.
  //
  // The former local regex was /[\u4e00-\u9faf\u3400-\u4dbf]/ — it omitted CJK
  // Compatibility Ideographs (U+F900–U+FAFF) and truncated the CJK Unified Ideographs
  // block at U+9FAF instead of U+9FFF, so queries built from those characters were
  // misclassified as "romaji"/"mixed" rather than "kanji". `containsKanji` is
  // non-global, which also avoids the stale-`lastIndex` bug that a `/g` regex exhibits
  // under repeated `.test()` calls.
  const hasKanji = containsKanji(query);
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

/* ------------------------------------------------------------------ *
 * Gate A3 — deterministic result ordering
 * ------------------------------------------------------------------ */

/** The subset of `UnifiedSearchResultItem` the comparator orders by. */
export interface RankableSearchResult {
  entityType: string;
  id: string;
  displayText: string;
  relevance: number;
}

/**
 * Total ordering for unified search results.
 *
 * ## Why this exists
 *
 * The comparator was previously inline in `UnifiedSearchService.search` and ended
 * at `displayText.length`. Items agreeing on both relevance and length were left
 * in whatever order the parallel target queries resolved and the database
 * returned, and `Array.prototype.sort` is stable — so the tie fell through to
 * *database row order*. PostgreSQL guarantees no order for a query without a
 * total `ORDER BY`, so identical input could produce differently ordered output.
 * That is not merely cosmetic: `search()` slices with `offset`/`limit`, so a
 * non-total order makes pagination unstable and any paging assertion flaky.
 *
 * ## The ordering
 *
 * 1. `relevance` **descending** — unchanged, the primary signal.
 * 2. `displayText.length` **ascending** — unchanged; a shorter candidate is a
 *    more specific match for the same relevance.
 * 3. `entityType` **ascending** — ids are unique only *within* a target, so
 *    cross-target ties must be broken by target first.
 * 4. `id` **ascending** — unique within a target, and therefore what makes the
 *    order total.
 * 5. `displayText` **lexicographic** — unreachable while ids are unique; present
 *    so the comparator is total under *every* input rather than only under inputs
 *    believed to be unique.
 *
 * Only fields already carried by `UnifiedSearchResultItem` are used. In
 * particular `isCommon` and `frequencyRank` are deliberately **not** consulted:
 * both would be better relevance signals, but neither is present on the result
 * item, and plumbing them changes what users see. That is a behavioural change
 * needing its own evidence, not a determinism fix.
 *
 * This fixes **ordering**, not **relevance quality**: equal-relevance results are
 * still tied on relevance and are now merely ordered consistently.
 */
export function compareSearchResults(
  a: RankableSearchResult,
  b: RankableSearchResult
): number {
  if (b.relevance !== a.relevance) return b.relevance - a.relevance;
  if (a.displayText.length !== b.displayText.length) {
    return a.displayText.length - b.displayText.length;
  }
  if (a.entityType !== b.entityType) return a.entityType < b.entityType ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  if (a.displayText !== b.displayText) return a.displayText < b.displayText ? -1 : 1;
  return 0;
}
