import type { CmsStatus } from "./types";
import { CmsError } from "./errors";

/**
 * CMS workflow state machine — Phase 13.3B (pure, no I/O).
 *
 * Allowed WORKFLOW transitions (§4):
 *
 *   draft     → review
 *   review    → draft | approved
 *   approved  → scheduled | published
 *   scheduled → published
 *   published → archived
 *   archived  → published   (admin rollback/republication only)
 *
 * Arbitrary state assignment is impossible: every transition goes through
 * assertTransition(). In particular draft → published and
 * review → published are rejected — publication must follow the approval
 * path.
 */

/** Workflow edges. Rollback is NOT a workflow transition (see below). */
export const CMS_TRANSITIONS: Record<CmsStatus, readonly CmsStatus[]> = {
  draft: ["review"],
  review: ["draft", "approved"],
  approved: ["scheduled", "published"],
  scheduled: ["published"],
  published: ["archived"],
  archived: ["published"],
};

export function canTransition(from: CmsStatus, to: CmsStatus): boolean {
  return CMS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw INVALID_TRANSITION unless (from → to) is a workflow edge. */
export function assertTransition(from: CmsStatus, to: CmsStatus): void {
  if (!canTransition(from, to)) {
    throw CmsError.invalidTransition(from, to);
  }
}

/**
 * Rollback is an admin corrective action, not a workflow transition: it
 * restores the staged payload to an earlier snapshot and therefore needs
 * its own explicit edge table instead of bypassing the machine silently.
 *
 * - From `archived`: the item returns to `published` with the restored
 *   payload (this is the §4 archived → published republication edge; it is
 *   admin-only because rollback requires cms.rollback).
 * - From any other state: the item returns to `draft`, because changed
 *   content must pass review and approval again before publication.
 */
export const ROLLBACK_TARGET_STATUS: Record<CmsStatus, CmsStatus> = {
  draft: "draft",
  review: "draft",
  approved: "draft",
  scheduled: "draft",
  published: "draft",
  archived: "published",
};

export function rollbackTargetStatus(from: CmsStatus): CmsStatus {
  return ROLLBACK_TARGET_STATUS[from];
}
