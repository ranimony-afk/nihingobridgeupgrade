/**
 * Conservative furigana derivation from a JMdict headword + reading.
 *
 * This deliberately rejects ambiguity instead of guessing. A result is emitted
 * only when there is one unique JMdict reading and at most one contiguous kanji
 * run. Kana surrounding that run must match the reading exactly after a
 * hiragana/katakana normalisation.
 */

export type FuriganaSegment = {
  text: string;
  reading: string;
  ruby: boolean;
};

export type FuriganaResult =
  | { ok: true; segments: FuriganaSegment[]; reason: "unambiguous" | "kana-only" }
  | { ok: false; reason: string };

function isKanji(char: string): boolean {
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2a6df)
  );
}

/** Katakana → hiragana so readings can be compared script-independently. */
export function toHiragana(value: string): string {
  return Array.from(value)
    .map((char) => {
      const cp = char.codePointAt(0) ?? 0;
      return cp >= 0x30a1 && cp <= 0x30f6
        ? String.fromCodePoint(cp - 0x60)
        : char;
    })
    .join("");
}

type Run = { text: string; kanji: boolean };

function splitRuns(headword: string): Run[] {
  const out: Run[] = [];
  for (const char of Array.from(headword)) {
    const kanji = isKanji(char);
    const last = out[out.length - 1];
    if (last && last.kanji === kanji) last.text += char;
    else out.push({ text: char, kanji });
  }
  return out;
}

/**
 * Derive ruby segments. `readings` must be the full set of entry readings,
 * rather than a caller-selected first reading, so source ambiguity is visible.
 */
export function deriveFurigana(headword: string, readings: string[]): FuriganaResult {
  const unique = [...new Set(readings.map((r) => r.trim()).filter(Boolean))];
  if (unique.length !== 1) {
    return { ok: false, reason: `requires exactly one reading; found ${unique.length}` };
  }

  const reading = unique[0];
  const runs = splitRuns(headword);
  const kanjiRuns = runs.filter((run) => run.kanji);

  // Kana-only: store the source reading only when it exactly confirms the
  // surface form. A ruby annotation would add no value, but the standardised
  // segment remains useful to downstream renderers.
  if (kanjiRuns.length === 0) {
    if (toHiragana(headword) !== toHiragana(reading)) {
      return { ok: false, reason: "kana-only surface and reading do not match" };
    }
    return {
      ok: true,
      reason: "kana-only",
      segments: [{ text: headword, reading, ruby: false }],
    };
  }

  // Mapping multiple separated kanji groups to a single reading is ambiguous
  // without a morphological analyser / a trusted furigana dataset.
  if (kanjiRuns.length !== 1) {
    return { ok: false, reason: `contains ${kanjiRuns.length} separate kanji runs` };
  }

  const kanjiIndex = runs.findIndex((run) => run.kanji);
  const before = runs.slice(0, kanjiIndex).map((run) => run.text).join("");
  const after = runs.slice(kanjiIndex + 1).map((run) => run.text).join("");
  const normalReading = toHiragana(reading);
  const normalBefore = toHiragana(before);
  const normalAfter = toHiragana(after);

  if (!normalReading.startsWith(normalBefore) || !normalReading.endsWith(normalAfter)) {
    return { ok: false, reason: "kana context does not align with the source reading" };
  }

  const chars = Array.from(reading);
  const beforeLength = Array.from(before).length;
  const afterLength = Array.from(after).length;
  const rubyChars = chars.slice(beforeLength, chars.length - afterLength);
  if (rubyChars.length === 0) {
    return { ok: false, reason: "no reading remains for the kanji run" };
  }

  const segments: FuriganaSegment[] = [];
  if (before) segments.push({ text: before, reading: before, ruby: false });
  segments.push({ text: kanjiRuns[0].text, reading: rubyChars.join(""), ruby: true });
  if (after) segments.push({ text: after, reading: after, ruby: false });

  return { ok: true, reason: "unambiguous", segments };
}
