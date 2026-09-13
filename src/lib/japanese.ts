/**
 * Shared Japanese-script predicates.
 *
 * One definition used by routes, pages, services and repositories so that
 * "what counts as a kanji" can never drift between layers.
 */

/** True for a single CJK Unified Ideograph (incl. Extension A/B and compat). */
export function isKanjiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // Extension A
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // Compatibility Ideographs
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) // Extension B
  );
}

/** True only for exactly ONE kanji character. */
export function isKanjiLiteral(value: string): boolean {
  const chars = Array.from(value);
  if (chars.length !== 1) return false;
  return isKanjiCodePoint(value.codePointAt(0) ?? 0);
}

/** True when the string contains any kana or kanji. */
export function containsJapaneseScript(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

/** Kanji characters present in a word, in order of first appearance. */
export function extractKanji(value: string): string[] {
  const out: string[] = [];
  for (const char of Array.from(value)) {
    if (isKanjiCodePoint(char.codePointAt(0) ?? 0) && !out.includes(char)) {
      out.push(char);
    }
  }
  return out;
}

/**
 * Resolve a route segment to a single kanji.
 *
 * Next.js passes URL-encoded segments through to route params, so both the
 * encoded and already-decoded forms must be tolerated.
 */
export function resolveKanjiSegment(raw: string): string | null {
  if (isKanjiLiteral(raw)) return raw;
  try {
    const decoded = decodeURIComponent(raw);
    if (isKanjiLiteral(decoded)) return decoded;
  } catch {
    // Malformed percent-encoding falls through to null.
  }
  return null;
}
