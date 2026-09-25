/**
 * Phase 14.4A — Flutter/Android Mobile Dictionary API Contracts
 *
 * Defines the request/response payloads, card view abstractions, swipe section
 * models, and versioned offline sync contracts for the future NihongoBridge Flutter app.
 */

import type { SupportedLanguage } from "./translation";
import type { RegisterLevel, ConjugationForm } from "./lexicalGraph";
import type { SearchScript } from "@/services/search/types";
import type { JlptLevelMeaning } from "@/services/dataquality/jlptChecks";

// ---------------------------------------------------------------------------
// 1. Mobile Search & Card Abstractions
// ---------------------------------------------------------------------------

/**
 * The richer filter model declared in Phase 14.4A.
 *
 * **NOT part of the frozen v1 transport.** Gate A10 §A10.2 established that the transport is a
 * flat `GET` query string, and only two of these fields have an implemented counterpart on the
 * server (`jlptLevel` → the `level` wire parameter, `isCommon` → `common`). The remaining fields
 * (`partsOfSpeech`, `hasKanji`, `hasExamples`, `hasKeigo`, `register`) have **no producer**, so
 * A10 removed the nested `filters` object from {@link MobileSearchRequest} rather than define a
 * wire form that would be silently ignored. This interface is retained as the model a future
 * filter gate would implement (A10 §A10.17, D-10); nothing consumes it today.
 */
export interface MobileSearchFilters {
  jlptLevel?: "N5" | "N4" | "N3" | "N2" | "N1";
  isCommon?: boolean;
  partsOfSpeech?: string[];
  hasKanji?: boolean;
  hasExamples?: boolean;
  hasKeigo?: boolean;
  register?: RegisterLevel;
}

/**
 * Frozen request contract (Gate A10 §A10.2). Transport is `GET /api/v1/mobile/dictionary/search`
 * with **query-string parameters and no request body**; each field below names the wire parameter
 * it maps to, so an implementation needs no further mapping decision.
 *
 * **A10 CORRECTION:** the nested `filters` object was removed — the v1 transport is flat, and the
 * filter fields without producers are deferred rather than accepted-and-ignored.
 */
export interface MobileSearchRequest {
  /** Wire parameter **`q`**. Required, non-empty after sanitization (NUL-stripped, trimmed). */
  query: string;
  /**
   * Wire parameter **`level`** (legacy alias **`jlpt`**, used when `level` is absent/empty).
   * The implemented route does **not** validate this against the JLPT vocabulary: an
   * out-of-domain value yields an empty result set, not a 400.
   */
  level?: "N5" | "N4" | "N3" | "N2" | "N1";
  /** Wire parameter **`common`** — the literal strings `"true"` / `"false"` only. */
  common?: boolean;
  /** Wire parameter **`limit`** — boundary 1…200 (default 50); the service applies 1…100. */
  limit?: number;
  /** Wire parameter **`offset`** — 0-based, 0…100 000 (default 0). */
  offset?: number;
  /**
   * Wire parameter **`targetLanguage`** (`en` | `ta` | `ml`). This is the **language** axis; the
   * query's character class is a separate axis, reported back on
   * {@link MobileSearchResponse.detectedScript}.
   *
   * **Inert in v1** (A10 §A10.12): accepted and validated, but it has no effect on the response
   * because no provenance-safe translation read path exists yet. A client must not assume
   * localized glosses.
   */
  targetLanguage?: SupportedLanguage;
}

/**
 * The frozen v1 search item — a **projection** of canonical data, never a database row spread
 * (A10 §A10.6: each field here has a mapped source column or a named derivation).
 *
 * Declared on the 14.4A-era card but **removed by A10** because nothing produces them:
 * `localizedGlosses` (no read path — §A10.12), `isKeigo`/`keigoType` (produced by the keigo
 * graph, not the entry row), `hasAudio`/`audioUrl` (no dictionary-entry audio exists; the
 * `audio_url` columns belong to kana and quiz questions). Emitting `false`/`null` for these
 * would report a fact the server does not have.
 */
export interface MobileDictionaryEntryCard {
  /** `dictionary_entries.id` — the public identifier (A10 §A10.5). */
  id: string; // e.g. "de-jmdict-1358280"
  headword: string;
  reading: string;
  romaji: string;
  /** Flattened from the stored `senses[].glosses[]`; the jsonb nesting is never exposed (§6.1). */
  primaryGlosses: string[];
  /** Stored value verbatim, **including the `"NONE"` sentinel**. Never branch on its truthiness. */
  jlptLevel: string;
  /**
   * Derived JLPT knowledge state (Gate A9 decision 3) — `classifyJlptLevel` of {@link jlptLevel}.
   *
   * A tri-state rather than `jlptKnown: boolean`, because the boolean was lossy: `invalid` is
   * reachable for rows that did not pass through `normalizeJlpt`, and collapsing it into
   * "not known" would hide a data-quality class from every client. The raw value above is kept
   * alongside it, so the sentinel is never destroyed (A9 §7).
   */
  jlptStatus: JlptLevelMeaning;
  isCommon: boolean;
  kanjiCharacters: string[];
}

export interface MobileSearchResponse {
  /**
   * Gate A9 froze this shape in `docs/api/MOBILE-DICTIONARY-API-CONTRACT.md` (§3.2). It mirrors
   * the implemented `GET /api/dictionary/search` envelope, minus the item projection that a
   * future implementation must add (§3.3), and it is the shape a mobile runtime will adopt —
   * **no mobile runtime exists** (`MOBILE RUNTIME API: NOT IMPLEMENTED`).
   *
   * Retired by A9, each because nothing produced or consumed it: `results` (renamed to
   * `entries`), `totalResults` (superseded by `total`), `executionTimeMs` (no measured need)
   * and `page` (pagination is 0-based `offset`).
   */
  /** The **sanitized** query the server searched with — NUL-stripped and trimmed. Not the raw
   * client input, and not NFKC-normalized or transliterated (A9 §4). */
  query: string;
  /**
   * Server classification of `query`'s character class, echoed from the search classifier
   * (`detectedScript` is placed on the response by the contract; the request carries no
   * classification, because a client cannot see the server's classifier — Gate A8).
   *
   * The vocabulary is the canonical {@link SearchScript} union (Gate A7), so it is a
   * **script/character** axis and never a language: `water` and `mizu` both classify as
   * `"romaji"`, Tamil or Malayalam script input classifies as `"mixed"`, and the language a
   * client asks for is `targetLanguage` on {@link MobileSearchRequest}. A client must not
   * re-derive this value — a divergence between client and server classification would
   * silently change ranking behaviour.
   */
  detectedScript: SearchScript;
  /** The JLPT filter actually applied, or `null` when none was requested. */
  appliedJlptLevel: string | null;
  /** The page of results. Canonical items are a projection, never a stored-row spread. */
  entries: MobileDictionaryEntryCard[];
  /** Count of **all** matching rows, not the size of this page. */
  total: number;
  /** The limit the service actually applied (it clamps to 1…100, below the route's 1…200). */
  limit: number;
  /** The 0-based offset the service actually applied. */
  offset: number;
  /**
   * `offset + entries.length < total`.
   *
   * Exact for this pipeline (the trace in the frozen contract §5 found no post-limit
   * filtering, deduplication or truncation, and the publication overlay maps rows 1:1), with
   * one caveat the contract states rather than hides: the invariant is only meaningful while
   * the echoed `offset` equals the offset the client requested, because a clamped negative
   * offset is applied as `0` without a corresponding `total` adjustment.
   *
   * **NOT YET IMPLEMENTED** — no route emits this field yet; it is frozen so the eventual
   * producer cannot choose approximate semantics.
   */
  hasMore: boolean;
}

/**
 * The pagination view of a search response (A10 §A10.9).
 *
 * Pagination is **flat** on `data` — A9 retired the nested `pagination` object — so this alias
 * exists only to name the four pagination fields together. It is deliberately a projection of
 * {@link MobileSearchResponse} rather than an independent declaration, so the two cannot drift.
 */
export type MobileSearchPagination = Pick<
  MobileSearchResponse,
  "total" | "limit" | "offset" | "hasMore"
>;

/**
 * Machine-readable error (A10 §A10.16). `code` is a stable symbol; `message` is human-oriented and
 * may change without a contract revision.
 */
export interface MobileApiError {
  /** e.g. `MISSING_QUERY` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500). */
  code: string;
  message: string;
}

/** The frozen success envelope (A10 §A10.1, A9 decision 8). */
export interface MobileSearchEnvelope {
  success: true;
  data: MobileSearchResponse;
}

/** The frozen failure envelope. Never carries a `data` key. */
export interface MobileErrorEnvelope {
  success: false;
  error: MobileApiError;
}

/** Every mobile dictionary response is exactly one of these two shapes. */
export type MobileSearchResult = MobileSearchEnvelope | MobileErrorEnvelope;

// ---------------------------------------------------------------------------
// 2. Mobile Entry Detail & Swipe Sections
// ---------------------------------------------------------------------------

export interface MobileSwipeSectionMeaning {
  order: number;
  partsOfSpeech: string[];
  glosses: string[];
  localizedGlosses: Record<string, string[]>;
  contextTags: string[];
  notes?: string | null;
}

export interface MobileSwipeSectionConjugation {
  form: ConjugationForm;
  nameJa: string;
  nameEn: string;
  affirmative: string;
  affirmativeReading: string;
  negative: string;
  negativeReading: string;
  politeness: "casual" | "polite";
}

export interface MobileSwipeSectionKeigo {
  standardForm: string;
  teineigo: string[];
  sonkeigo: string[];
  kenjougo: string[];
  businessExample?: {
    japanese: string;
    reading: string;
    english: string;
    tamil?: string;
    malayalam?: string;
  };
}

export interface MobileSwipeSectionKanji {
  character: string;
  meaning: string;
  readings: { on: string[]; kun: string[] };
  strokeCount: number;
  strokeOrderSvgUrl?: string;
  radical: string;
  visualAsset?: KanjiVisualAsset;
}

// ---------------------------------------------------------------------------
// 2.1 Mobile Visual Kanji & Stroke Order Contract (Phase 14.4D)
// ---------------------------------------------------------------------------

export interface MobileVisualStroke {
  order: number;
  id: string;
  path: string;
  type?: string;
}

export interface MobileVisualComponent {
  element: string;
  position?: string | null;
  radical?: string | null;
}

export interface KanjiVisualAsset {
  character: string;
  canonicalKanjiId: string;
  sourceRef: string;
  svg: string;
  viewBox: string;
  strokeCount: number;
  strokes: MobileVisualStroke[];
  components: MobileVisualComponent[];
  primaryRadical?: {
    element: string;
    type: string;
    position?: string | null;
  } | null;
  version: string;
}

export interface MobileSwipeSectionSentence {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  tamil?: string;
  malayalam?: string;
  sourceRef: string;
  difficulty?: string;
}

export interface MobileDictionaryDetailResponse {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  alternativeHeadwords: string[];
  alternativeReadings: string[];
  meanings: MobileSwipeSectionMeaning[];
  conjugations?: MobileSwipeSectionConjugation[];
  keigo?: MobileSwipeSectionKeigo;
  kanjiList: MobileSwipeSectionKanji[];
  exampleSentences: MobileSwipeSectionSentence[];
  synonyms: Array<{ id: string; headword: string; reading: string; relationType: string }>;
  antonyms: Array<{ id: string; headword: string; reading: string; relationType: string }>;
  phrases: Array<{ id: string; phrase: string; meaning: string }>;
  collocations: Array<{ expression: string; meaning: string }>;
  userState?: {
    isBookmarked: boolean;
    userLists: string[];
    hasPersonalNote: boolean;
    srsStatus?: "new" | "learning" | "review" | "mastered";
  };
  provenance: {
    sourceId: string;
    license: string;
    attribution: string;
  };
}

// ---------------------------------------------------------------------------
// 3. Versioned Offline Sync Contracts (Future Flutter Ready)
// ---------------------------------------------------------------------------

export interface MobileSyncDatasetManifest {
  manifestVersion: string;
  datasetName: "jmdict_core" | "kanji_core" | "tatoeba_sentences" | "keigo_relations";
  upstreamVersion: string;
  releaseDate: string;
  recordCount: number;
  uncompressedSizeBytes: number;
  archiveSizeBytes: number;
  archiveSha256: string;
  downloadUrl: string;
  deltaSupport: boolean;
  deltaBaseVersion?: string | null;
  deltaPatchUrl?: string | null;
  deltaPatchSha256?: string | null;
}

export interface MobileIncrementalSyncRequest {
  datasetName: string;
  clientCurrentVersion: string;
  clientLastSyncTimestamp: string;
}

export interface MobileIncrementalSyncResponse {
  datasetName: string;
  updateAvailable: boolean;
  syncType: "delta_patch" | "full_rebuild" | "up_to_date";
  targetVersion: string;
  patchSizeBytes?: number;
  patchSha256?: string;
  downloadUrl?: string;
}
