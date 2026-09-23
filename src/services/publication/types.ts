/**
 * Learner publication overlay — shared types (Phase 13.5F).
 *
 * Provider-independent port: learner resolvers consume published CMS
 * content through `PublicationStore`, never through the CMS workflow
 * service or admin APIs. No database imports here by construction.
 */
import type { dictionaryEntries } from "@/db/schema";

/** Canonical dictionary row shape (learner DTO identity). */
export type CanonicalDictionaryRow = typeof dictionaryEntries.$inferSelect;

/**
 * Minimal published-override projection. Carries ONLY what the learner
 * resolver needs: identity, public-safe source ref, and the staged
 * payload. Never author/reviewer/audit/version data.
 */
export interface PublishedDictionaryOverride {
  readonly entityId: string;
  readonly sourceRef: string;
  readonly provenanceType: string;
  readonly stagedPayload: unknown;
}

/**
 * Read-only published-content port. Implementations MUST hardcode the
 * `contentType = 'dictionary' AND status = 'published'` predicate —
 * publication is server/database-derived, never caller-supplied.
 */
export interface PublicationStore {
  findPublishedDictionaryOverrides(
    entityIds: readonly string[]
  ): Promise<PublishedDictionaryOverride[]>;
}

/** Where a learner-visible representation came from (internal). */
export type ResolutionSource = "canonical" | "cms";

export interface ResolvedDictionaryEntry {
  readonly entry: CanonicalDictionaryRow;
  readonly source: ResolutionSource;
}

/** Fail-safe diagnostics (server-side; never learner-rendered). */
export type PublicationDiagnostic =
  | {
      kind: "duplicate-published-override";
      entityId: string;
      count: number;
    }
  | { kind: "malformed-published-payload"; entityId: string }
  | { kind: "orphan-published-override"; entityId: string };
