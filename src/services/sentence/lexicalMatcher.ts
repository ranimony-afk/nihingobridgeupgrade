/**
 * §7 — Dictionary-driven sentence lexical matching.
 *
 * ## Why not segmentation
 *
 * Japanese has no spaces, so the instinctive design is "segment first, then
 * look up the tokens". That requires a morphological analyser (MeCab, IPADIC,
 * Juman++) together with its dictionary — a large runtime dependency with its
 * own licence and memory footprint, and one that would need to be kept in sync
 * with the canonical vocabulary.
 *
 * Dictionary-driven matching inverts the problem: the canonical dictionary
 * already knows every word NihongoBridge recognises, so a trie built from those
 * headwords and readings *is* the segmentation strategy. A single left-to-right
 * scan with longest-match resolution yields exact dictionary identity, surface
 * offsets, and kana/kanji boundaries without any external analyser.
 *
 * ## Complexity
 *
 * Cost per sentence is O(n · L) where n is the code point count and L is the
 * longest indexed surface — both small and bounded, and independent of corpus
 * size. This replaces the previous approach, which scanned every dictionary
 * headword with `sentence.includes(headword)` for every sentence, i.e.
 * O(sentences × dictionary_entries) — roughly 206,747 substring scans per
 * sentence at current corpus size, with no position information at all.
 *
 * ## Purity
 *
 * The matcher performs no I/O and never touches the database. It is a pure
 * function of (targets, sentence), so it is deterministic, unit-testable, and
 * usable before any sentence corpus exists.
 */

import {
  codePointLength,
  toCodePoints,
} from "./offsetContract";
import type {
  LexicalMatch,
  LexicalMatchTarget,
  MatchMode,
  MatchSurface,
  ScanOptions,
} from "./types";

/** A terminal entry recorded at a trie node. */
interface TrieTerminal {
  entryId: string;
  headword: string;
  reading: string;
  surfacedAs: MatchSurface;
  jlptLevel: string | null;
  isCommon: boolean;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  terminals: TrieTerminal[];
}

function createNode(): TrieNode {
  return { children: new Map(), terminals: [] };
}

export interface LexicalTrie {
  root: TrieNode;
  /** Number of distinct dictionary entries indexed. */
  entryCount: number;
  /** Longest indexed surface, in code points. Bounds each scan window. */
  maxSurfaceLength: number;
}

/**
 * Builds a trie from dictionary entries.
 *
 * Each entry is indexed under **both** its headword and its reading, so a
 * sentence may surface either form. Kana-only entries have identical headword
 * and reading; that surface is indexed once, with `surfacedAs` reported as
 * `"headword"`.
 *
 * Blank surfaces are skipped. Nothing is normalised here: callers must apply
 * any Unicode normalisation *before* both building the trie and scanning text,
 * otherwise offsets and surfaces would refer to different strings.
 */
export function buildLexicalTrie(
  targets: Iterable<LexicalMatchTarget>
): LexicalTrie {
  const root = createNode();
  let entryCount = 0;
  let maxSurfaceLength = 0;

  for (const target of targets) {
    if (!target || !target.entryId) continue;
    entryCount++;

    const surfaces = new Map<string, MatchSurface>();
    if (target.headword) surfaces.set(target.headword, "headword");
    // Only index the reading separately when it differs from the headword.
    if (target.reading && target.reading !== target.headword) {
      surfaces.set(target.reading, "reading");
    }

    for (const [surface, surfacedAs] of surfaces) {
      const points = toCodePoints(surface);
      if (points.length === 0) continue;
      if (points.length > maxSurfaceLength) maxSurfaceLength = points.length;

      let node = root;
      for (const point of points) {
        let child = node.children.get(point);
        if (!child) {
          child = createNode();
          node.children.set(point, child);
        }
        node = child;
      }

      node.terminals.push({
        entryId: target.entryId,
        headword: target.headword,
        reading: target.reading,
        surfacedAs,
        jlptLevel: target.jlptLevel ?? null,
        isCommon: target.isCommon ?? false,
      });
    }
  }

  return { root, entryCount, maxSurfaceLength };
}

function toMatches(
  terminals: TrieTerminal[],
  points: string[],
  start: number,
  end: number
): LexicalMatch[] {
  const surface = points.slice(start, end).join("");
  return terminals.map((terminal) => ({
    entryId: terminal.entryId,
    headword: terminal.headword,
    reading: terminal.reading,
    surfacedAs: terminal.surfacedAs,
    surface,
    start,
    end,
    length: end - start,
    jlptLevel: terminal.jlptLevel,
    isCommon: terminal.isCommon,
  }));
}

/**
 * Deterministic ordering for emitted matches.
 *
 * Sort is by start offset ascending, then by length descending (a longer match
 * at the same position is the more specific reading), then by entryId and
 * surface so that ties between homographs never depend on input order.
 */
export function compareLexicalMatches(a: LexicalMatch, b: LexicalMatch): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.length !== b.length) return b.length - a.length;
  if (a.entryId !== b.entryId) return a.entryId < b.entryId ? -1 : 1;
  if (a.surface !== b.surface) return a.surface < b.surface ? -1 : 1;
  return 0;
}

/**
 * Scans one sentence against a trie.
 *
 * `"longest"` (default) takes the longest match at each position and resumes
 * after it, producing non-overlapping matches — the behaviour appropriate for
 * "which vocabulary appears here". `"all"` emits every match including
 * overlapping ones, which is appropriate for indexing/analytics.
 *
 * All offsets are **code point** offsets (see `offsetContract.ts`).
 */
export function scanSentence(
  text: string,
  trie: LexicalTrie,
  options: ScanOptions = {}
): LexicalMatch[] {
  const mode: MatchMode = options.mode ?? "longest";
  const minSurfaceLength = Math.max(1, options.minSurfaceLength ?? 1);

  if (!text) return [];

  const points = toCodePoints(text);
  const total = points.length;
  if (total === 0) return [];

  const results: LexicalMatch[] = [];

  let cursor = 0;
  while (cursor < total) {
    let node: TrieNode | undefined = trie.root;
    let deepestTerminals: TrieTerminal[] | undefined;
    let deepestEnd = -1;

    const limit = Math.min(total, cursor + trie.maxSurfaceLength);

    for (let probe = cursor; probe < limit; probe++) {
      node = node.children.get(points[probe]);
      if (!node) break;

      if (node.terminals.length > 0) {
        const end = probe + 1;

        if (mode === "all") {
          // Every candidate at every length is emitted, so a shorter match
          // nested inside a longer one is not lost.
          if (end - cursor >= minSurfaceLength) {
            results.push(...toMatches(node.terminals, points, cursor, end));
          }
        } else {
          // Longest mode: retain only the deepest terminal seen so far.
          deepestTerminals = node.terminals;
          deepestEnd = end;
        }
      }
    }

    if (mode === "all") {
      cursor++;
      continue;
    }

    if (deepestTerminals && deepestEnd > cursor) {
      const length = deepestEnd - cursor;
      if (length >= minSurfaceLength) {
        results.push(...toMatches(deepestTerminals, points, cursor, deepestEnd));
      }
      cursor = deepestEnd;
    } else {
      cursor++;
    }
  }

  return results.sort(compareLexicalMatches);
}

/**
 * Stateful wrapper that builds the trie once and reuses it across sentences —
 * the intended usage when processing a corpus, since trie construction is the
 * expensive part and scanning is comparatively cheap.
 */
export class LexicalMatcher {
  private readonly trie: LexicalTrie;

  constructor(targets: Iterable<LexicalMatchTarget>) {
    this.trie = buildLexicalTrie(targets);
  }

  /** Number of dictionary entries indexed. */
  get entryCount(): number {
    return this.trie.entryCount;
  }

  /** Longest indexed surface, in code points. */
  get maxSurfaceLength(): number {
    return this.trie.maxSurfaceLength;
  }

  scan(text: string, options?: ScanOptions): LexicalMatch[] {
    return scanSentence(text, this.trie, options);
  }
}

/**
 * Convenience helper for one-off scans. Prefer `LexicalMatcher` when scanning
 * more than a handful of sentences.
 */
export function findLexicalMatches(
  text: string,
  targets: Iterable<LexicalMatchTarget>,
  options?: ScanOptions
): LexicalMatch[] {
  return scanSentence(text, buildLexicalTrie(targets), options);
}

/** Convenience wrapper: total code point length of a scanned sentence. */
export function scannedLength(text: string): number {
  return codePointLength(text);
}
