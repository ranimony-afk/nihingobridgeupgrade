/**
 * Normalization: raw KANJIDIC2 shapes -> canonical kanji records.
 */

import { createHash } from "node:crypto";
import type { RawCharacter } from "../parsers/kanjidic-parser";
import { normalizeText } from "./jmdict-transform";

export type NormalizedKanjiReading = {
  type: string;
  value: string;
  position: number;
};

export type NormalizedKanjiMeaning = {
  language: string;
  value: string;
  position: number;
};

export type NormalizedCharacter = {
  source: string;
  literal: string;
  codepointUcs: string;
  strokeCount: number | null;
  strokeMiscounts: number[];
  radicalClassical: number | null;
  radicalNelson: number | null;
  grade: number | null;
  frequencyRank: number | null;
  jlptOld: number | null;
  variants: { type: string; value: string }[];
  dictionaryRefs: Record<string, string>;
  queryCodes: Record<string, string>;
  nanori: string[];
  readings: NormalizedKanjiReading[];
  meanings: NormalizedKanjiMeaning[];
  contentHash: string;
};

/** Reading types KANJIDIC2 defines. Anything else is dropped as unknown. */
export const KNOWN_READING_TYPES = new Set([
  "pinyin",
  "korean_r",
  "korean_h",
  "vietnam",
  "ja_on",
  "ja_kun",
]);

export function isKanjiLiteral(value: string): boolean {
  if ([...value].length !== 1) return false;
  const cp = value.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // Extension A
    (cp >= 0xf900 && cp <= 0xfaff) || // Compatibility Ideographs
    (cp >= 0x20000 && cp <= 0x2a6df) // Extension B
  );
}

export function computeKanjiContentHash(input: {
  literal: string;
  strokeCount: number | null;
  grade: number | null;
  readings: { type: string; value: string }[];
  meanings: { language: string; value: string }[];
}): string {
  const payload = JSON.stringify({
    l: input.literal,
    s: input.strokeCount,
    g: input.grade,
    r: input.readings.map((r) => `${r.type}:${r.value}`),
    m: input.meanings.map((m) => `${m.language}:${m.value}`),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function normalizeCharacter(
  raw: RawCharacter,
  source = "kanjidic2",
): NormalizedCharacter {
  const seenReadings = new Set<string>();
  const readings: NormalizedKanjiReading[] = [];
  for (const r of raw.readings) {
    const type = normalizeText(r.type).toLowerCase();
    const value = normalizeText(r.value);
    if (!KNOWN_READING_TYPES.has(type) || value.length === 0) continue;
    const key = `${type}:${value}`;
    if (seenReadings.has(key)) continue;
    seenReadings.add(key);
    readings.push({ type, value, position: readings.length });
  }

  const seenMeanings = new Set<string>();
  const meanings: NormalizedKanjiMeaning[] = [];
  for (const m of raw.meanings) {
    const language = normalizeText(m.lang).toLowerCase() || "en";
    const value = normalizeText(m.value);
    if (value.length === 0) continue;
    const key = `${language}:${value.toLowerCase()}`;
    if (seenMeanings.has(key)) continue;
    seenMeanings.add(key);
    meanings.push({ language, value, position: meanings.length });
  }

  const literal = raw.literal.trim();

  // Prefer the declared UCS codepoint; otherwise derive it from the literal.
  const codepointUcs =
    raw.codepoints.ucs ??
    (literal.codePointAt(0)?.toString(16).padStart(4, "0") ?? "");

  const base = {
    source,
    literal,
    codepointUcs: codepointUcs.toLowerCase(),
    strokeCount: raw.strokeCount,
    strokeMiscounts: raw.strokeMiscounts,
    radicalClassical: raw.radicals.classical ?? null,
    radicalNelson: raw.radicals.nelson_c ?? null,
    grade: raw.grade,
    frequencyRank: raw.frequency,
    jlptOld: raw.jlptOld,
    variants: raw.variants.map((v) => ({ type: v.type, value: v.value })),
    dictionaryRefs: raw.dictionaryRefs,
    queryCodes: raw.queryCodes,
    nanori: raw.nanori.map((n) => normalizeText(n)).filter((n) => n.length > 0),
    readings,
    meanings,
  };

  return { ...base, contentHash: computeKanjiContentHash(base) };
}
