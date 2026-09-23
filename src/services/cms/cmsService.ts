import "server-only";

import { randomUUID } from "node:crypto";
import type { CmsActor } from "@/lib/auth";
import {
  AuthorizationError,
  requirePermission,
  requireRole,
} from "@/lib/auth";
import { CmsError } from "./errors";
import {
  assertChangeSummary,
  assertEditorialNotesPatch,
  assertFutureTimestamp,
  assertListItemsFilter,
  assertNonEmptyTitle,
  assertReason,
  assertStagedPayload,
  validateNewDraftInput,
  validateStoredItemForPromotion,
  validateTranslationProposalPayload,
} from "./validation";
import { assertTransition, rollbackTargetStatus } from "./stateMachine";
import type {
  CmsAuditAction,
  CmsContentType,
  CmsDatabase,
  CmsItemRecord,
  CmsRequestContext,
  CmsStatus,
  CmsStore,
} from "./types";
import { isCmsStatus } from "./validation";

/**
 * CMS workflow service — Phase 13.3B.
 *
 * Owns CMS business rules: authorization (via @/lib/auth, never bypassed),
 * the workflow state machine, optimistic concurrency, immutable versioning,
 * and transactional audit. Framework-independent: no Request/Response
 * handling, no UI — future `/api/admin/*` routes will be thin adapters over
 * these methods.
 *
 * Identity rule: the actor ALWAYS comes from requirePermission()/requireRole().
 * Inputs carry no authorId/reviewerId/actorId/role — author, reviewer,
 * version creator, and audit actor are stamped from the verified actor.
 *
 * Mutation shape (every method): authorize → validate input → BEGIN →
 * read+state check → version check → update item → append version → append
 * audit → COMMIT. Any failure rolls everything back.
 */

export interface CreateDraftInput {
  contentType: unknown;
  entityId?: unknown;
  title: unknown;
  stagedPayload: unknown;
  sourceRef: unknown;
  provenanceType: unknown;
  originalSourceRef?: unknown;
  editorialNotes?: unknown;
  changeSummary?: unknown;
  context?: CmsRequestContext;
}

export interface UpdateDraftInput {
  expectedVersion: number;
  title?: unknown;
  stagedPayload?: unknown;
  editorialNotes?: unknown;
  changeSummary?: unknown;
  context?: CmsRequestContext;
}

export interface TransitionInput {
  expectedVersion: number;
  changeSummary?: unknown;
  context?: CmsRequestContext;
}

export interface ListItemsInput {
  contentType?: unknown;
  status?: unknown;
  q?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export interface RequestChangesInput extends TransitionInput {
  reason: unknown;
}

export interface AdminOverrideApproveInput extends TransitionInput {
  reason: unknown;
}

export interface ScheduleInput extends TransitionInput {
  scheduledAt: string | Date;
}

export interface RollbackInput extends TransitionInput {
  targetVersion: number;
}

export interface CmsServiceOptions {
  /** Clock for timestamps and schedule validation. Default: wall clock. */
  clock?: () => Date;
  /** ID factory. Default: prefixed randomUUID. */
  generateId?: (prefix: "item" | "version" | "audit") => string;
}

function defaultGenerateId(prefix: "item" | "version" | "audit"): string {
  return `cms-${prefix}-${randomUUID()}`;
}

function deepCopy<T>(value: T): T {
  return structuredClone(value);
}

export class CmsService {
  private readonly db: CmsDatabase;
  private readonly clock: () => Date;
  private readonly generateId: (prefix: "item" | "version" | "audit") => string;

  constructor(db: CmsDatabase, options: CmsServiceOptions = {}) {
    this.db = db;
    this.clock = options.clock ?? (() => new Date());
    this.generateId = options.generateId ?? defaultGenerateId;
  }

  // ---------------------------------------------------------------- reads

  /** Fetch one item. Requires cms.read. */
  async getItem(itemId: string): Promise<CmsItemRecord> {
    await requirePermission("cms.read");
    const item = await this.db.getContentItem(itemId);
    if (!item) throw CmsError.notFound("CMS item", itemId);
    return item;
  }

  /** Immutable version history, oldest first. Requires cms.read. */
  async getVersions(itemId: string) {
    await requirePermission("cms.read");
    await this.requireStoredItem(this.db, itemId);
    return this.db.listContentVersions(itemId);
  }

  /** Immutable audit trail, oldest first. Requires cms.read. */
  async getAuditTrail(itemId: string) {
    await requirePermission("cms.read");
    await this.requireStoredItem(this.db, itemId);
    return this.db.listAuditEvents(itemId);
  }

  /**
   * Collection read, newest first. Requires cms.read. Pure read: no state
   * machine, no versioning, no audit — the ONLY new service surface 13.5A
   * needs, so the GET collection route is not tempted to query the store.
   */
  async listItems(input: ListItemsInput = {}): Promise<CmsItemRecord[]> {
    await requirePermission("cms.read");
    return this.db.listContentItems(assertListItemsFilter(input));
  }

  // ------------------------------------------------------------- create

  /**
   * Create a draft + v1 snapshot + create_draft audit, atomically.
   * Requires cms.create. Never touches canonical knowledge tables.
   */
  async createDraft(input: CreateDraftInput): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.create");
    const draft = validateNewDraftInput(input);
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Created draft";
    const now = this.clock();
    const itemId = this.generateId("item");

    await this.db.transaction(async (tx) => {
      await tx.insertContentItem({
        id: itemId,
        contentType: draft.contentType,
        entityId: draft.entityId,
        title: draft.title,
        status: "draft",
        currentVersion: 1,
        stagedPayload: deepCopy(draft.stagedPayload),
        sourceRef: draft.sourceRef,
        provenanceType: draft.provenanceType,
        originalSourceRef: draft.originalSourceRef,
        authorId: actor.id,
        reviewerId: null,
        editorialNotes: draft.editorialNotes,
        scheduledAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insertContentVersion({
        id: this.generateId("version"),
        contentItemId: itemId,
        versionNumber: 1,
        snapshotPayload: deepCopy(draft.stagedPayload),
        statusAtSnapshot: "draft",
        createdById: actor.id,
        changeSummary,
        createdAt: now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "create_draft",
        details: {
          contentType: draft.contentType,
          entityId: draft.entityId,
          versionNumber: 1,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // --------------------------------------------------------------- edit

  /**
   * Edit a draft: draft-only, optimistic concurrency, new immutable
   * snapshot + edit audit, atomically. Requires cms.edit.
   * stagedPayload is FULL-REPLACE (snapshots are complete, never merged).
   */
  async updateDraft(
    itemId: string,
    input: UpdateDraftInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.edit");
    const hasTitle = input.title !== undefined;
    const hasPayload = input.stagedPayload !== undefined;
    const hasNotes = input.editorialNotes !== undefined;
    if (!hasTitle && !hasPayload && !hasNotes) {
      throw CmsError.validation(
        "Nothing to update: provide title, stagedPayload, or editorialNotes."
      );
    }
    const title = hasTitle
      ? assertNonEmptyTitle(input.title)
      : undefined;
    const stagedPayload = hasPayload
      ? assertStagedPayload(input.stagedPayload)
      : undefined;
    const editorialNotes = hasNotes
      ? assertEditorialNotesPatch(input.editorialNotes)
      : undefined;
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Edited draft";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      if (item.status !== "draft") {
        throw new CmsError(
          400,
          "INVALID_TRANSITION",
          `Item cannot be edited in status "${item.status}". Only drafts are editable.`,
          { status: item.status }
        );
      }
      this.assertExpectedVersion(item, input.expectedVersion);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;
      const nextPayload = deepCopy(stagedPayload ?? item.stagedPayload);

      await tx.updateContentItem(itemId, {
        ...(title !== undefined ? { title } : {}),
        stagedPayload: nextPayload,
        ...(editorialNotes !== undefined
          ? { editorialNotes }
          : {}),
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await tx.insertContentVersion({
        id: this.generateId("version"),
        contentItemId: itemId,
        versionNumber: nextVersion,
        snapshotPayload: deepCopy(nextPayload),
        statusAtSnapshot: "draft",
        createdById: actor.id,
        changeSummary,
        createdAt: now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "edit",
        details: {
          fromStatus: "draft",
          toStatus: "draft",
          versionNumber: nextVersion,
          changedFields: [
            ...(hasTitle ? ["title"] : []),
            ...(hasPayload ? ["stagedPayload"] : []),
            ...(hasNotes ? ["editorialNotes"] : []),
          ],
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ------------------------------------------------------- submit/review

  /** draft → review. Requires cms.submit_review. Re-validates content. */
  async submitForReview(
    itemId: string,
    input: TransitionInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.submit_review");
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Submitted for review";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      assertTransition(item.status, "review");
      this.assertExpectedVersion(item, input.expectedVersion);
      validateStoredItemForPromotion(item);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "review",
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "review",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "submit_review",
        details: {
          fromStatus: item.status,
          toStatus: "review",
          versionNumber: nextVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  /**
   * review → draft with a required reason. Requires cms.approve, so only
   * reviewer/admin can return work — editors cannot self-return.
   */
  async requestChanges(
    itemId: string,
    input: RequestChangesInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.approve");
    const reason = assertReason("reason", input.reason);

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      assertTransition(item.status, "draft");
      this.assertExpectedVersion(item, input.expectedVersion);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "draft",
        reviewerId: actor.id,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "draft",
        changeSummary: reason,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "request_changes",
        details: {
          fromStatus: item.status,
          toStatus: "draft",
          versionNumber: nextVersion,
          reason,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ------------------------------------------------------------ approve

  /**
   * review → approved. Requires cms.approve. Rejects author === approver —
   * including admins on this path; emergencies use approveWithAdminOverride.
   */
  async approve(
    itemId: string,
    input: TransitionInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.approve");
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Approved";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      assertTransition(item.status, "approved");
      this.assertExpectedVersion(item, input.expectedVersion);
      if (item.authorId === actor.id) {
        throw CmsError.selfApprovalForbidden();
      }
      validateStoredItemForPromotion(item);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "approved",
        reviewerId: actor.id,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "approved",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "approve",
        details: {
          fromStatus: item.status,
          toStatus: "approved",
          versionNumber: nextVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  /**
   * Distinct, auditable admin emergency override for self-approval.
   * Requires cms.approve AND the admin role, plus a mandatory reason.
   * Reviewers can never take this path (403).
   */
  async approveWithAdminOverride(
    itemId: string,
    input: AdminOverrideApproveInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.approve");
    await requireRole("admin");
    const reason = assertReason("reason", input.reason);
    const changeSummary =
      assertChangeSummary(input.changeSummary) ??
      `Admin override approval: ${reason}`;

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      assertTransition(item.status, "approved");
      this.assertExpectedVersion(item, input.expectedVersion);
      validateStoredItemForPromotion(item);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "approved",
        reviewerId: actor.id,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "approved",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "approve",
        details: {
          fromStatus: item.status,
          toStatus: "approved",
          versionNumber: nextVersion,
          changeSummary,
          adminOverride: true,
          reason,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // -------------------------------------------- translation verify

  /**
   * Verify an approved translation proposal into the canonical
   * entity_translations table (13.5C): approved → published.
   *
   * Requires cms.verify_translation (reviewer/admin — no cms.publish
   * needed, none granted). The canonical write runs INSIDE this
   * transaction via the store port, so a failed translation write can
   * never publish the CMS item and a failed CMS write rolls the
   * translation back with it. Reviewers verify but never publish other
   * content; translation items can ONLY reach published through here
   * (publish()/schedule() reject them below).
   *
   * Idempotent: an already-published item returns as-is (after the
   * version check, so stale retries still 409 instead of masking drift).
   */
  async verifyTranslationProposal(
    itemId: string,
    input: TransitionInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.verify_translation");
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Verified translation";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      if (item.contentType !== "translation") {
        throw CmsError.validation(
          "Only translation proposals can be verified.",
          { field: "contentType" }
        );
      }
      this.assertExpectedVersion(item, input.expectedVersion);
      if (item.status === "published") {
        return;
      }
      assertTransition(item.status, "published");
      const proposal = validateTranslationProposalPayload(item.stagedPayload);
      const entityId = item.entityId;
      if (!entityId) {
        throw CmsError.validation(
          "Translation proposal is missing its entity linkage.",
          { field: "entityId" }
        );
      }
      // The translation's own entityType selects the canonical table
      // (mirrors the publish guard; jlpt covers mock tests + questions).
      const canonicalExists = await tx.canonicalEntityExists(
        proposal.entityType as CmsContentType,
        entityId
      );
      if (!canonicalExists) {
        throw CmsError.validation(
          "Referenced canonical entity does not exist. Verification blocked.",
          { entityType: proposal.entityType, entityId }
        );
      }
      const { id: translationId } = await tx.upsertVerifiedTranslation({
        entityType: proposal.entityType,
        entityId,
        language: proposal.language,
        translatedText: proposal.translatedText,
        secondaryText: proposal.secondaryText,
        contextNotes: proposal.contextNotes,
        sourceRef: proposal.sourceRef,
      });
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "published",
        publishedAt: now,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "published",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "verify_translation",
        details: {
          entityType: proposal.entityType,
          entityId,
          language: proposal.language,
          translationId,
          fromStatus: item.status,
          toStatus: "published",
          actorId: actor.id,
          versionNumber: nextVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ----------------------------------------------------------- schedule

  /**
   * approved → scheduled with a strictly-future timestamp.
   * Requires cms.schedule. Records intent only — no scheduler/queue yet.
   */
  async schedule(
    itemId: string,
    input: ScheduleInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.schedule");
    const now = this.clock();
    const scheduledAt = assertFutureTimestamp(input.scheduledAt, now);
    const changeSummary =
      assertChangeSummary(input.changeSummary) ??
      `Scheduled for ${scheduledAt.toISOString()}`;

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      if (item.contentType === "translation") {
        throw CmsError.validation(
          "Translation proposals publish through verification, not scheduling.",
          { field: "contentType" }
        );
      }
      assertTransition(item.status, "scheduled");
      this.assertExpectedVersion(item, input.expectedVersion);
      validateStoredItemForPromotion(item);
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "scheduled",
        scheduledAt,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "scheduled",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "schedule",
        details: {
          fromStatus: item.status,
          toStatus: "scheduled",
          versionNumber: nextVersion,
          scheduledAt: scheduledAt.toISOString(),
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ------------------------------------------------------------ publish

  /**
   * approved|scheduled → published. Requires cms.publish.
   * Guards: approval record present, payload valid, and — for overlays —
   * the referenced canonical entity must exist. Writes CMS state only;
   * canonical knowledge tables are never modified.
   */
  async publish(
    itemId: string,
    input: TransitionInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.publish");
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Published";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      if (item.contentType === "translation") {
        throw CmsError.validation(
          "Translation proposals publish through verification, not direct publishing.",
          { field: "contentType" }
        );
      }
      assertTransition(item.status, "published");
      this.assertExpectedVersion(item, input.expectedVersion);
      validateStoredItemForPromotion(item);
      if (item.reviewerId === null) {
        throw CmsError.validation(
          "Item cannot be published without an approval record.",
          { field: "reviewerId" }
        );
      }
      if (item.entityId !== null) {
        // validateStoredItemForPromotion() above already proved contentType
        // is a known CmsContentType, so this cast is total, not a guess.
        const exists = await tx.canonicalEntityExists(
          item.contentType as CmsContentType,
          item.entityId
        );
        if (!exists) {
          throw CmsError.validation(
            "Referenced canonical entity does not exist. Publication blocked.",
            { contentType: item.contentType, entityId: item.entityId }
          );
        }
      }
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "published",
        publishedAt: now,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "published",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "publish",
        details: {
          fromStatus: item.status,
          toStatus: "published",
          versionNumber: nextVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ------------------------------------------------------------ archive

  /**
   * published → archived. Requires cms.archive. History (versions, audit)
   * is preserved — nothing is deleted.
   */
  async archive(
    itemId: string,
    input: TransitionInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.archive");
    const changeSummary =
      assertChangeSummary(input.changeSummary) ?? "Archived";

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      assertTransition(item.status, "archived");
      this.assertExpectedVersion(item, input.expectedVersion);
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;

      await tx.updateContentItem(itemId, {
        status: "archived",
        archivedAt: now,
        currentVersion: nextVersion,
        updatedAt: now,
      });
      await this.appendVersion(tx, item, actor, {
        versionNumber: nextVersion,
        statusAtSnapshot: "archived",
        changeSummary,
        now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "archive",
        details: {
          fromStatus: item.status,
          toStatus: "archived",
          versionNumber: nextVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ----------------------------------------------------------- rollback

  /**
   * Restore the staged payload to an earlier immutable snapshot WITHOUT
   * deleting history: the target snapshot is copied into a NEW version.
   * Requires cms.rollback (admin-only). New state: archived → published,
   * anything else → draft (changed content must be re-reviewed).
   */
  async rollback(
    itemId: string,
    input: RollbackInput
  ): Promise<CmsItemRecord> {
    const actor = await requirePermission("cms.rollback");
    if (!Number.isInteger(input.targetVersion) || input.targetVersion < 1) {
      throw CmsError.validation("targetVersion must be a positive integer.", {
        field: "targetVersion",
      });
    }
    const changeSummary =
      assertChangeSummary(input.changeSummary) ??
      `Rollback to version ${input.targetVersion}`;

    await this.db.transaction(async (tx) => {
      const item = await this.requireStoredItem(tx, itemId);
      this.assertExpectedVersion(item, input.expectedVersion);
      if (input.targetVersion === item.currentVersion) {
        throw CmsError.validation(
          "targetVersion is already the current version. Nothing to roll back.",
          { field: "targetVersion", currentVersion: item.currentVersion }
        );
      }
      const versions = await tx.listContentVersions(itemId);
      const target = versions.find(
        (v) => v.versionNumber === input.targetVersion
      );
      if (!target) {
        throw CmsError.notFound(
          "CMS version",
          `${itemId}#${input.targetVersion}`
        );
      }
      const now = this.clock();
      const nextVersion = item.currentVersion + 1;
      const toStatus = rollbackTargetStatus(item.status);
      const restoredPayload = deepCopy(target.snapshotPayload);

      await tx.updateContentItem(itemId, {
        stagedPayload: restoredPayload,
        status: toStatus,
        currentVersion: nextVersion,
        // A draft re-enters the review cycle clean; a republication keeps
        // its approval lineage but records the new publication moment.
        ...(toStatus === "draft"
          ? { reviewerId: null, scheduledAt: null }
          : { publishedAt: now }),
        updatedAt: now,
      });
      await tx.insertContentVersion({
        id: this.generateId("version"),
        contentItemId: itemId,
        versionNumber: nextVersion,
        snapshotPayload: deepCopy(restoredPayload),
        statusAtSnapshot: toStatus,
        createdById: actor.id,
        changeSummary,
        createdAt: now,
      });
      await this.appendAudit(tx, {
        contentItemId: itemId,
        actor,
        action: "rollback",
        details: {
          fromStatus: item.status,
          toStatus,
          versionNumber: nextVersion,
          targetVersion: input.targetVersion,
          changeSummary,
        },
        context: input.context,
        now,
      });
    });

    return this.getItemAfterWrite(itemId);
  }

  // ------------------------------------------------------------ helpers

  /** Read inside a tx: 404 when missing, 400 when status is unrecognized. */
  private async requireStoredItem(
    store: CmsStore,
    itemId: string
  ): Promise<CmsItemRecord & { status: CmsStatus }> {
    const item = await store.getContentItem(itemId);
    if (!item) throw CmsError.notFound("CMS item", itemId);
    if (!isCmsStatus(item.status)) {
      throw CmsError.validation("Stored item has an unrecognized status.", {
        field: "status",
      });
    }
    return item as CmsItemRecord & { status: CmsStatus };
  }

  private assertExpectedVersion(
    item: CmsItemRecord,
    expectedVersion: number
  ): void {
    if (item.currentVersion !== expectedVersion) {
      throw CmsError.versionConflict(expectedVersion, item.currentVersion);
    }
  }

  /** Append a snapshot of the item's CURRENT staged payload. */
  private async appendVersion(
    tx: CmsStore,
    item: CmsItemRecord,
    actor: CmsActor,
    snapshot: {
      versionNumber: number;
      statusAtSnapshot: CmsStatus;
      changeSummary: string;
      now: Date;
    }
  ): Promise<void> {
    await tx.insertContentVersion({
      id: this.generateId("version"),
      contentItemId: item.id,
      versionNumber: snapshot.versionNumber,
      snapshotPayload: deepCopy(item.stagedPayload),
      statusAtSnapshot: snapshot.statusAtSnapshot,
      createdById: actor.id,
      changeSummary: snapshot.changeSummary,
      createdAt: snapshot.now,
    });
  }

  private async appendAudit(
    tx: CmsStore,
    event: {
      contentItemId: string;
      actor: CmsActor;
      action: CmsAuditAction;
      details: Record<string, unknown>;
      context?: CmsRequestContext;
      now: Date;
    }
  ): Promise<void> {
    await tx.insertAuditEvent({
      id: this.generateId("audit"),
      contentItemId: event.contentItemId,
      actorId: event.actor.id,
      action: event.action,
      details: event.details,
      ipAddress: event.context?.ipAddress ?? null,
      occurredAt: event.now,
    });
  }

  /** Fresh read after COMMIT (proves the write path end to end). */
  private async getItemAfterWrite(itemId: string): Promise<CmsItemRecord> {
    const item = await this.db.getContentItem(itemId);
    if (!item) {
      throw new CmsError(
        404,
        "NOT_FOUND",
        `CMS item vanished after write: ${itemId}.`,
        { id: itemId }
      );
    }
    return item;
  }
}
