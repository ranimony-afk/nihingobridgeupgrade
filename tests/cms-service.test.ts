/**
 * Phase 13.3B — CmsService workflow/state-machine tests.
 *
 * Runs the full §22 matrix against the in-memory FakeCmsStore (no DATABASE_URL,
 * no production contact). Authorization goes through the REAL 13.3A module with
 * injected deterministic actors — these tests prove the service never bypasses it.
 */
import { describe, expect, it, beforeEach } from "vitest";

import type { CmsRole } from "@/lib/auth";
import { AuthorizationError, resetActorResolver, setActorResolver } from "@/lib/auth";
import { CmsService } from "@/services/cms/cmsService";
import type { CreateDraftInput } from "@/services/cms/cmsService";
import { CmsError } from "@/services/cms/errors";
import type { CmsItemInsert } from "@/services/cms/types";
import { FakeCmsStore, FailingCmsStore } from "./cms-fake-store";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = "2026-07-01T00:00:00.000Z";
const PAST = "2026-05-01T00:00:00.000Z";

let store: FakeCmsStore;
let service: CmsService;
let idSeq: number;

beforeEach(() => {
  resetActorResolver();
  store = new FakeCmsStore();
  idSeq = 0;
  service = new CmsService(store, {
    clock: () => new Date(NOW),
    generateId: (prefix) => `test-${prefix}-${++idSeq}`,
  });
});

function actAs(role: CmsRole, id = `${role}-1`) {
  setActorResolver(() => ({ id, role }));
}

function draftInput(overrides: Record<string, unknown> = {}): CreateDraftInput {
  return {
    contentType: "dictionary",
    entityId: null,
    title: "water",
    stagedPayload: { headword: "test", reading: "みず" },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    ...overrides,
  };
}

async function editorCreatesDraft(overrides: Record<string, unknown> = {}) {
  actAs("editor");
  return service.createDraft(draftInput(overrides));
}

/** editor creates + submits; reviewer approves. Returns the approved item. */
async function driveToApproved(overrides: Record<string, unknown> = {}) {
  const created = await editorCreatesDraft(overrides);
  actAs("editor");
  const submitted = await service.submitForReview(created.id, {
    expectedVersion: 1,
  });
  actAs("reviewer");
  return service.approve(submitted.id, { expectedVersion: 2 });
}

/** driveToApproved + admin publishes. Returns the published item. */
async function driveToPublished(overrides: Record<string, unknown> = {}) {
  const approved = await driveToApproved(overrides);
  actAs("admin");
  return service.publish(approved.id, { expectedVersion: 3 });
}

describe("Phase 13.3B: CmsService creation", () => {
  it("editor creates a draft with version 1, v1 snapshot, and audit", async () => {
    const item = await editorCreatesDraft();
    expect(item.status).toBe("draft");
    expect(item.currentVersion).toBe(1);
    expect(item.authorId).toBe("editor-1");
    expect(item.createdAt).toEqual(NOW);

    const versions = await service.getVersions(item.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].statusAtSnapshot).toBe("draft");
    expect(versions[0].snapshotPayload).toEqual({
      headword: "test",
      reading: "みず",
    });
    expect(versions[0].createdById).toBe("editor-1");

    const audit = await service.getAuditTrail(item.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("create_draft");
    expect(audit[0].actorId).toBe("editor-1");
  });

  it("reviewer cannot create a draft (403)", async () => {
    actAs("reviewer");
    await expect(service.createDraft(draftInput())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("learner cannot create a draft (403)", async () => {
    actAs("learner");
    const failure = await service.createDraft(draftInput()).catch((e) => e);
    expect(failure).toBeInstanceOf(AuthorizationError);
    expect(failure.status).toBe(403);
  });

  it("unauthenticated caller cannot create a draft (401)", async () => {
    await expect(service.createDraft(draftInput())).rejects.toMatchObject({
      status: 401,
    });
  });

  it("invalid draft input is rejected", async () => {
    actAs("editor");
    await expect(
      service.createDraft(draftInput({ contentType: "podcast" }))
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      service.createDraft(draftInput({ title: "   " }))
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createDraft(draftInput({ sourceRef: "" }))
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createDraft(draftInput({ stagedPayload: ["not", "an", "object"] }))
    ).rejects.toMatchObject({ status: 400 });
    // article has no canonical table: entityId must be null.
    await expect(
      service.createDraft(
        draftInput({ contentType: "article", entityId: "art-1" })
      )
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("Phase 13.3B: CmsService editing", () => {
  it("editor edits a draft: version increments, v1 snapshot immutable", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    const updated = await service.updateDraft(created.id, {
      expectedVersion: 1,
      title: "water (revised)",
      stagedPayload: { headword: "test", reading: "みず", note: "v2" },
    });
    expect(updated.currentVersion).toBe(2);
    expect(updated.title).toBe("water (revised)");
    expect(updated.status).toBe("draft");

    const versions = await service.getVersions(created.id);
    expect(versions).toHaveLength(2);
    expect(versions[0].snapshotPayload).toEqual({
      headword: "test",
      reading: "みず",
    });
    expect(versions[1].snapshotPayload).toEqual({
      headword: "test",
      reading: "みず",
      note: "v2",
    });

    const audit = await service.getAuditTrail(created.id);
    expect(audit.map((a) => a.action)).toEqual(["create_draft", "edit"]);
    expect(audit[1].details).toMatchObject({
      toStatus: "draft",
      versionNumber: 2,
      changedFields: ["title", "stagedPayload"],
    });
  });

  it("stale expectedVersion produces a 409 conflict", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.updateDraft(created.id, {
      expectedVersion: 1,
      title: "v2 title",
    });
    const failure = await service
      .updateDraft(created.id, { expectedVersion: 1, title: "stale" })
      .catch((e) => e);
    expect(failure).toBeInstanceOf(CmsError);
    expect(failure.status).toBe(409);
    expect(failure.code).toBe("VERSION_CONFLICT");
  });

  it("published content cannot be edited", async () => {
    const published = await driveToPublished();
    actAs("editor");
    await expect(
      service.updateDraft(published.id, {
        expectedVersion: published.currentVersion,
        title: "sneaky edit",
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });
  });

  it("approved content cannot be edited", async () => {
    const approved = await driveToApproved();
    actAs("editor");
    await expect(
      service.updateDraft(approved.id, {
        expectedVersion: approved.currentVersion,
        title: "sneaky edit",
      })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });
  });

  it("empty update is rejected", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await expect(
      service.updateDraft(created.id, { expectedVersion: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("Phase 13.3B: CmsService review", () => {
  it("editor submits draft for review", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    const submitted = await service.submitForReview(created.id, {
      expectedVersion: 1,
    });
    expect(submitted.status).toBe("review");
    expect(submitted.currentVersion).toBe(2);
    const audit = await service.getAuditTrail(created.id);
    expect(audit.map((a) => a.action)).toEqual([
      "create_draft",
      "submit_review",
    ]);
  });

  it("invalid stored content is rejected at submission", async () => {
    // Simulate a legacy/hand-mutated row bypassing the service.
    const bad: CmsItemInsert = {
      id: "legacy-bad",
      contentType: "dictionary",
      entityId: null,
      title: "",
      status: "draft",
      currentVersion: 1,
      stagedPayload: {},
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
      originalSourceRef: null,
      authorId: "editor-1",
      reviewerId: null,
      editorialNotes: null,
      scheduledAt: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    store.seedItemDirect(bad);
    actAs("editor");
    await expect(
      service.submitForReview("legacy-bad", { expectedVersion: 1 })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("reviewer approves, editor cannot approve", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });

    await expect(
      service.approve(created.id, { expectedVersion: 2 })
    ).rejects.toMatchObject({ status: 403 });

    actAs("reviewer");
    const approved = await service.approve(created.id, {
      expectedVersion: 2,
    });
    expect(approved.status).toBe("approved");
    expect(approved.reviewerId).toBe("reviewer-1");
    expect(approved.currentVersion).toBe(3);
  });

  it("reviewer requests changes with a reason; editor cannot", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });

    await expect(
      service.requestChanges(created.id, {
        expectedVersion: 2,
        reason: "editor tries to self-return",
      })
    ).rejects.toMatchObject({ status: 403 });

    actAs("reviewer");
    await expect(
      service.requestChanges(created.id, {
        expectedVersion: 2,
        reason: "",
      })
    ).rejects.toMatchObject({ status: 400 });

    const returned = await service.requestChanges(created.id, {
      expectedVersion: 2,
      reason: "Reading needs verification.",
    });
    expect(returned.status).toBe("draft");
    expect(returned.reviewerId).toBe("reviewer-1");

    const versions = await service.getVersions(created.id);
    expect(versions[versions.length - 1].changeSummary).toBe(
      "Reading needs verification."
    );
    const audit = await service.getAuditTrail(created.id);
    const last = audit[audit.length - 1];
    expect(last.action).toBe("request_changes");
    expect(last.details).toMatchObject({
      reason: "Reading needs verification.",
    });
  });
});

describe("Phase 13.3B: CmsService approval", () => {
  it("draft cannot skip directly to approved", async () => {
    const created = await editorCreatesDraft();
    actAs("reviewer");
    await expect(
      service.approve(created.id, { expectedVersion: 1 })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });
  });

  it("author approving their own content is rejected", async () => {
    // Admin authors, submits, then attempts normal approval of own work.
    actAs("admin");
    const created = await service.createDraft(draftInput());
    await service.submitForReview(created.id, { expectedVersion: 1 });
    const failure = await service
      .approve(created.id, { expectedVersion: 2 })
      .catch((e) => e);
    expect(failure).toBeInstanceOf(CmsError);
    expect(failure.status).toBe(403);
    expect(failure.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("admin emergency override is a distinct, auditable operation", async () => {
    actAs("admin");
    const created = await service.createDraft(draftInput());
    await service.submitForReview(created.id, { expectedVersion: 1 });
    const approved = await service.approveWithAdminOverride(created.id, {
      expectedVersion: 2,
      reason: "Production typo fix, no reviewer online.",
    });
    expect(approved.status).toBe("approved");
    const audit = await service.getAuditTrail(created.id);
    const last = audit[audit.length - 1];
    expect(last.action).toBe("approve");
    expect(last.details).toMatchObject({
      adminOverride: true,
      reason: "Production typo fix, no reviewer online.",
    });
  });

  it("reviewer cannot use the admin override; reason is required", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });
    actAs("reviewer");
    await expect(
      service.approveWithAdminOverride(created.id, {
        expectedVersion: 2,
        reason: "reviewer tries override",
      })
    ).rejects.toMatchObject({ status: 403 });

    actAs("admin");
    await expect(
      service.approveWithAdminOverride(created.id, {
        expectedVersion: 2,
        reason: "",
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("Phase 13.3B: CmsService scheduling", () => {
  it("approved content can be scheduled for the future", async () => {
    const approved = await driveToApproved();
    actAs("admin");
    const scheduled = await service.schedule(approved.id, {
      expectedVersion: 3,
      scheduledAt: FUTURE,
    });
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.scheduledAt).toEqual(new Date(FUTURE));
    const audit = await service.getAuditTrail(approved.id);
    expect(audit[audit.length - 1].action).toBe("schedule");
  });

  it("draft cannot be scheduled; past/invalid timestamps rejected", async () => {
    const created = await editorCreatesDraft();
    actAs("admin");
    await expect(
      service.schedule(created.id, { expectedVersion: 1, scheduledAt: FUTURE })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });

    const approved = await driveToApproved();
    actAs("admin");
    await expect(
      service.schedule(approved.id, { expectedVersion: 3, scheduledAt: PAST })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.schedule(approved.id, {
        expectedVersion: 3,
        scheduledAt: "not-a-date",
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("editor cannot schedule (lacks cms.schedule)", async () => {
    const approved = await driveToApproved();
    actAs("editor");
    await expect(
      service.schedule(approved.id, { expectedVersion: 3, scheduledAt: FUTURE })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("Phase 13.3B: CmsService publishing", () => {
  it("approved content publishes with a publication snapshot", async () => {
    const approved = await driveToApproved();
    actAs("admin");
    const published = await service.publish(approved.id, {
      expectedVersion: 3,
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toEqual(NOW);
    expect(published.currentVersion).toBe(4);

    const versions = await service.getVersions(approved.id);
    expect(versions[versions.length - 1].statusAtSnapshot).toBe("published");
    const audit = await service.getAuditTrail(approved.id);
    expect(audit[audit.length - 1].action).toBe("publish");
  });

  it("scheduled content publishes", async () => {
    const approved = await driveToApproved();
    actAs("admin");
    const scheduled = await service.schedule(approved.id, {
      expectedVersion: 3,
      scheduledAt: FUTURE,
    });
    const published = await service.publish(scheduled.id, {
      expectedVersion: 4,
    });
    expect(published.status).toBe("published");
  });

  it("draft and review cannot skip to published", async () => {
    const created = await editorCreatesDraft();
    actAs("admin");
    await expect(
      service.publish(created.id, { expectedVersion: 1 })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });

    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });
    actAs("admin");
    await expect(
      service.publish(created.id, { expectedVersion: 2 })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });
  });

  it("unauthorized publishing is rejected", async () => {
    const approved = await driveToApproved();
    actAs("editor");
    await expect(
      service.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
    actAs("reviewer");
    await expect(
      service.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("overlay publication requires the canonical entity to exist", async () => {
    // Missing canonical entity blocks publication.
    const created = await editorCreatesDraft({ entityId: "dict-999" });
    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });
    actAs("reviewer");
    await service.approve(created.id, { expectedVersion: 2 });
    actAs("admin");
    await expect(
      service.publish(created.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 400 });

    // Seeded canonical entity unblocks it.
    store.seedCanonicalEntity("dictionary", "dict-999");
    const published = await service.publish(created.id, {
      expectedVersion: 3,
    });
    expect(published.status).toBe("published");
  });
});

describe("Phase 13.3B: CmsService archive", () => {
  it("published content archives with history intact", async () => {
    const published = await driveToPublished();
    actAs("admin");
    const archived = await service.archive(published.id, {
      expectedVersion: 4,
    });
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toEqual(NOW);

    const versions = await service.getVersions(published.id);
    expect(versions).toHaveLength(5);
    const audit = await service.getAuditTrail(published.id);
    expect(audit.map((a) => a.action)).toEqual([
      "create_draft",
      "submit_review",
      "approve",
      "publish",
      "archive",
    ]);
  });

  it("draft cannot be archived", async () => {
    const created = await editorCreatesDraft();
    actAs("admin");
    await expect(
      service.archive(created.id, { expectedVersion: 1 })
    ).rejects.toMatchObject({ status: 400, code: "INVALID_TRANSITION" });
  });
});

describe("Phase 13.3B: CmsService rollback", () => {
  it("rollback copies the target snapshot into a NEW version", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.updateDraft(created.id, {
      expectedVersion: 1,
      stagedPayload: { v: 2 },
    });
    await service.updateDraft(created.id, {
      expectedVersion: 2,
      stagedPayload: { v: 3 },
    });
    await service.submitForReview(created.id, { expectedVersion: 3 });
    // v1 create, v2 edit, v3 edit, v4 submit.

    actAs("admin");
    const rolled = await service.rollback(created.id, {
      expectedVersion: 4,
      targetVersion: 2,
    });
    expect(rolled.currentVersion).toBe(5);
    expect(rolled.status).toBe("draft");
    expect(rolled.stagedPayload).toEqual({ v: 2 });

    const versions = await service.getVersions(created.id);
    expect(versions).toHaveLength(5);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(versions[4].snapshotPayload).toEqual({ v: 2 });
    // Old snapshots untouched.
    expect(versions[2].snapshotPayload).toEqual({ v: 3 });

    const audit = await service.getAuditTrail(created.id);
    const last = audit[audit.length - 1];
    expect(last.action).toBe("rollback");
    expect(last.details).toMatchObject({ targetVersion: 2, toStatus: "draft" });
  });

  it("rollback rejects unknown targets and no-op targets", async () => {
    const created = await editorCreatesDraft();
    actAs("admin");
    await expect(
      service.rollback(created.id, { expectedVersion: 1, targetVersion: 9 })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.rollback(created.id, { expectedVersion: 1, targetVersion: 1 })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rollback from archived republicates; from published returns to draft", async () => {
    const published = await driveToPublished();
    actAs("admin");
    const archived = await service.archive(published.id, {
      expectedVersion: 4,
    });
    const republished = await service.rollback(archived.id, {
      expectedVersion: 5,
      targetVersion: 4,
    });
    expect(republished.status).toBe("published");
    expect(republished.currentVersion).toBe(6);

    const published2 = await driveToPublished();
    actAs("admin");
    const toDraft = await service.rollback(published2.id, {
      expectedVersion: 4,
      targetVersion: 1,
    });
    expect(toDraft.status).toBe("draft");
    expect(toDraft.reviewerId).toBeNull();
  });

  it("non-admin cannot roll back", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.updateDraft(created.id, {
      expectedVersion: 1,
      stagedPayload: { v: 2 },
    });
    await expect(
      service.rollback(created.id, { expectedVersion: 2, targetVersion: 1 })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("Phase 13.3B: CmsService security", () => {
  it("caller-supplied identity fields are ignored, never trusted", async () => {
    actAs("editor");
    const hostile = draftInput({
      authorId: "admin-1",
      reviewerId: "reviewer-1",
      actorId: "admin-1",
      role: "admin",
    }) as unknown as CreateDraftInput;
    const item = await service.createDraft(hostile);
    expect(item.authorId).toBe("editor-1");
    expect(item.reviewerId).toBeNull();

    // The service API itself exposes no identity parameters at all.
    for (const method of [
      "createDraft",
      "updateDraft",
      "submitForReview",
      "requestChanges",
      "approve",
      "approveWithAdminOverride",
      "schedule",
      "publish",
      "archive",
      "rollback",
    ] as const) {
      const source = CmsService.prototype[method].toString();
      expect(source).not.toMatch(/input\.(authorId|reviewerId|actorId|role)\b/);
    }
  });

  it("reads require cms.read; unknown items 404", async () => {
    const created = await editorCreatesDraft();
    actAs("learner");
    await expect(service.getItem(created.id)).rejects.toMatchObject({
      status: 403,
    });
    actAs("reviewer");
    await expect(service.getItem("missing")).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getVersions("missing")).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getAuditTrail("missing")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("Phase 13.3B: CmsService atomicity", () => {
  it("failed audit write leaves content, version, and audit unchanged", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.submitForReview(created.id, { expectedVersion: 1 });

    const failing = new FailingCmsStore(store, "insertAuditEvent");
    const failingService = new CmsService(failing, {
      clock: () => new Date(NOW),
      generateId: (prefix) => `test-${prefix}-${++idSeq}`,
    });
    actAs("reviewer");
    await expect(
      failingService.approve(created.id, { expectedVersion: 2 })
    ).rejects.toThrow("injected audit-write failure");

    // Prove rollback through the healthy service: nothing moved.
    const item = await service.getItem(created.id);
    expect(item.status).toBe("review");
    expect(item.currentVersion).toBe(2);
    expect(item.reviewerId).toBeNull();
    expect(await service.getVersions(created.id)).toHaveLength(2);
    expect(await service.getAuditTrail(created.id)).toHaveLength(2);
  });

  it("failed version write leaves content, version, and audit unchanged", async () => {
    const approved = await driveToApproved();
    const failing = new FailingCmsStore(store, "insertContentVersion");
    const failingService = new CmsService(failing, {
      clock: () => new Date(NOW),
      generateId: (prefix) => `test-${prefix}-${++idSeq}`,
    });
    actAs("admin");
    await expect(
      failingService.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toThrow("injected version-write failure");

    const item = await service.getItem(approved.id);
    expect(item.status).toBe("approved");
    expect(item.currentVersion).toBe(3);
    expect(item.publishedAt).toBeNull();
    expect(await service.getVersions(approved.id)).toHaveLength(3);
    expect(await service.getAuditTrail(approved.id)).toHaveLength(3);
  });

  it("full lifecycle produces one version and one audit per mutation", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await service.updateDraft(created.id, {
      expectedVersion: 1,
      stagedPayload: { v: 2 },
    });
    await service.submitForReview(created.id, { expectedVersion: 2 });
    actAs("reviewer");
    await service.approve(created.id, { expectedVersion: 3 });
    actAs("admin");
    await service.schedule(created.id, {
      expectedVersion: 4,
      scheduledAt: FUTURE,
    });
    await service.publish(created.id, { expectedVersion: 5 });
    await service.archive(created.id, { expectedVersion: 6 });

    const versions = await service.getVersions(created.id);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(versions.map((v) => v.statusAtSnapshot)).toEqual([
      "draft",
      "draft",
      "review",
      "approved",
      "scheduled",
      "published",
      "archived",
    ]);
    const audit = await service.getAuditTrail(created.id);
    expect(audit.map((a) => a.action)).toEqual([
      "create_draft",
      "edit",
      "submit_review",
      "approve",
      "schedule",
      "publish",
      "archive",
    ]);
  });
});
