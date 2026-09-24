/**
 * §8 — Offset contract.
 *
 * PUBLIC CONTRACT: every character offset this codebase exposes is a
 * **Unicode code point** offset.
 *
 * `offsetUnit = "unicodeCodePoint"`
 *
 * ## Why this needs to be explicit
 *
 * JavaScript strings are sequences of UTF-16 code units. `.length`, `.slice()`,
 * `.indexOf()` and regex `lastIndex` all count code units, not characters. For
 * any character in the Basic Multilingual Plane the two agree, which is why the
 * discrepancy stays invisible in practice: Japanese kana, kanji, and full-width
 * punctuation are all BMP, so essentially every ordinary Japanese string
 * behaves identically under both conventions.
 *
 * They diverge only for supplementary-plane characters, each of which occupies
 * **two** UTF-16 code units:
 *
 *   - Rare kanji in CJK Extension B — e.g. 𠮷 (U+20BB7), 辻 variants, 髙
 *   - Emoji — e.g. 🇯🇵 (regional indicators), 👍, 👨‍👩‍👧 (ZWJ sequences)
 *
 * A sentence containing 𠮷 is where the two conventions part company:
 *
 *   "𠮷"            code point length 1   UTF-16 length 2
 *   "𠮷野家"         code point length 3   UTF-16 length 4
 *
 * If UTF-16 offsets leak into a public API, every downstream consumer that
 * slices by them — highlighters, SRS card builders, subtitle overlays — will
 * silently mis-slice any text containing such characters. The failure is
 * invisible in tests that only use ordinary Japanese, which is exactly why the
 * contract is asserted here with explicit supplementary-plane fixtures.
 *
 * ## What this module is NOT
 *
 * - **Not grapheme clusters.** A combining sequence such as "か" + U+3099
 *   (dakuten) is two code points; a ZWJ emoji sequence is several. Grapheme
 *   segmentation requires `Intl.Segmenter` and a different contract. Code points
 *   are chosen because they are stable, cheap, and unambiguous.
 * - **Not Normalization Form.** This module never normalizes. Callers that need
 *   NFC/NFKC must apply it *before* matching and offsetting, so that offsets
 *   refer to the string that was actually scanned.
 */

/** The single source of truth for how offsets are counted. */
export const OFFSET_UNIT = "unicodeCodePoint" as const;
export type OffsetUnit = typeof OFFSET_UNIT;

/**
 * Counts code points — not UTF-16 code units.
 *
 * `"𠮷".length` is 2; `codePointLength("𠮷")` is 1.
 */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

/**
 * Equivalent of `String.prototype.length`, named explicitly so that call sites
 * comparing the two conventions are obvious rather than accidental.
 */
export function utf16Length(text: string): number {
  return text.length;
}

/** Splits a string into an array of code points (each a 1-length string). */
export function toCodePoints(text: string): string[] {
  return Array.from(text);
}

/**
 * Converts a UTF-16 code-unit index into a code point index.
 *
 * Out-of-range and negative inputs are clamped rather than throwing, so this is
 * safe to call on untrusted boundaries.
 */
export function utf16IndexToCodePointIndex(text: string, utf16Index: number): number {
  if (!Number.isFinite(utf16Index) || utf16Index <= 0) return 0;

  const limit = Math.min(Math.floor(utf16Index), text.length);
  let utf16Cursor = 0;
  let codePoints = 0;

  while (utf16Cursor < limit) {
    const unit = text.codePointAt(utf16Cursor);
    if (unit === undefined) break;
    utf16Cursor += unit > 0xffff ? 2 : 1;
    codePoints++;
  }

  return codePoints;
}

/**
 * Converts a code point index into a UTF-16 code-unit index.
 *
 * Needed only at the boundary where offset-based strings meet native string
 * APIs (`slice`, `substring`). Out-of-range and negative inputs are clamped.
 */
export function codePointIndexToUtf16Index(text: string, codePointIndex: number): number {
  if (!Number.isFinite(codePointIndex) || codePointIndex <= 0) return 0;

  const limit = Math.floor(codePointIndex);
  let utf16Cursor = 0;
  let codePoints = 0;

  while (utf16Cursor < text.length && codePoints < limit) {
    const unit = text.codePointAt(utf16Cursor);
    if (unit === undefined) break;
    utf16Cursor += unit > 0xffff ? 2 : 1;
    codePoints++;
  }

  return utf16Cursor;
}

/**
 * Slices by **code point** offsets, the safe alternative to `String.slice` for
 * any consumer of this contract.
 *
 * `"𠮷野家".slice(0, 1)` returns a lone high surrogate (a broken string);
 * `codePointSlice("𠮷野家", 0, 1)` returns `"𠮷"`.
 */
export function codePointSlice(text: string, start: number, end?: number): string {
  const points = toCodePoints(text);
  const from = Math.max(0, Math.floor(start));
  const to = end === undefined ? points.length : Math.max(from, Math.floor(end));
  return points.slice(from, to).join("");
}

/**
 * True when the string contains any character outside the Basic Multilingual
 * Plane — i.e. when UTF-16 and code point offsets diverge.
 *
 * Useful as a data-quality probe: text flagged here is where offset bugs live.
 */
export function hasSupplementaryPlaneCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0xd800 && text.charCodeAt(i) <= 0xdbff) return true;
  }
  return false;
}

/**
 * Describes how the two conventions diverge for a given string.
 *
 * Intended for diagnostics, tests, and data-quality reports rather than hot paths.
 */
export function describeOffsetDivergence(text: string): {
  codePointLength: number;
  utf16Length: number;
  divergent: boolean;
  hasSupplementaryPlane: boolean;
} {
  const cp = codePointLength(text);
  const u16 = utf16Length(text);
  return {
    codePointLength: cp,
    utf16Length: u16,
    divergent: cp !== u16,
    hasSupplementaryPlane: hasSupplementaryPlaneCharacters(text),
  };
}
