/**
 * Normalization: raw Tatoeba rows -> canonical sentence records.
 *
 * Attribution is computed here, never left to the caller, so no code path can
 * produce a sentence without a licence-compliant attribution string.
 */

import { createHash } from "node:crypto";
import type { RawSentence } from "../parsers/tatoeba-parser";

export type NormalizedSentence = {
  source: string;
  sourceId: string;
  lang: string;
  text: string;
  ownerUsername: string;
  ownerUnknown: boolean;
  attribution: string;
  license: string;
  charLength: number;
  contentHash: string;
};

/**
 * Collapse whitespace but preserve the sentence exactly otherwise — Tatoeba
 * text is user-authored content we are licensed to reproduce, not reformat.
 */
export function normalizeSentenceText(value: string): string {
  return value.replace(/[ \t\u3000]+/g, " ").trim();
}

/**
 * Build the CC BY 2.0 FR attribution string for a single sentence.
 * Orphaned sentences (no owner) attribute to the project itself so that an
 * attribution is ALWAYS present.
 */
export function buildAttribution(
  username: string | null,
  sourceId: string,
  license: string,
): string {
  const who = username && username.length > 0 ? username : "Tatoeba";
  return `${who} — Tatoeba sentence #${sourceId} (${license})`;
}

export function computeSentenceContentHash(input: {
  sourceId: string;
  lang: string;
  text: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({ i: input.sourceId, l: input.lang, t: input.text }))
    .digest("hex");
}

export function normalizeSentence(
  raw: RawSentence,
  source = "tatoeba",
  license = "CC BY 2.0 FR",
): NormalizedSentence {
  const text = normalizeSentenceText(raw.text);
  const ownerUnknown = raw.username === null || raw.username.length === 0;
  const ownerUsername = ownerUnknown ? "" : (raw.username as string);

  const base = {
    source,
    sourceId: raw.sourceId,
    lang: raw.lang.toLowerCase(),
    text,
    ownerUsername,
    ownerUnknown,
    attribution: buildAttribution(raw.username, raw.sourceId, license),
    license,
    charLength: [...text].length,
  };

  return { ...base, contentHash: computeSentenceContentHash(base) };
}
