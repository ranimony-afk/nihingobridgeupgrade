import type {
  cmsAuditLog,
  cmsContentItems,
  cmsContentVersions,
} from "@/db/schema";
import type {
  SupportedEntityType,
  SupportedLanguage,
} from "@/types/translation";

/**
 * CMS service shared types — Phase 13.3B.
 *
 * Pure type module (no I/O, no imports beyond types): safe to share between
 * the service, the Drizzle adapter, test fakes, and — later — CMS API routes.
 * Row shapes are inferred from the Phase 13.2 schema so they cannot drift.
 */

/** Controlled CMS content types (Phase 13.2 vocabulary + 13.5C translation). */
export type CmsContentType =
  | "dictionary"
  | "kanji"
  | "radical"
  | "grammar"
  | "sentence"
  | "jlpt"
  | "article"
  | "learning_resource"
  | "translation";

export const CMS_CONTENT_TYPES: readonly CmsContentType[] = [
  "dictionary",
  "kanji",
  "radical",
  "grammar",
  "sentence",
  "jlpt",
  "article",
  "learning_resource",
  "translation",
] as const;

/** Controlled CMS workflow states (Phase 13.2 vocabulary). */
export type CmsStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export const CMS_STATUSES: readonly CmsStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

/** Controlled CMS provenance types (Phase 13.2 vocabulary). */
export type CmsProvenanceType =
  | "canonical_override"
  | "editorial_curated"
  | "community_verified";

export const CMS_PROVENANCE_TYPES: readonly CmsProvenanceType[] = [
  "canonical_override",
  "editorial_curated",
  "community_verified",
] as const;

/**
 * Audit actions. The Phase 13.2 list plus `request_changes`, which the 13.2
 * vocabulary explicitly left open ("should include", non-exhaustive) and
 * which requestChanges() requires to record review decisions faithfully.
 * `verify_translation` remains reserved for translation integration (13.5).
 */
export type CmsAuditAction =
  | "create_draft"
  | "edit"
  | "submit_review"
  | "request_changes"
  | "approve"
  | "schedule"
  | "publish"
  | "archive"
  | "rollback"
  | "verify_translation";

/** Persisted CMS item row (cms_content_items). */
export type CmsItemRecord = typeof cmsContentItems.$inferSelect;
export type CmsItemInsert = typeof cmsContentItems.$inferInsert;

/** Persisted immutable version snapshot row (cms_content_versions). */
export type CmsVersionRecord = typeof cmsContentVersions.$inferSelect;
export type CmsVersionInsert = typeof cmsContentVersions.$inferInsert;

/** Persisted immutable audit event row (cms_audit_log). */
export type CmsAuditRecord = typeof cmsAuditLog.$inferSelect;
export type CmsAuditInsert = typeof cmsAuditLog.$inferInsert;

/** Validated filter for listing content items (13.5A collection reads). */
export interface ListContentItemsFilter {
  readonly contentType?: CmsContentType;
  readonly status?: CmsStatus;
  /** Case-insensitive title substring (13.5B admin search). */
  readonly q?: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Verified translation write (13.5C). Values are pre-validated by the
 * service; `sourceType`/`isVerified` are NOT inputs — adapters always
 * write verified_human/true so CMS verification can never mint machine
 * or canonical rows.
 */
export interface VerifiedTranslationWrite {
  readonly entityType: SupportedEntityType;
  readonly entityId: string;
  readonly language: SupportedLanguage;
  readonly translatedText: string;
  readonly secondaryText: string | null;
  readonly contextNotes: string | null;
  readonly sourceRef: string | null;
}
export interface CmsRequestContext {
  readonly ipAddress?: string;
}

/**
 * Minimal persistence port the CmsService operates against. Implemented by
 * the Drizzle adapter (production) and by an in-memory fake (tests). The
 * service never touches canonical knowledge tables — canonical reads are
 * limited to the existence check below, used only as a publication guard.
 */
export interface CmsStore {
  getContentItem(id: string): Promise<CmsItemRecord | null>;
  /**
   * Collection read (newest first). Filter values are pre-validated by the
   * service; adapters apply them verbatim. Read-only by construction.
   */
  listContentItems(
    filter: ListContentItemsFilter
  ): Promise<CmsItemRecord[]>;
  insertContentItem(row: CmsItemInsert): Promise<void>;
  updateContentItem(
    id: string,
    patch: Partial<CmsItemInsert> & { updatedAt: Date }
  ): Promise<void>;

  insertContentVersion(row: CmsVersionInsert): Promise<void>;
  listContentVersions(itemId: string): Promise<CmsVersionRecord[]>;

  insertAuditEvent(row: CmsAuditInsert): Promise<void>;
  listAuditEvents(itemId: string): Promise<CmsAuditRecord[]>;

  /**
   * Application-level overlay check (no polymorphic FKs by design):
   * does the canonical entity referenced by (contentType, entityId) exist?
   * Checked only at publication; drafts may reference not-yet-imported ETL
   * entities.
   */
  canonicalEntityExists(
    contentType: CmsContentType,
    entityId: string
  ): Promise<boolean>;

  /**
   * Upsert a human-verified translation into the canonical
   * entity_translations table (13.5C). Runs inside the caller's unit of
   * work, so CMS publication + translation write commit atomically.
   * Production delegates to TranslationService.addTranslation — the single
   * storage writer; adapters pass the executor, never author SQL.
   */
  upsertVerifiedTranslation(
    input: VerifiedTranslationWrite
  ): Promise<{ id: string }>;
}

/** A CmsStore that can execute a unit of work atomically. */
export interface CmsDatabase extends CmsStore {
  transaction<T>(fn: (tx: CmsStore) => Promise<T>): Promise<T>;
}
