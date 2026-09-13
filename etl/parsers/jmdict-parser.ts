/**
 * JMdict parser — built on the shared streaming XML foundation
 * (etl/parsers/xml-stream.ts). Public API unchanged since Phase 04.2.
 */

import type { Readable } from "node:stream";
import {
  decodeXmlEntities,
  hasTag,
  streamBlocksFrom,
  streamBlocksFromFile,
  tagBlocks,
  tagValues,
  type StreamOptions,
} from "./xml-stream";

export { decodeXmlEntities };

export type RawKanjiElement = {
  keb: string;
  kePri: string[];
  keInf: string[];
};

export type RawReadingElement = {
  reb: string;
  rePri: string[];
  reInf: string[];
  noKanji: boolean;
};

export type RawSense = {
  glosses: string[];
  pos: string[];
  field: string[];
  misc: string[];
  dial: string[];
  info: string[];
};

export type RawEntry = {
  entSeq: string;
  kanji: RawKanjiElement[];
  readings: RawReadingElement[];
  senses: RawSense[];
};

/** Parse a single raw <entry> block. */
export function parseEntryBlock(block: string): RawEntry | null {
  const seqMatch = /<ent_seq>\s*(\d+)\s*<\/ent_seq>/.exec(block);
  if (!seqMatch) return null;

  const kanji: RawKanjiElement[] = tagBlocks(block, "k_ele").map((b) => ({
    keb: (tagValues(b, "keb")[0] ?? "").trim(),
    kePri: tagValues(b, "ke_pri"),
    keInf: tagValues(b, "ke_inf"),
  }));

  const readings: RawReadingElement[] = tagBlocks(block, "r_ele").map((b) => ({
    reb: (tagValues(b, "reb")[0] ?? "").trim(),
    rePri: tagValues(b, "re_pri"),
    reInf: tagValues(b, "re_inf"),
    noKanji: hasTag(b, "re_nokanji"),
  }));

  const senses: RawSense[] = tagBlocks(block, "sense").map((b) => ({
    glosses: tagValues(b, "gloss").filter((g) => g.length > 0),
    pos: tagValues(b, "pos"),
    field: tagValues(b, "field"),
    misc: tagValues(b, "misc"),
    dial: tagValues(b, "dial"),
    info: tagValues(b, "s_inf"),
  }));

  return {
    entSeq: seqMatch[1],
    kanji: kanji.filter((k) => k.keb.length > 0),
    readings: readings.filter((r) => r.reb.length > 0),
    senses,
  };
}

export type ParseOptions = StreamOptions & {
  /** Stop after this many successfully parsed entries. */
  limit?: number;
};

export async function* streamEntriesFrom(
  stream: Readable,
  options: ParseOptions = {},
): AsyncGenerator<RawEntry> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;

  for await (const block of streamBlocksFrom(stream, "entry", options)) {
    const entry = parseEntryBlock(block);
    if (!entry) continue;
    yield entry;
    emitted += 1;
    if (emitted >= limit) return;
  }
}

export async function* streamEntriesFromFile(
  path: string,
  options: ParseOptions = {},
): AsyncGenerator<RawEntry> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;

  for await (const block of streamBlocksFromFile(path, "entry", options)) {
    const entry = parseEntryBlock(block);
    if (!entry) continue;
    yield entry;
    emitted += 1;
    if (emitted >= limit) return;
  }
}
