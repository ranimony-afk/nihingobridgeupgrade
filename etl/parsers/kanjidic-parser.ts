/**
 * KANJIDIC2 parser.
 *
 * Unlike JMdict, KANJIDIC2 encodes most of its meaning in ATTRIBUTES
 * (`r_type`, `m_lang`, `rad_type`, `cp_type`, `dr_type`, `qc_type`), so this
 * parser is attribute-aware throughout.
 */

import type { Readable } from "node:stream";
import {
  streamBlocksFrom,
  streamBlocksFromFile,
  tagBlocks,
  tagNodes,
  tagValues,
  type StreamOptions,
} from "./xml-stream";

export type RawReading = { type: string; value: string };
export type RawMeaning = { lang: string; value: string };
export type RawVariant = { type: string; value: string };

export type RawCharacter = {
  literal: string;
  codepoints: Record<string, string>;
  radicals: Record<string, number>;
  grade: number | null;
  strokeCount: number | null;
  strokeMiscounts: number[];
  frequency: number | null;
  jlptOld: number | null;
  variants: RawVariant[];
  dictionaryRefs: Record<string, string>;
  queryCodes: Record<string, string>;
  readings: RawReading[];
  meanings: RawMeaning[];
  nanori: string[];
};

function intOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse a single <character> block. */
export function parseCharacterBlock(block: string): RawCharacter | null {
  const literal = (tagValues(block, "literal")[0] ?? "").trim();
  if (literal.length === 0) return null;

  const codepoints: Record<string, string> = {};
  for (const node of tagNodes(block, "cp_value")) {
    const type = node.attrs.cp_type;
    if (type) codepoints[type] = node.text;
  }

  const radicals: Record<string, number> = {};
  for (const node of tagNodes(block, "rad_value")) {
    const type = node.attrs.rad_type;
    const n = intOrNull(node.text);
    if (type && n !== null) radicals[type] = n;
  }

  // <misc> holds grade / stroke_count / freq / jlpt / variant
  const miscBlock = tagBlocks(block, "misc")[0] ?? "";
  const strokeValues = tagValues(miscBlock, "stroke_count")
    .map((v) => intOrNull(v))
    .filter((v): v is number => v !== null);

  const variants: RawVariant[] = tagNodes(miscBlock, "variant")
    .filter((n) => n.attrs.var_type && n.text.length > 0)
    .map((n) => ({ type: n.attrs.var_type, value: n.text }));

  const dictionaryRefs: Record<string, string> = {};
  for (const node of tagNodes(block, "dic_ref")) {
    const type = node.attrs.dr_type;
    if (type) dictionaryRefs[type] = node.text;
  }

  const queryCodes: Record<string, string> = {};
  for (const node of tagNodes(block, "q_code")) {
    const type = node.attrs.qc_type;
    if (type) queryCodes[type] = node.text;
  }

  // Readings/meanings live inside <reading_meaning><rmgroup>. Nanori sits
  // in <reading_meaning> but OUTSIDE rmgroup, so it must be read separately.
  const rmBlock = tagBlocks(block, "reading_meaning")[0] ?? "";
  const readings: RawReading[] = [];
  const meanings: RawMeaning[] = [];

  for (const group of tagBlocks(rmBlock, "rmgroup")) {
    for (const node of tagNodes(group, "reading")) {
      const type = node.attrs.r_type;
      if (type && node.text.length > 0) readings.push({ type, value: node.text });
    }
    for (const node of tagNodes(group, "meaning")) {
      if (node.text.length === 0) continue;
      // No m_lang attribute means English.
      meanings.push({ lang: node.attrs.m_lang ?? "en", value: node.text });
    }
  }

  const nanori = tagValues(rmBlock, "nanori").filter((v) => v.length > 0);

  return {
    literal,
    codepoints,
    radicals,
    grade: intOrNull(tagValues(miscBlock, "grade")[0]),
    strokeCount: strokeValues[0] ?? null,
    strokeMiscounts: strokeValues.slice(1),
    frequency: intOrNull(tagValues(miscBlock, "freq")[0]),
    jlptOld: intOrNull(tagValues(miscBlock, "jlpt")[0]),
    variants,
    dictionaryRefs,
    queryCodes,
    readings,
    meanings,
    nanori,
  };
}

export type ParseOptions = StreamOptions & { limit?: number };

export async function* streamCharactersFrom(
  stream: Readable,
  options: ParseOptions = {},
): AsyncGenerator<RawCharacter> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;

  for await (const block of streamBlocksFrom(stream, "character", options)) {
    const character = parseCharacterBlock(block);
    if (!character) continue;
    yield character;
    emitted += 1;
    if (emitted >= limit) return;
  }
}

export async function* streamCharactersFromFile(
  path: string,
  options: ParseOptions = {},
): AsyncGenerator<RawCharacter> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;

  for await (const block of streamBlocksFromFile(path, "character", options)) {
    const character = parseCharacterBlock(block);
    if (!character) continue;
    yield character;
    emitted += 1;
    if (emitted >= limit) return;
  }
}
