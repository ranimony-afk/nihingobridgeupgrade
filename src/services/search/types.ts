import type { JLPTLevel } from "@/etl/grammar/types";
import type { PublicationStore } from "@/services/publication";

export type SearchTarget =
  | "dictionary"
  | "kanji"
  | "radicals"
  | "grammar"
  | "sentences"
  | "jlpt";

export const ALL_SEARCH_TARGETS: readonly SearchTarget[] = [
  "dictionary",
  "kanji",
  "radicals",
  "grammar",
  "sentences",
  "jlpt",
] as const;

/**
 * The canonical search-script vocabulary — the single source of truth for the
 * script/character axis.
 *
 * Produced by `detectSearchScript` (src/services/search/matcher.ts), echoed to
 * clients as `detectedScript` (`UnifiedSearchResponse.detectedScript`,
 * `MobileSearchResponse.detectedScript`) and published to mobile clients by
 * `docs/architecture/MOBILE-DICTIONARY-API-CONTRACT.md` §10.1. The mobile union
 * that used to restate these members — with `tamil` and `malayalam` added and
 * `empty`/`mixed` omitted — now references this type (Gate A7).
 *
 * ## What the axis means
 *
 * The classifier tests **characters**, not languages:
 *
 * | Value | Condition (from matcher.ts) |
 * | :--- | :--- |
 * | `empty` | blank after trim |
 * | `kanji` | contains kanji, no kana (Latin text alongside kanji does not change this) |
 * | `kana` | contains kana, no kanji |
 * | `japanese` | contains both kanji and kana |
 * | `romaji` | the whole query matches `/^[a-zA-Z0-9\s\-–—’'.,!?_()]+$/` |
 * | `mixed` | none of the above — e.g. Tamil `நீர்`, Malayalam `വെള്ളം`, `café`, `@@@` |
 *
 * ## Why exactly these six values (Gate A7)
 *
 * `"english"` was declared here until Gate A7 and could never be produced: every
 * Latin-script query is caught by the `ROMAJI_REGEX` branch, so `mizu` and
 * `water` both classify as `"romaji"` and no character-level test can separate
 * romaji from English. A language name is outside this axis in general, which is
 * why `"tamil"` and `"malayalam"` are not members either — they are valid
 * *translation-language* values (`SUPPORTED_LANGUAGES`,
 * `src/types/translation.ts`) and are carried by `targetLanguage` on the mobile
 * request. Tamil or Malayalam *script* input is classified `"mixed"`.
 *
 * Removing the member changed no runtime value: no code path could emit it, and
 * the mobile side is a declaration with no producer or consumer. Contract pins:
 * `tests/mobile-dictionary-script-contract.test.ts` (axis),
 * `tests/mobile-dictionary-payload-contract.test.ts` (placement + payload).
 */
export const ALL_SEARCH_SCRIPTS = [
  "empty",
  "kanji",
  "kana",
  "japanese",
  "romaji",
  "mixed",
] as const;

/**
 * One member of {@link ALL_SEARCH_SCRIPTS}: the character class of a search
 * query. Derived from the runtime list, so the type and the enumerable copy of
 * the contract cannot drift apart; the exhaustiveness pin in
 * `tests/mobile-dictionary-script-contract.test.ts` fails to compile if a member
 * is added to either without the other.
 */
export type SearchScript = (typeof ALL_SEARCH_SCRIPTS)[number];

export interface UnifiedSearchResultItem {
  entityType: SearchTarget;
  id: string;
  displayText: string;
  reading: string | null;
  meaning: string;
  jlptLevel: string | null;
  source: string;
  relevance: number;
  matchedOn?: string;
  metadata?: Record<string, any>;
}

export interface UnifiedSearchOptions {
  targets?: SearchTarget[];
  jlptLevel?: JLPTLevel | string;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
  /**
   * 13.5F: published-content port for the dictionary overlay. Defaults
   * to the production Drizzle store; tests inject fakes.
   */
  publicationStore?: PublicationStore;
}

export interface UnifiedSearchMetrics {
  durationMs: number;
  targetDurationsMs: Partial<Record<SearchTarget, number>>;
  totalFound: number;
}

export interface UnifiedSearchResponse {
  query: string;
  detectedScript: SearchScript;
  appliedJlptLevel: string | null;
  targetsSearched: SearchTarget[];
  results: UnifiedSearchResultItem[];
  totalResults: number;
  metrics: UnifiedSearchMetrics;
}
