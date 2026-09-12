/**
 * Shared domain primitives used across services.
 * Domain-specific shapes live with their owning service (DOMAIN_OWNERSHIP).
 */

import type { JlptLevel } from "@/config/app";

export type { JlptLevel };

/** Canonical entity identifier: application-generated text (DATABASE_OWNERSHIP §3). */
export type EntityId = string;

/** Identifier of an authenticated learner. FK to the identity table (Phase 01.2). */
export type LearnerId = string;

/** Knowledge entity kinds that can be bookmarked, reviewed, or linked. */
export type KnowledgeEntityType =
  | "dictionary_entry"
  | "kanji_entry"
  | "grammar_pattern"
  | "sentence";

/** Provenance stamped on every imported knowledge row. */
export interface Provenance {
  source: string;
  sourceId: string;
  sourceVersion: string;
  importVersion: string;
  importedAt: Date;
}

/** Normalised paging request after clamping. */
export interface PageRequest {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

/** A page of results plus its total. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
