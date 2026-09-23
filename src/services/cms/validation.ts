import type {
  SupportedEntityType,
  SupportedLanguage,
} from "@/types/translation";
import {
  SUPPORTED_ENTITY_TYPES,
  SUPPORTED_LANGUAGES,
} from "@/types/translation";
import type {
  CmsContentType,
  CmsItemRecord,
  CmsProvenanceType,
  CmsStatus,
  ListContentItemsFilter,
} from "./types";
import {
  CMS_CONTENT_TYPES,
  CMS_PROVENANCE_TYPES,
  CMS_STATUSES,
} from "./types";
import { CmsError } from "./errors";

/**
 * Smallest reusable CMS validation layer — Phase 13.3B.
 *
 * Pure functions; all failures throw CmsError (400 VALIDATION_ERROR).
 * Validators run at draft creation, at draft edit, and AGAIN at every
 * promotion gate (submit / approve / publish) so hand-mutated or legacy
 * rows can never be promoted without passando validation.
 */

const MAX_TITLE_LENGTH = 500;
const MAX_REF_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;

export function isCmsContentType(value: string): value is CmsContentType {
  return (CMS_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isCmsStatus(value: string): value is CmsStatus {
  return (CMS_STATUSES as readonly string[]).includes(value);
}

export function isCmsProvenanceType(
  value: string
): value is CmsProvenanceType {
  return (CMS_PROVENANCE_TYPES as readonly string[]).includes(value);
}

function assertNonEmptyString(
  field: string,
  value: unknown,
  maxLength: number
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw CmsError.validation(`${field} is required.`, { field });
  }
  if (value.length > maxLength) {
    throw CmsError.validation(
      `${field} exceeds ${maxLength} characters.`,
      { field, maxLength }
    );
  }
  return value;
}

function assertOptionalString(
  field: string,
  value: unknown,
  maxLength: number
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw CmsError.validation(`${field} must be a string.`, { field });
  }
  if (value.length > maxLength) {
    throw CmsError.validation(
      `${field} exceeds ${maxLength} characters.`,
      { field, maxLength }
    );
  }
  return value.length === 0 ? null : value;
}

/** Validate a title patch (full value, not a delta). */
export function assertNonEmptyTitle(value: unknown): string {
  return assertNonEmptyString("title", value, MAX_TITLE_LENGTH);
}

export function assertStagedPayload(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw CmsError.validation("stagedPayload must be an object.", {
      field: "stagedPayload",
    });
  }
  return value as Record<string, unknown>;
}

/**
 * CMS-originated content rule (§19):
 * - `article` and `learning_resource` have NO canonical tables, so they MUST
 *   be CMS-originated (entityId must be null). Nothing else is possible and
 *   no new tables are invented for them.
 * - The other six types MAY overlay a canonical entity (entityId set) or be
 *   CMS-originated (entityId null, e.g. editorially curated entries that do
 *   not come from ETL).
 */
export function assertEntityIdRule(
  contentType: CmsContentType,
  entityId: string | null | undefined
): string | null {
  const normalized =
    entityId === undefined || entityId === null || entityId === ""
      ? null
      : entityId;
  if (normalized !== null) {
    if (typeof normalized !== "string") {
      throw CmsError.validation("entityId must be a string.", {
        field: "entityId",
      });
    }
    if (normalized.length > MAX_REF_LENGTH) {
      throw CmsError.validation(
        `entityId exceeds ${MAX_REF_LENGTH} characters.`,
        { field: "entityId", maxLength: MAX_REF_LENGTH }
      );
    }
  }
  if (
    (contentType === "article" || contentType === "learning_resource") &&
    normalized !== null
  ) {
    throw CmsError.validation(
      `contentType "${contentType}" has no canonical table and must be CMS-originated (entityId must be null).`,
      { field: "entityId", contentType }
    );
  }
  return normalized;
}

export interface ValidatedDraftInput {
  contentType: CmsContentType;
  entityId: string | null;
  title: string;
  stagedPayload: Record<string, unknown>;
  sourceRef: string;
  provenanceType: CmsProvenanceType;
  originalSourceRef: string | null;
  editorialNotes: string | null;
}

/** Validated translation proposal carried in a translation item's payload. */
export interface ValidatedTranslationProposal {
  entityType: SupportedEntityType;
  language: SupportedLanguage;
  translatedText: string;
  secondaryText: string | null;
  contextNotes: string | null;
  sourceRef: string;
}

/**
 * Validate a translation proposal payload (13.5C). Vocabularies come from
 * @/types/translation (never redeclared); text normalization stays owned
 * by TranslationService at write time — validation only asserts presence
 * and shape so the two can never disagree on canonical form.
 */
export function validateTranslationProposalPayload(
  stagedPayload: unknown
): ValidatedTranslationProposal {
  const payload = assertStagedPayload(stagedPayload);
  const entityType = payload.entityType;
  if (
    typeof entityType !== "string" ||
    !(SUPPORTED_ENTITY_TYPES as readonly string[]).includes(entityType)
  ) {
    throw CmsError.validation("translation entityType is invalid.", {
      field: "entityType",
      allowed: [...SUPPORTED_ENTITY_TYPES],
    });
  }
  const language = payload.language;
  if (
    typeof language !== "string" ||
    !(SUPPORTED_LANGUAGES as readonly string[]).includes(language)
  ) {
    throw CmsError.validation("translation language is invalid.", {
      field: "language",
      allowed: [...SUPPORTED_LANGUAGES],
    });
  }
  const translatedText = payload.translatedText;
  if (typeof translatedText !== "string" || translatedText.trim() === "") {
    throw CmsError.validation("translatedText is required.", {
      field: "translatedText",
    });
  }
  return {
    entityType: entityType as SupportedEntityType,
    language: language as SupportedLanguage,
    translatedText: translatedText.trim(),
    secondaryText: assertOptionalString(
      "secondaryText",
      payload.secondaryText,
      MAX_NOTES_LENGTH
    ),
    contextNotes: assertOptionalString(
      "contextNotes",
      payload.contextNotes,
      MAX_NOTES_LENGTH
    ),
    sourceRef: assertNonEmptyString(
      "sourceRef",
      payload.sourceRef,
      MAX_REF_LENGTH
    ),
  };
}

/** Validate raw createDraft input into a normalized, storable shape. */
export function validateNewDraftInput(input: {
  contentType: unknown;
  entityId?: unknown;
  title: unknown;
  stagedPayload: unknown;
  sourceRef: unknown;
  provenanceType: unknown;
  originalSourceRef?: unknown;
  editorialNotes?: unknown;
}): ValidatedDraftInput {
  if (typeof input.contentType !== "string" || !isCmsContentType(input.contentType)) {
    throw CmsError.validation("contentType is invalid.", {
      field: "contentType",
      allowed: [...CMS_CONTENT_TYPES],
    });
  }
  if (
    typeof input.provenanceType !== "string" ||
    !isCmsProvenanceType(input.provenanceType)
  ) {
    throw CmsError.validation("provenanceType is invalid.", {
      field: "provenanceType",
      allowed: [...CMS_PROVENANCE_TYPES],
    });
  }
  const entityId = assertEntityIdRule(
    input.contentType,
    input.entityId as string | null | undefined
  );
  if (input.contentType === "translation") {
    // Translation proposals always overlay a canonical entity: entityId is
    // the linkage, and the payload carries the proposed translation.
    if (entityId === null) {
      throw CmsError.validation(
        "entityId is required for translation proposals.",
        { field: "entityId" }
      );
    }
    validateTranslationProposalPayload(input.stagedPayload);
  }
  return {
    contentType: input.contentType,
    entityId,
    title: assertNonEmptyString("title", input.title, MAX_TITLE_LENGTH),
    stagedPayload: assertStagedPayload(input.stagedPayload),
    sourceRef: assertNonEmptyString("sourceRef", input.sourceRef, MAX_REF_LENGTH),
    provenanceType: input.provenanceType,
    originalSourceRef: assertOptionalString(
      "originalSourceRef",
      input.originalSourceRef,
      MAX_REF_LENGTH
    ),
    editorialNotes: assertOptionalString(
      "editorialNotes",
      input.editorialNotes,
      MAX_NOTES_LENGTH
    ),
  };
}

/**
 * Re-validate a STORED item before any promotion gate (submit / approve /
 * publish). Drafts are allowed to be works-in-progress at creation, but a
 * promotion requires complete metadata and a non-empty staged payload, so
 * invalid or incomplete content can never advance toward publication —
 * including rows that bypassed the service.
 */
export function validateStoredItemForPromotion(item: CmsItemRecord): void {
  if (!isCmsContentType(item.contentType)) {
    throw CmsError.validation("Stored item has an invalid contentType.", {
      field: "contentType",
    });
  }
  if (!isCmsProvenanceType(item.provenanceType)) {
    throw CmsError.validation("Stored item has an invalid provenanceType.", {
      field: "provenanceType",
    });
  }
  assertNonEmptyString("title", item.title, MAX_TITLE_LENGTH);
  assertNonEmptyString("sourceRef", item.sourceRef, MAX_REF_LENGTH);
  assertEntityIdRule(
    item.contentType as CmsContentType,
    item.entityId as string | null
  );
  const payload = assertStagedPayload(item.stagedPayload);
  if (Object.keys(payload).length === 0) {
    throw CmsError.validation(
      "stagedPayload is empty. Content cannot be promoted without payload.",
      { field: "stagedPayload" }
    );
  }
  if (item.contentType === "translation") {
    // Promotion gates re-validate the proposal so hand-mutated rows can
    // never advance toward verification.
    if (item.entityId === null || item.entityId === "") {
      throw CmsError.validation(
        "Stored translation proposal is missing its entity linkage.",
        { field: "entityId" }
      );
    }
    validateTranslationProposalPayload(item.stagedPayload);
  }
}

const MAX_LIST_LIMIT = 100;

function assertListLimit(value: unknown): number {
  if (value === undefined || value === null) return 50;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw CmsError.validation("limit must be an integer.", { field: "limit" });
  }
  if (value < 1 || value > MAX_LIST_LIMIT) {
    throw CmsError.validation(
      `limit must be between 1 and ${MAX_LIST_LIMIT}.`,
      { field: "limit", maxLimit: MAX_LIST_LIMIT }
    );
  }
  return value;
}

function assertListOffset(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw CmsError.validation("offset must be a non-negative integer.", {
      field: "offset",
    });
  }
  return value;
}

/**
 * Validate a collection-read filter (13.5A). Unknown contentType/status
 * values are rejected (400), never silently widened — a typo must not
 * escalate a scoped slice into a cross-type dump.
 */
export function assertListItemsFilter(input: {
  contentType?: unknown;
  status?: unknown;
  q?: unknown;
  limit?: unknown;
  offset?: unknown;
}): ListContentItemsFilter {
  let contentType: CmsContentType | undefined;
  if (input.contentType !== undefined && input.contentType !== null) {
    if (
      typeof input.contentType !== "string" ||
      !isCmsContentType(input.contentType)
    ) {
      throw CmsError.validation("contentType is invalid.", {
        field: "contentType",
        allowed: [...CMS_CONTENT_TYPES],
      });
    }
    contentType = input.contentType;
  }
  let status: CmsStatus | undefined;
  if (input.status !== undefined && input.status !== null) {
    if (typeof input.status !== "string" || !isCmsStatus(input.status)) {
      throw CmsError.validation("status is invalid.", {
        field: "status",
        allowed: [...CMS_STATUSES],
      });
    }
    status = input.status;
  }
  let q: string | undefined;
  if (input.q !== undefined && input.q !== null && input.q !== "") {
    if (typeof input.q !== "string") {
      throw CmsError.validation("q must be a string.", { field: "q" });
    }
    if (input.q.length > MAX_TITLE_LENGTH) {
      throw CmsError.validation(
        `q exceeds ${MAX_TITLE_LENGTH} characters.`,
        { field: "q", maxLength: MAX_TITLE_LENGTH }
      );
    }
    const trimmed = input.q.trim();
    if (trimmed.length > 0) q = trimmed;
  }
  return {
    ...(contentType !== undefined ? { contentType } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(q !== undefined ? { q } : {}),
    limit: assertListLimit(input.limit),
    offset: assertListOffset(input.offset),
  };
}

/** Validate an optional caller-supplied change summary. */
export function assertChangeSummary(value: unknown): string | null {
  return assertOptionalString("changeSummary", value, MAX_SUMMARY_LENGTH);
}

/** Validate a required editorial reason (requestChanges, admin override). */
export function assertReason(field: string, value: unknown): string {
  return assertNonEmptyString(field, value, MAX_SUMMARY_LENGTH);
}

/** Validate optional editorial-notes patch. */
export function assertEditorialNotesPatch(value: unknown): string | null {
  return assertOptionalString("editorialNotes", value, MAX_NOTES_LENGTH);
}

/**
 * Validate a schedule timestamp: must be a real date strictly in the future.
 * No scheduler/queue is created in this phase — this only records intent.
 */
export function assertFutureTimestamp(
  value: string | Date,
  now: Date
): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw CmsError.validation("scheduledAt must be a valid timestamp.", {
      field: "scheduledAt",
    });
  }
  if (date.getTime() <= now.getTime()) {
    throw CmsError.validation("scheduledAt must be in the future.", {
      field: "scheduledAt",
    });
  }
  return date;
}
