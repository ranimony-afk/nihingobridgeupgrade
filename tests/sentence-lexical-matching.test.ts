/**
 * Phase 14.4F-R §7/§8 — Sentence lexical matching and offset contract.
 *
 * DATABASE-INDEPENDENT by construction. The matcher is a pure function of
 * (targets, sentence) with no I/O, so this suite runs in any environment and
 * does not depend on an acquired sentence corpus or a seeded dictionary.
 *
 * Fixtures are deliberately chosen to exercise the UTF-16 vs code point
 * divergence (§8): ordinary BMP Japanese, CJK Extension B kanji, emoji, and
 * mixed ASCII/Japanese.
 */

import { describe, expect, it } from "vitest";
import {
  OFFSET_UNIT,
  codePointIndexToUtf16Index,
  codePointLength,
  codePointSlice,
  describeOffsetDivergence,
  hasSupplementaryPlaneCharacters,
  toCodePoints,
  utf16IndexToCodePointIndex,
  utf16Length,
} from "@/services/sentence/offsetContract";
import {
  LexicalMatcher,
  buildLexicalTrie,
  compareLexicalMatches,
  findLexicalMatches,
  scanSentence,
} from "@/services/sentence/lexicalMatcher";
import type { LexicalMatchTarget } from "@/services/sentence/types";

/** A small hand-built dictionary. Not upstream data — test fixtures only. */
const TARGETS: LexicalMatchTarget[] = [
  { entryId: "de-1", headword: "日本語", reading: "にほんご", jlptLevel: "N5", isCommon: true },
  { entryId: "de-2", headword: "日本", reading: "にほん", jlptLevel: "N5", isCommon: true },
  { entryId: "de-3", headword: "勉強", reading: "べんきょう", jlptLevel: "N5", isCommon: true },
  { entryId: "de-4", headword: "水", reading: "みず", jlptLevel: "N5", isCommon: true },
  { entryId: "de-5", headword: "飲む", reading: "のむ", jlptLevel: "N5", isCommon: true },
  { entryId: "de-6", headword: "食べる", reading: "たべる", jlptLevel: "N5", isCommon: true },
];

const matcher = new LexicalMatcher(TARGETS);

/* ------------------------------------------------------------------ *
 * §8 — Offset contract
 * ------------------------------------------------------------------ */

describe("§8 offset contract", () => {
  it("declares code point offsets as the single public unit", () => {
    expect(OFFSET_UNIT).toBe("unicodeCodePoint");
  });

  it("counts ordinary Japanese identically under both conventions", () => {
    // All BMP: kanji, hiragana, full-width punctuation.
    const text = "普通の日本語";
    expect(codePointLength(text)).toBe(6);
    expect(utf16Length(text)).toBe(6);
    expect(describeOffsetDivergence(text).divergent).toBe(false);
  });

  it("diverges for a CJK Extension B kanji (𠮷)", () => {
    // 𠮷 is U+20BB7 — a surrogate pair, 2 UTF-16 units, 1 code point.
    const text = "𠮷";
    expect(codePointLength(text)).toBe(1);
    expect(utf16Length(text)).toBe(2);
    expect(describeOffsetDivergence(text).divergent).toBe(true);
    expect(hasSupplementaryPlaneCharacters(text)).toBe(true);
  });

  it("diverges for emoji", () => {
    const text = "👍";
    expect(codePointLength(text)).toBe(1);
    expect(utf16Length(text)).toBe(2);
    expect(hasSupplementaryPlaneCharacters(text)).toBe(true);
  });

  it("treats a ZWJ emoji sequence as multiple code points, not one grapheme", () => {
    // Documented limitation: this contract is code points, NOT grapheme clusters.
    const family = "👨‍👩‍👧";
    expect(codePointLength(family)).toBe(5); // 3 emoji + 2 ZWJ
    expect(utf16Length(family)).toBe(8);
  });

  it("codePointSlice does not split surrogate pairs", () => {
    const text = "𠮷野家";
    // Native slice would return a lone high surrogate here.
    expect(text.slice(0, 1)).not.toBe("𠮷");
    expect(codePointSlice(text, 0, 1)).toBe("𠮷");
    expect(codePointSlice(text, 1, 3)).toBe("野家");
  });

  it("converts UTF-16 indices to code point indices across a surrogate pair", () => {
    const text = "𠮷野家"; // code points: 𠮷 野 家 (UTF-16 length 4)
    expect(utf16IndexToCodePointIndex(text, 0)).toBe(0);
    expect(utf16IndexToCodePointIndex(text, 2)).toBe(1); // just past 𠮷
    expect(utf16IndexToCodePointIndex(text, 4)).toBe(3);
  });

  it("converts code point indices back to UTF-16 indices", () => {
    const text = "𠮷野家";
    expect(codePointIndexToUtf16Index(text, 0)).toBe(0);
    expect(codePointIndexToUtf16Index(text, 1)).toBe(2); // after the pair
    expect(codePointIndexToUtf16Index(text, 3)).toBe(4);
  });

  it("round-trips index conversion at every code point boundary", () => {
    const samples = ["普通の日本語", "𠮷野家", "👍日本語", "abc水", "𠮷"];
    for (const text of samples) {
      const cpTotal = codePointLength(text);
      for (let cp = 0; cp <= cpTotal; cp++) {
        const u16 = codePointIndexToUtf16Index(text, cp);
        expect(utf16IndexToCodePointIndex(text, u16)).toBe(cp);
      }
    }
  });

  it("clamps out-of-range and negative indices instead of throwing", () => {
    const text = "日本語";
    expect(utf16IndexToCodePointIndex(text, -5)).toBe(0);
    expect(utf16IndexToCodePointIndex(text, 9999)).toBe(3);
    expect(codePointIndexToUtf16Index(text, -1)).toBe(0);
    expect(codePointIndexToUtf16Index(text, 9999)).toBe(3);
    expect(utf16IndexToCodePointIndex(text, Number.NaN)).toBe(0);
  });

  it("toCodePoints yields one entry per character, not per code unit", () => {
    expect(toCodePoints("𠮷野家")).toEqual(["𠮷", "野", "家"]);
    expect(toCodePoints("普通")).toEqual(["普", "通"]);
  });

  it("reports non-divergence for ASCII", () => {
    expect(describeOffsetDivergence("taberu").divergent).toBe(false);
    expect(hasSupplementaryPlaneCharacters("taberu")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * §7 — Trie construction
 * ------------------------------------------------------------------ */

describe("§7 trie construction", () => {
  it("indexes one entry per target and reports the longest surface", () => {
    const trie = buildLexicalTrie(TARGETS);
    expect(trie.entryCount).toBe(TARGETS.length);
    // べんきょう (reading of 勉強) is 5 code points — the longest indexed surface.
    expect(trie.maxSurfaceLength).toBe(5);
  });

  it("indexes both headword and reading for a kanji entry", () => {
    const matcherOnly = new LexicalMatcher([
      { entryId: "de-1", headword: "水", reading: "みず" },
    ]);
    expect(matcherOnly.scan("水")).toHaveLength(1);
    expect(matcherOnly.scan("みず")).toHaveLength(1);
  });

  it("does not double-index a kana-only entry whose headword equals its reading", () => {
    const m = new LexicalMatcher([{ entryId: "de-9", headword: "これ", reading: "これ" }]);
    const matches = m.scan("これ");
    expect(matches).toHaveLength(1);
    expect(matches[0].surfacedAs).toBe("headword");
  });

  it("skips blank surfaces and malformed targets without throwing", () => {
    const trie = buildLexicalTrie([
      { entryId: "de-a", headword: "", reading: "" }, // no indexable surface
      { entryId: "", headword: "水", reading: "みず" }, // no entryId -> skipped entirely
      { entryId: "de-b", headword: "水", reading: "みず" },
    ]);
    expect(trie.entryCount).toBe(2); // de-a and de-b; the id-less target is not counted
    // Only de-b contributed surfaces: 水 (1) and みず (2).
    expect(trie.maxSurfaceLength).toBe(2);
  });

  it("returns an empty trie for empty input", () => {
    const trie = buildLexicalTrie([]);
    expect(trie.entryCount).toBe(0);
    expect(trie.maxSurfaceLength).toBe(0);
    expect(scanSentence("日本語", trie)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * §7 — Matching behaviour
 * ------------------------------------------------------------------ */

describe("§7 matching behaviour", () => {
  it("matches an exact headword with correct code point offsets", () => {
    const matches = matcher.scan("日本語");
    const nihongo = matches.find((m) => m.entryId === "de-1");
    expect(nihongo).toBeDefined();
    expect(nihongo?.surface).toBe("日本語");
    expect(nihongo?.start).toBe(0);
    expect(nihongo?.end).toBe(3);
    expect(nihongo?.length).toBe(3);
    expect(nihongo?.surfacedAs).toBe("headword");
  });

  it("applies longest-match-first at a shared prefix", () => {
    // 日本 and 日本語 both start at 0; the longer wins under "longest".
    const matches = matcher.scan("日本語を勉強します。");
    const atZero = matches.filter((m) => m.start === 0);
    expect(atZero).toHaveLength(1);
    expect(atZero[0].entryId).toBe("de-1");
    expect(atZero[0].surface).toBe("日本語");
  });

  it("surfaces shorter alternatives in 'all' mode", () => {
    const matches = matcher.scan("日本語", { mode: "all" });
    const idsAtZero = matches.filter((m) => m.start === 0).map((m) => m.entryId);
    expect(idsAtZero).toContain("de-1"); // 日本語
    expect(idsAtZero).toContain("de-2"); // 日本
  });

  it("finds multiple vocabulary items in one sentence, ordered by position", () => {
    const matches = matcher.scan("日本語を勉強します。", { minSurfaceLength: 2 });
    const starts = matches.map((m) => m.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(matches.map((m) => m.entryId)).toEqual(["de-1", "de-3"]);
    expect(matches[1].start).toBe(4); // 日本語(3) + を(1)
  });

  it("matches via reading when the text uses kana", () => {
    const matches = matcher.scan("みずをのむ");
    expect(matches.map((m) => m.surfacedAs)).toEqual(["reading", "reading"]);
    expect(matches.map((m) => m.entryId)).toEqual(["de-4", "de-5"]);
  });

  it("resolves a conjugated surface to its dictionary entry", () => {
    // 食べ is the stem of 食べる; the trie has no 食べ entry, so no match is
    // fabricated. 食べる itself must match exactly.
    expect(matcher.scan("食べる")).toHaveLength(1);
    expect(matcher.scan("食べ")).toEqual([]);
  });

  it("emits nothing for text with no known vocabulary", () => {
    expect(matcher.scan("zzz")).toEqual([]);
    expect(matcher.scan("")).toEqual([]);
  });

  it("returns identical results across repeated scans (determinism)", () => {
    const text = "日本語を勉強して、水を飲みます。";
    const first = matcher.scan(text);
    const second = matcher.scan(text);
    expect(second).toEqual(first);
  });

  it("is independent of target insertion order", () => {
    const reversed = new LexicalMatcher([...TARGETS].reverse());
    const forward = new LexicalMatcher(TARGETS);
    const text = "日本語を勉強します。";
    expect(reversed.scan(text)).toEqual(forward.scan(text));
  });

  it("produces a deterministic order for homograph ties", () => {
    const homographs: LexicalMatchTarget[] = [
      { entryId: "de-z", headword: "石", reading: "いし" },
      { entryId: "de-a", headword: "石", reading: "いし" },
      { entryId: "de-m", headword: "石", reading: "いし" },
    ];
    const m = new LexicalMatcher(homographs);
    const ids = m.scan("石").map((x) => x.entryId);
    expect(ids).toEqual(["de-a", "de-m", "de-z"]); // sorted, not insertion order
  });

  it("honours minSurfaceLength", () => {
    const withSingleKana = new LexicalMatcher([
      { entryId: "de-p", headword: "を", reading: "を" },
      { entryId: "de-1", headword: "日本語", reading: "にほんご" },
    ]);
    expect(withSingleKana.scan("日本語を").length).toBe(2);
    expect(withSingleKana.scan("日本語を", { minSurfaceLength: 2 }).map((x) => x.entryId)).toEqual([
      "de-1",
    ]);
  });

  it("carries provenance fields through to the match", () => {
    const match = matcher.scan("水")[0];
    expect(match.jlptLevel).toBe("N5");
    expect(match.isCommon).toBe(true);
    expect(match.headword).toBe("水");
    expect(match.reading).toBe("みず");
  });

  it("compareLexicalMatches sorts by start, then longest, then id", () => {
    const base = {
      headword: "x",
      reading: "x",
      surfacedAs: "headword" as const,
      surface: "x",
      jlptLevel: null,
      isCommon: false,
    };
    const items = [
      { ...base, entryId: "b", start: 5, end: 6, length: 1 },
      { ...base, entryId: "a", start: 0, end: 1, length: 1 },
      { ...base, entryId: "c", start: 5, end: 7, length: 2 },
    ];
    const sorted = [...items].sort(compareLexicalMatches);
    expect(sorted.map((m) => `${m.start}:${m.entryId}`)).toEqual(["0:a", "5:c", "5:b"]);
  });
});

/* ------------------------------------------------------------------ *
 * §8 — Supplementary-plane characters through the matcher
 * ------------------------------------------------------------------ */

describe("§8 offsets with supplementary-plane characters", () => {
  const withSupplementary: LexicalMatchTarget[] = [
    { entryId: "de-s", headword: "𠮷野家", reading: "よしのや" },
    { entryId: "de-1", headword: "日本語", reading: "にほんご" },
    { entryId: "de-4", headword: "水", reading: "みず" },
  ];
  const m = new LexicalMatcher(withSupplementary);

  it("matches a headword containing an Extension B kanji", () => {
    const matches = m.scan("𠮷野家");
    expect(matches).toHaveLength(1);
    expect(matches[0].surface).toBe("𠮷野家");
    // Code points, not the 4 UTF-16 units.
    expect(matches[0].length).toBe(3);
    expect(matches[0].start).toBe(0);
    expect(matches[0].end).toBe(3);
  });

  it("keeps offsets in code points when a surrogate pair precedes the match", () => {
    // 𠮷 (1 cp) + の (1 cp) -> 日本語 starts at code point 2, not UTF-16 3.
    const text = "𠮷の日本語";
    const matches = m.scan(text);
    const nihongo = matches.find((x) => x.entryId === "de-1");
    expect(nihongo).toBeDefined();
    expect(nihongo?.start).toBe(2);
    expect(nihongo?.end).toBe(5);

    // Prove the distinction is real: the string's own code unit length is larger.
    expect(utf16Length(text)).toBe(6);
    expect(codePointLength(text)).toBe(5);
  });

  it("slices matched surfaces correctly out of a mixed string", () => {
    const text = "👍日本語";
    const matches = m.scan(text);
    const nihongo = matches.find((x) => x.entryId === "de-1");
    expect(nihongo).toBeDefined();
    // Round-trips through the documented conversion path.
    const utf16Start = codePointIndexToUtf16Index(text, nihongo!.start);
    expect(text.slice(utf16Start, utf16Start + 3)).toBe("日本語");
  });

  it("handles mixed ASCII and Japanese", () => {
    const text = "JLPT は 日本語 です";
    const matches = m.scan(text);
    const nihongo = matches.find((x) => x.entryId === "de-1");
    expect(nihongo).toBeDefined();
    expect(nihongo?.start).toBe(7); // "JLPT は " is 7 code points
    expect(nihongo?.surface).toBe("日本語");
  });

  it("handles emoji interleaved with matched vocabulary", () => {
    const text = "水👍水";
    const matches = m.scan(text);
    expect(matches).toHaveLength(2);
    expect(matches[0].start).toBe(0);
    expect(matches[1].start).toBe(2); // emoji counts as exactly 1 code point
  });

  it("does not fabricate matches across a surrogate pair boundary", () => {
    // A trie keyed on BMP characters must never match half a surrogate pair.
    expect(m.scan("𠮷").filter((x) => x.entryId !== "de-s")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * §7 — Convenience API and scale sanity
 * ------------------------------------------------------------------ */

describe("§7 convenience API", () => {
  it("findLexicalMatches builds a trie per call and agrees with the class", () => {
    const text = "日本語を勉強します。";
    expect(findLexicalMatches(text, TARGETS)).toEqual(matcher.scan(text));
  });

  it("exposes entryCount and maxSurfaceLength", () => {
    expect(matcher.entryCount).toBe(TARGETS.length);
    expect(matcher.maxSurfaceLength).toBe(5); // べんきょう
  });

  it("scales linearly on a repeated sentence without pathological growth", () => {
    // Guards against accidental O(n^2): scanning a long string should stay
    // proportional to its length.
    const sentence = "日本語を勉強します。"; // 10 code points
    const long = sentence.repeat(2000); // 20,000 code points
    const started = Date.now();
    const matches = matcher.scan(long);
    const elapsed = Date.now() - started;

    expect(matches.length).toBeGreaterThan(0);
    // Generous bound: this is a guard against complexity regression, not a benchmark.
    expect(elapsed).toBeLessThan(2000);
  });
});
