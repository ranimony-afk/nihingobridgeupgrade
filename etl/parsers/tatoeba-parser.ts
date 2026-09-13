/**
 * Tatoeba parsers.
 *
 * sentences_detailed.csv:
 *   id [tab] lang [tab] text [tab] username [tab] date_added [tab] date_modified
 *
 * We deliberately use the *detailed* export, not sentences.csv, because
 * CC BY 2.0 FR requires citing each sentence's author and only the detailed
 * export carries `username`. See the Phase 04.4 verification report.
 *
 * links.csv:
 *   sentence_id [tab] translation_id
 */

import type { Readable } from "node:stream";
import {
  isNullField,
  streamTsvRows,
  streamTsvRowsFromFile,
  type TsvOptions,
} from "./tsv-stream";

export type RawSentence = {
  sourceId: string;
  lang: string;
  text: string;
  username: string | null;
  dateAdded: string | null;
  dateModified: string | null;
};

export type RawLink = {
  sourceId: string;
  translationSourceId: string;
};

/** Parse one row of sentences_detailed.csv. */
export function parseSentenceRow(row: string[]): RawSentence | null {
  // Minimum viable: id, lang, text. Detailed export adds username + dates.
  if (row.length < 3) return null;

  const [sourceId, lang, text, username, dateAdded, dateModified] = row;
  if (!sourceId || !lang || text === undefined) return null;

  return {
    sourceId: sourceId.trim(),
    lang: lang.trim(),
    text,
    username: username === undefined || isNullField(username) ? null : username.trim(),
    dateAdded: dateAdded === undefined || isNullField(dateAdded) ? null : dateAdded,
    dateModified:
      dateModified === undefined || isNullField(dateModified) ? null : dateModified,
  };
}

/** Parse one row of links.csv. */
export function parseLinkRow(row: string[]): RawLink | null {
  if (row.length < 2) return null;
  const sourceId = row[0]?.trim();
  const translationSourceId = row[1]?.trim();
  if (!sourceId || !translationSourceId) return null;
  if (!/^\d+$/.test(sourceId) || !/^\d+$/.test(translationSourceId)) return null;
  // A sentence cannot be its own translation.
  if (sourceId === translationSourceId) return null;
  return { sourceId, translationSourceId };
}

export type ParseOptions = TsvOptions;

export async function* streamSentencesFrom(
  stream: Readable,
  options: ParseOptions = {},
): AsyncGenerator<RawSentence> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;
  // Read rows unbounded; the limit applies to successfully parsed sentences.
  for await (const row of streamTsvRows(stream, { ...options, limit: undefined })) {
    const sentence = parseSentenceRow(row);
    if (!sentence) continue;
    yield sentence;
    emitted += 1;
    if (emitted >= limit) return;
  }
}

export async function* streamSentencesFromFile(
  path: string,
  options: ParseOptions = {},
): AsyncGenerator<RawSentence> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let emitted = 0;
  for await (const row of streamTsvRowsFromFile(path, { ...options, limit: undefined })) {
    const sentence = parseSentenceRow(row);
    if (!sentence) continue;
    yield sentence;
    emitted += 1;
    if (emitted >= limit) return;
  }
}

export async function* streamLinksFromFile(
  path: string,
  options: ParseOptions = {},
): AsyncGenerator<RawLink> {
  for await (const row of streamTsvRowsFromFile(path, options)) {
    const link = parseLinkRow(row);
    if (link) yield link;
  }
}
