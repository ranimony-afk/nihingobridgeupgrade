import "server-only";

import { classifyJlptLevel } from "@/services/dataquality/jlptChecks";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/types/translation";
import type { CanonicalDictionaryRow } from "@/services/publication";
import type { MobileDictionaryEntryCard } from "@/types/mobileDictionary";

/**
 * Gate A11 — mobile dictionary search adapter.
 *
 * Pure, side-effect-free helpers behind `./route.ts`. This is an **adapter**, not a second
 * dictionary engine: matching, ranking, filtering, script detection and query sanitation are all
 * performed by the existing canonical services, and nothing here re-implements them.
 *
 * Three boundaries live here so they can be unit-tested independently of the transport:
 *
 * 1. {@link projectEntry} — the hand-built 9-field projection frozen by A10 §A10.6. The mobile
 *    item is **never** a database-row spread; `projectEntry` is the only place a canonical row is
 *    converted into a mobile payload, so a `{ ...row }` regression is a compile error (the declared
 *    return type rejects unknown keys) rather than a silent field leak.
 * 2. {@link parseTargetLanguage} — the language-axis validation frozen by A10 §A10.12.
 * 3. {@link isQueryLengthValid} via {@link MAX_QUERY_LENGTH} — the defensive `q` cap added by A12/D-14.
 */

/**
 * Flattens the stored `senses[].glosses[]` nesting into the flat gloss list the contract requires
 * (`primaryGlosses`). A10 §A10.6: the jsonb nesting is **never** exposed, and the flattening
 * already exists in-repo in the unified search dictionary branch (`senses.flatMap(s => s.glosses)`).
 *
 * Storage is `jsonb`, so the value is typed but not guaranteed at runtime: malformed groups are
 * skipped rather than allowed to throw inside a read path. Order is preserved (sense groups in
 * stored order, glosses within a group in stored order) so the display order is deterministic.
 */
export function flattenGlosses(senses: CanonicalDictionaryRow["senses"]): string[] {
  const groups = Array.isArray(senses) ? senses : [];

  const glosses: string[] = [];
  for (const group of groups) {
    if (!group || !Array.isArray(group.glosses)) continue;
    for (const gloss of group.glosses) {
      if (typeof gloss === "string") glosses.push(gloss);
    }
  }
  return glosses;
}

/**
 * Projects one canonical row into the frozen mobile search item (A10 §A10.6).
 *
 * Every field below has a mapped source column or a named derivation. Deliberately **absent**:
 *
 * - `sourceRef` — §6.1 never-expose (raw provenance string); needs the resolved display form (D-5);
 * - `frequencyRank`, `partsOfSpeech`, `tags` — deferred; not in the frozen card;
 * - `localizedGlosses`, `isKeigo`, `keigoType`, `hasAudio`, `audioUrl` — no producer exists (D-6..D-8).
 *
 * `jlptLevel` is stored verbatim **including the `"NONE"` sentinel**, and `jlptStatus` is derived
 * via the canonical `classifyJlptLevel` — a tri-state, never a boolean (A9 decision 3).
 */
export function projectEntry(row: CanonicalDictionaryRow): MobileDictionaryEntryCard {
  return {
    id: row.id,
    headword: row.headword,
    reading: row.reading,
    romaji: row.romaji,
    primaryGlosses: flattenGlosses(row.senses),
    jlptLevel: row.jlptLevel,
    // Derived, never stored: `"NONE"`/null/empty classify as "unknown", an unrepresentable
    // value as "invalid". A truthiness test here would silently destroy the sentinel.
    jlptStatus: classifyJlptLevel(row.jlptLevel),
    isCommon: row.isCommon,
    kanjiCharacters: Array.isArray(row.kanjiCharacters)
      ? row.kanjiCharacters.filter((character): character is string => typeof character === "string")
      : [],
  };
}

/**
 * Defensive maximum length for `q`, in **UTF-16 code units** (JavaScript `String#length`).
 *
 * Gate A12/D-14. A10 §A10.4 froze `q` as required-but-unbounded; A12 supplies the number, because a
 * measurement showed the search cost is linear in the **pattern length** — the canonical service
 * escapes LIKE metacharacters (`escapeLikePattern`), then wraps the escaped value in `%…%` and
 * attempts it at every scanned row — and the endpoint is unauthenticated (D-13 is deferred), so an
 * unbounded `q` is a per-request CPU amplification vector rather than a merely untidy input:
 *
 * | `q` length | measured time (local PGlite, 100 030 rows) |
 * | :--------- | :---------------------------------------- |
 * | 1          | 1 001 ms                                   |
 * | 100        | 1 557 ms                                   |
 * | 1 000      | 8 863 ms                                   |
 * | 10 000     | 83 730 ms                                  |
 *
 * **Value chosen for parity with the repository's existing public validation surface** — the
 * module-private `MAX_QUERY_LENGTH = 1000` in `src/app/api/ai/answer/route.ts` — rather than invented
 * here. It is deliberately mirrored, not imported: that constant is not exported, and the AI route is
 * not a dependency of the mobile boundary. The residual cost *at* the cap belongs to the deployment
 * abuse-protection gate (D-13), not to this limit; see the A12 report.
 *
 * The limit applies to the **sanitized** value (`sanitizeSearchQuery` strips NULs and trims), matching
 * the frozen order in which emptiness is already judged after sanitization (§A10.16): padding is
 * therefore neither a way to smuggle content past the cap nor a reason to reject a legitimate query.
 * Over-limit input is **rejected, never truncated** — silent truncation would answer a different query
 * than the one asked.
 */
export const MAX_QUERY_LENGTH = 1000;

/** True when `query` is within {@link MAX_QUERY_LENGTH}. Pure, so the boundary is unit-testable. */
export function isQueryLengthValid(query: string): boolean {
  return query.length <= MAX_QUERY_LENGTH;
}

/**
 * Validates the `targetLanguage` wire parameter against the canonical language vocabulary.
 *
 * **Inert in v1** (A10 §A10.12): the parsed value is intentionally not sent to the search service
 * and not echoed in the response, because no provenance-safe translation read path exists yet
 * (13.5C: the translation storage primitive must not be wired to an API route). The parse exists so
 * that the boundary is explicit and typed, and so the A12 localization gate consumes an already
 * validated value instead of re-deriving the vocabulary.
 *
 * An unsupported value is **not an error** — A10 §A10.16 assigns unknown/out-of-domain parameters
 * the ignored/200 behaviour, and §A10.12 forbids inventing a rejection for this parameter.
 */
export function parseTargetLanguage(raw: string | null | undefined): SupportedLanguage | undefined {
  if (typeof raw !== "string") return undefined;
  const candidate = raw.trim();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate)
    ? (candidate as SupportedLanguage)
    : undefined;
}
