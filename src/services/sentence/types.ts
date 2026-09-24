/**
 * Phase 14.4F-R / §7 — Sentence lexical matching: shared types.
 *
 * This module is deliberately free of any dependency on an acquired sentence
 * corpus. It defines the algorithm's inputs and outputs only, so the matching
 * infrastructure can be built and verified before any upstream sentence
 * artifact exists.
 */

/** How a dictionary entry was surfaced in the sentence. */
export type MatchSurface = "headword" | "reading";

/** Resolution strategy when matches overlap. */
export type MatchMode =
  /** Greedy longest-match: at each position take the longest match, then continue after it. */
  | "longest"
  /** Emit every match found, including overlapping ones. */
  | "all";

/** One dictionary entry the matcher may recognise. */
export interface LexicalMatchTarget {
  entryId: string;
  headword: string;
  reading: string;
  jlptLevel?: string | null;
  isCommon?: boolean;
}

/** A single recognised occurrence of a dictionary entry within a sentence. */
export interface LexicalMatch {
  entryId: string;
  headword: string;
  reading: string;
  /** Which form of the entry actually matched the text. */
  surfacedAs: MatchSurface;
  /** The exact substring matched, as it appears in the sentence. */
  surface: string;
  /** Inclusive start offset, in code points. */
  start: number;
  /** Exclusive end offset, in code points. */
  end: number;
  /** Match length in code points (`end - start`). */
  length: number;
  jlptLevel: string | null;
  isCommon: boolean;
}

export interface ScanOptions {
  /** Default `"longest"`. */
  mode?: MatchMode;
  /**
   * Minimum surface length, in code points, for a match to be emitted.
   *
   * Default 1 (emit everything the trie recognises). Callers matching against a
   * full dictionary corpus will usually want 2, because single-kana surfaces
   * (particles, auxiliary fragments) generate large volumes of low-value noise.
   * The matcher itself stays policy-free: this is a caller decision, not a
   * linguistic judgement baked into the algorithm.
   */
  minSurfaceLength?: number;
}
