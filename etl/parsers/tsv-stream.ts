/**
 * Shared streaming TSV reader.
 *
 * Tatoeba exports are tab-separated with NO quoting: a raw tab is always a
 * field delimiter and a raw newline is always a record delimiter. Using a
 * CSV parser here would be wrong (it would try to honour quote characters
 * that Tatoeba treats as ordinary text).
 *
 * Memory stays bounded to one line plus the current chunk.
 */

import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import type { Readable } from "node:stream";

/** Tatoeba uses \N for a NULL/absent field. */
export const TSV_NULL = "\\N";

export function isNullField(value: string): boolean {
  return value === TSV_NULL || value.trim() === "";
}

export type TsvOptions = {
  /** Stop after this many yielded rows. */
  limit?: number;
  /** Guard against a pathological line with no newline. */
  maxLineBytes?: number;
  /** Skip a leading header line. Tatoeba exports have none. */
  hasHeader?: boolean;
};

/** Stream rows (already split on tab) from a readable stream. */
export async function* streamTsvRows(
  stream: Readable,
  options: TsvOptions = {},
): AsyncGenerator<string[]> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const maxLine = options.maxLineBytes ?? 1024 * 1024;

  let buffer = "";
  let emitted = 0;
  let isFirst = true;

  stream.setEncoding("utf8");

  for await (const chunk of stream) {
    buffer += chunk as string;

    if (buffer.length > maxLine) {
      throw new Error(
        `TSV line exceeded ${maxLine} bytes without a newline — input is likely malformed`,
      );
    }

    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      // Strip a trailing \r so CRLF files behave identically.
      let line = buffer.slice(0, newlineIdx);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      buffer = buffer.slice(newlineIdx + 1);

      if (line.length > 0) {
        if (isFirst && options.hasHeader) {
          isFirst = false;
        } else {
          isFirst = false;
          yield line.split("\t");
          emitted += 1;
          if (emitted >= limit) return;
        }
      }

      newlineIdx = buffer.indexOf("\n");
    }
  }

  // Final line without a trailing newline.
  if (buffer.length > 0) {
    let line = buffer;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.length > 0 && !(isFirst && options.hasHeader)) {
      yield line.split("\t");
    }
  }
}

/** Stream TSV rows from a file path. Transparently handles .gz. */
export function streamTsvRowsFromFile(
  path: string,
  options: TsvOptions = {},
): AsyncGenerator<string[]> {
  const fileStream = createReadStream(path);
  const stream: Readable = path.endsWith(".gz")
    ? (fileStream.pipe(createGunzip()) as unknown as Readable)
    : fileStream;
  return streamTsvRows(stream, options);
}
