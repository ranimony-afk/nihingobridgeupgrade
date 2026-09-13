import fs from "node:fs";

import { streamLines } from "../lib/util.mjs";

/**
 * Tanaka corpus (EDRDG) parser.
 *
 * File format (examples.utf.gz):
 *
 *   A: 彼は忙しい生活の中で家族と会うことがない。\tHe doesn't see his family...#ID=303697_100000
 *   B: 彼(かれ)[01] は 忙しい(いそがしい) 生活 の 中(なか) で(#2028980) ...
 *
 * Only the "A:" lines (Japanese + English pair plus the upstream id) are used.
 */
export async function* parseTanakaExamples(file) {
  for await (const line of streamLines(file)) {
    if (!line.startsWith("A: ")) continue;
    const body = line.slice(3);
    const idMatch = body.match(/#ID=(\S+)\s*$/);
    const externalId = idMatch ? idMatch[1] : null;
    const text = idMatch ? body.slice(0, idMatch.index) : body;
    const tab = text.indexOf("\t");
    if (tab === -1) continue;
    const japanese = text.slice(0, tab).trim();
    const english = text.slice(tab + 1).trim();
    if (!japanese || !english) continue;
    yield { japanese, english, externalId };
  }
}

/** Loads the curated, project-authored grammar point definitions. */
export function loadGrammarSeed(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw);
  const points = Array.isArray(parsed) ? parsed : parsed.points ?? [];
  return {
    license: parsed.license ?? null,
    notes: parsed.notes ?? null,
    points,
  };
}
