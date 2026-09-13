/**
 * Memory-bounded streaming JMdict parser.
 *
 * JMdict is a large, highly regular XML document. Rather than loading the whole
 * DOM (which is what makes naive importers OOM), we consume the byte stream and
 * emit one raw <entry>…</entry> block at a time, then parse that small block.
 *
 * Dependency-free by design: no XML library is added to the web app's runtime
 * dependency tree for an offline batch job.
 */

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import type { Readable } from "node:stream";

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

const XML_ESCAPES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Decode XML character entities. JMdict also uses *named* entities for tags
 * (e.g. `&adj-na;` declared in the DOCTYPE). Those are unwrapped to their bare
 * name (`adj-na`) which is exactly the normalized tag we want to store.
 */
export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][\w-]*);/g, (_match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    const known = XML_ESCAPES[body];
    if (known !== undefined) return known;
    // JMdict tag entity → bare tag name
    return body;
  });
}

/** Collect the text content of every occurrence of a simple tag. */
function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlEntities(m[1]).trim());
  }
  return out;
}

/** Collect the inner XML of every occurrence of a container tag. */
function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function hasSelfClosing(xml: string, tag: string): boolean {
  return new RegExp(`<${tag}\\s*/>`).test(xml) || new RegExp(`<${tag}>`).test(xml);
}

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
    noKanji: hasSelfClosing(b, "re_nokanji"),
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

export type ParseOptions = {
  /** Stop after this many entries (fixture-first safety valve). */
  limit?: number;
  /** Guard against a pathological document with no closing tags. */
  maxBufferBytes?: number;
};

/**
 * Stream <entry> blocks from a readable stream.
 * Buffer never grows beyond one entry plus the current chunk.
 */
export async function* streamEntriesFrom(
  stream: Readable,
  options: ParseOptions = {},
): AsyncGenerator<RawEntry> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const maxBuffer = options.maxBufferBytes ?? 8 * 1024 * 1024;

  let buffer = "";
  let emitted = 0;

  stream.setEncoding("utf8");

  for await (const chunk of stream) {
    buffer += chunk as string;

    if (buffer.length > maxBuffer) {
      throw new Error(
        `JMdict parse buffer exceeded ${maxBuffer} bytes without a closing </entry> — input is likely malformed`,
      );
    }

    let start = buffer.indexOf("<entry>");
    let end = buffer.indexOf("</entry>");

    while (start !== -1 && end !== -1 && end > start) {
      const block = buffer.slice(start + "<entry>".length, end);
      buffer = buffer.slice(end + "</entry>".length);

      const entry = parseEntryBlock(block);
      if (entry) {
        yield entry;
        emitted += 1;
        if (emitted >= limit) return;
      }

      start = buffer.indexOf("<entry>");
      end = buffer.indexOf("</entry>");
    }

    // Discard content preceding the next entry (DOCTYPE, whitespace, etc.)
    if (start === -1 && buffer.length > maxBuffer / 2) {
      buffer = buffer.slice(-16);
    }
  }
}

/** Stream entries from a file path. Transparently handles .gz. */
export async function* streamEntriesFromFile(
  path: string,
  options: ParseOptions = {},
): AsyncGenerator<RawEntry> {
  const fileStream = createReadStream(path);
  const stream: Readable = path.endsWith(".gz")
    ? (fileStream.pipe(createGunzip()) as unknown as Readable)
    : fileStream;

  yield* streamEntriesFrom(stream, options);
}
