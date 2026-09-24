/**
 * Sentence infrastructure barrel — Phase 14.4F-R.
 *
 * NOTE: `src/etl/sentence/` is a separate, older module (Phase 4) that handles
 * the pilot example-sentence fixture and the legacy `SentenceMatcher`. It is
 * neither re-exported nor reimplemented here. This module contains only the
 * pure matching/offset infrastructure, which has no dependency on an acquired
 * sentence corpus.
 */

export * from "./types";
export * from "./offsetContract";
export * from "./lexicalMatcher";
