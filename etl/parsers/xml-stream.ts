/**
 * Shared, dependency-free streaming XML utilities.
 *
 * Extracted in Phase 04.3 so JMdict and KANJIDIC2 share ONE parsing
 * foundation rather than growing two parallel implementations.
 *
 * Strategy: consume the byte stream and emit one top-level record block at a
 * time. Memory stays bounded to a single record plus the current chunk, which
 * is what allows 200k+ entry documents to be processed safely.
 */

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import type { Readable } from "node:stream";

const XML_ESCAPES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Decode XML character entities.
 *
 * JMdict/KANJIDIC2 also use *named* entities for tags (e.g. `&adj-na;`,
 * declared in the DOCTYPE). Those unwrap to their bare name, which is exactly
 * the normalized tag we want to persist.
 */
export function decodeXmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][\w-]*);/g, (_m, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    const known = XML_ESCAPES[body];
    return known !== undefined ? known : body;
  });
}

export type XmlNode = {
  attrs: Record<string, string>;
  text: string;
};

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  const re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1] ?? m[3];
    const value = m[2] ?? m[4] ?? "";
    attrs[key] = decodeXmlEntities(value);
  }
  return attrs;
}

/** Every occurrence of `tag` with its attributes and decoded text. */
export function tagNodes(xml: string, tag: string): XmlNode[] {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: XmlNode[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: parseAttrs(m[1]), text: decodeXmlEntities(m[2]).trim() });
  }
  return out;
}

/** Decoded text content of every occurrence of `tag`. */
export function tagValues(xml: string, tag: string): string[] {
  return tagNodes(xml, tag).map((n) => n.text);
}

/** Raw inner XML of every occurrence of a container `tag`. */
export function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** True when `tag` is present, self-closing or not. */
export function hasTag(xml: string, tag: string): boolean {
  return (
    new RegExp(`<${tag}\\s*/>`).test(xml) || new RegExp(`<${tag}(\\s[^>]*)?>`).test(xml)
  );
}

export type StreamOptions = {
  /** Guard against a pathological document with no closing tag. */
  maxBufferBytes?: number;
};

/**
 * Stream the inner XML of each `<tag>…</tag>` record.
 * Handles attributes on the opening tag and records split across chunks.
 */
export async function* streamBlocksFrom(
  stream: Readable,
  tag: string,
  options: StreamOptions = {},
): AsyncGenerator<string> {
  const maxBuffer = options.maxBufferBytes ?? 8 * 1024 * 1024;
  const open = `<${tag}`;
  const close = `</${tag}>`;

  let buffer = "";
  stream.setEncoding("utf8");

  for await (const chunk of stream) {
    buffer += chunk as string;

    if (buffer.length > maxBuffer) {
      throw new Error(
        `XML parse buffer exceeded ${maxBuffer} bytes without a closing ${close} — input is likely malformed`,
      );
    }

    for (;;) {
      const openIdx = buffer.indexOf(open);
      if (openIdx === -1) break;

      // Reject prefix collisions such as <characterset> when tag is <character>.
      const after = buffer[openIdx + open.length];
      if (after !== ">" && after !== " " && after !== "\n" && after !== "\t" && after !== "\r") {
        if (after === undefined) break; // need more input to decide
        buffer = buffer.slice(openIdx + open.length);
        continue;
      }

      const contentStart = buffer.indexOf(">", openIdx);
      if (contentStart === -1) break;

      const closeIdx = buffer.indexOf(close, contentStart);
      if (closeIdx === -1) break;

      yield buffer.slice(contentStart + 1, closeIdx);
      buffer = buffer.slice(closeIdx + close.length);
    }

    // Drop leading noise (DOCTYPE, header, whitespace) we will never need.
    if (buffer.indexOf(open) === -1 && buffer.length > maxBuffer / 2) {
      buffer = buffer.slice(-Math.max(16, open.length));
    }
  }
}

/** Stream record blocks from a file path. Transparently handles .gz. */
export function streamBlocksFromFile(
  path: string,
  tag: string,
  options: StreamOptions = {},
): AsyncGenerator<string> {
  const fileStream = createReadStream(path);
  const stream: Readable = path.endsWith(".gz")
    ? (fileStream.pipe(createGunzip()) as unknown as Readable)
    : fileStream;
  return streamBlocksFrom(stream, tag, options);
}
