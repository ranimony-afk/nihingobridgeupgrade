/**
 * Canonical Japanese text primitives — Gate 6 consolidation.
 *
 * ## Why this module exists
 *
 * Three helpers had accumulated **duplicate, divergent** implementations across the
 * repository (`KANJI_REGEX` ×3, `extractKanjiCharacters` ×2, `katakanaToHiragana` ×2).
 * The copies disagreed on the Unicode range, so identical input produced different
 * kanji sets depending on which module the caller happened to import. This module is
 * the single source of truth; the former locations now re-export from here so that
 * every existing import path keeps working unchanged.
 *
 * ## The divergence that was fixed
 *
 * | Prior location | Range | Defect |
 * | :--- | :--- | :--- |
 * | `etl/dictionary/types.ts` | `4E00-9FFF` + ExtA + Compat | correct |
 * | `services/knowledge/kanjiLexicalGraphService.ts` | `4E00-9FAF` + ExtA + Compat | truncated at `9FAF` |
 * | `services/search/matcher.ts` | `4E00-9FAF` + ExtA | truncated at `9FAF` **and** omitted Compat |
 *
 * `U+9FAF` is not a block boundary. The CJK Unified Ideographs block ends at
 * **`U+9FFF`**, so the two truncated copies silently dropped `U+9FB0–U+9FFF`, and the
 * search copy additionally dropped CJK Compatibility Ideographs (`U+F900–U+FAFF`).
 * Both defects are now removed by using one range definition.
 *
 * ## Normalization — deliberately NOT unified
 *
 * The two `extractKanjiCharacters` copies differed in a second, subtler way: the graph
 * service applied Unicode **NFC** first; the ETL helper did not. This is not a defect —
 * it is a real behavioural difference, because NFC performs *canonical* (singleton)
 * decomposition of some compatibility ideographs:
 *
 * ```text
 * U+F900  --NFC-->  U+8C48   (豈)
 * U+FA10  --NFC-->  U+585A   (塚)
 * U+FA0E  --NFC-->  U+FA0E   (unchanged — no decomposition)
 * ```
 *
 * NFC is the correct behaviour for *linkage* work, because `kanji_entries` is keyed by
 * unified code points — an unfolded `U+F900` would produce a dangling reference. It is
 * preserved as the default here, and is the behaviour the graph service's existing test
 * contract asserts. The ETL path keeps its previous non-normalizing behaviour by passing
 * `{ normalize: false }` explicitly, so no stored-data semantics change silently in this
 * change. See `docs/architecture/KANJI-LEXICAL-GRAPH.md` for the follow-up decision.
 *
 * ## Known limitation (documented, not silently changed)
 *
 * These ranges cover the **Basic Multilingual Plane** only. CJK Unified Ideographs
 * Extensions B–I live in the supplementary planes (`U+20000`–`U+3FFFF`) and require
 * surrogate-pair matching (`u` flag with `\u{...}` escapes). None of the three former
 * implementations covered them, so adding coverage would itself be a behaviour change;
 * it is recorded as a bounded follow-up rather than folded into this consolidation.
 */

/**
 * The canonical CJK character class, as a regex character-class body.
 *
 * Covered blocks:
 * - `U+3400–U+4DBF` — CJK Unified Ideographs Extension A
 * - `U+4E00–U+9FFF` — CJK Unified Ideographs (full block — not truncated at `9FAF`)
 * - `U+F900–U+FAFF` — CJK Compatibility Ideographs
 */
const KANJI_CHAR_CLASS = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";

/**
 * Global kanji matcher, for extracting **all** matches from a string.
 *
 * Safe with `String.prototype.match` / `replace`. Do **not** call `.test()` or `.exec()`
 * on this instance: a `/g` regex carries `lastIndex` state, so repeated `.test()` calls on
 * the same instance alternate between `true` and `false`. Use {@link containsKanji} instead.
 */
export const KANJI_REGEX = new RegExp(`[${KANJI_CHAR_CLASS}]`, "g");

/**
 * Non-global kanji matcher — stateless, therefore safe for repeated `.test()`.
 *
 * Kept private so the `/g` footgun cannot be reintroduced by a future caller; expose
 * {@link containsKanji} instead.
 */
const KANJI_TEST_REGEX = new RegExp(`[${KANJI_CHAR_CLASS}]`);

/** Katakana letters that have a hiragana counterpart at a fixed `0x60` offset. */
const KATAKANA_TO_HIRAGANA_REGEX = /[\u30A1-\u30F6]/g;

/**
 * Returns `true` when `text` contains at least one kanji character.
 *
 * Stateless and safe to call repeatedly, unlike `KANJI_REGEX.test(text)`.
 */
export function containsKanji(text: string | null | undefined): boolean {
  if (!text) return false;
  return KANJI_TEST_REGEX.test(text);
}

export interface ExtractKanjiOptions {
  /**
   * Apply Unicode NFC normalization before extraction. Default `true`.
   *
   * NFC folds compatibility ideographs to their canonical unified form (e.g. `U+F900` →
   * `U+8C48`), which is required for linkage against kanji tables keyed by unified code
   * points. Pass `false` only to preserve byte-faithful source characters.
   */
  normalize?: boolean;
}

/**
 * Extracts distinct kanji characters from `text`, in order of first appearance.
 *
 * Deterministic: identical input always yields an identical array, independent of caller.
 */
export function extractKanjiCharacters(
  text: string | null | undefined,
  options: ExtractKanjiOptions = {},
): string[] {
  if (!text) return [];
  const { normalize = true } = options;
  const source = normalize ? text.normalize("NFC") : text;
  const matches = source.match(KANJI_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Converts katakana to hiragana for phonological comparison.
 *
 * Only `U+30A1–U+30F6` are offset by `0x60`. This deliberately excludes `U+30F7–U+30FA`
 * (ヷヸヹヺ) and `U+30FD–U+30FE` (ヽヾ), which have no hiragana counterpart and are left
 * unchanged — matching the behaviour of both former copies, so this is a pure relocation.
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(KATAKANA_TO_HIRAGANA_REGEX, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}
