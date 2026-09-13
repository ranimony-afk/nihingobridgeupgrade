/**
 * KRADFILE parser.
 *
 * Record format: `漢 : component1 component2 ...`
 * Blank lines and `#` comments are ignored. KRADFILE is a plain text index,
 * not XML; it shares the existing line-streaming infrastructure.
 */

import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { streamTsvRows, streamTsvRowsFromFile } from "./tsv-stream";

export type RawKradRecord = {
  literal: string;
  components: string[];
};

export function parseKradLine(line: string): RawKradRecord | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf(":");
  if (separator === -1) return null;

  const literal = trimmed.slice(0, separator).trim();
  const right = trimmed.slice(separator + 1).trim();
  const components = right ? right.split(/\s+/).filter(Boolean) : [];
  if (!literal || components.length === 0) return null;
  return { literal, components: [...new Set(components)] };
}

/** Read a plain-text file by reusing the bounded line stream. */
export async function* streamKradRecordsFrom(
  stream: Readable,
  limit = Number.POSITIVE_INFINITY,
): AsyncGenerator<RawKradRecord> {
  let emitted = 0;
  for await (const row of streamTsvRows(stream)) {
    const record = parseKradLine(row.join("\t"));
    if (!record) continue;
    yield record;
    emitted += 1;
    if (emitted >= limit) return;
  }
}

export async function* streamKradRecordsFromFile(
  path: string,
  limit = Number.POSITIVE_INFINITY,
): AsyncGenerator<RawKradRecord> {
  if (path.endsWith(".gz")) {
    // streamTsvRowsFromFile is already gzip-aware.
    let emitted = 0;
    for await (const row of streamTsvRowsFromFile(path)) {
      const record = parseKradLine(row.join("\t"));
      if (!record) continue;
      yield record;
      emitted += 1;
      if (emitted >= limit) return;
    }
    return;
  }
  yield* streamKradRecordsFrom(createReadStream(path), limit);
}
