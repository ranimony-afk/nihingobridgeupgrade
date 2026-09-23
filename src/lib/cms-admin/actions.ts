/**
 * CMS admin action visibility — Phase 13.5B.
 *
 * Pure client-safe logic: given server-verified capabilities + item state,
 * which workflow buttons may be SHOWN. Hiding is UX only — the 13.5A API
 * re-authorizes every call, so a forged client can display anything and
 * still be rejected with 401/403/409.
 */
import type { CmsPermission, CmsStatus } from "./types";

export type CmsActionId =
  | "save"
  | "submit"
  | "requestChanges"
  | "approve"
  | "override"
  | "schedule"
  | "publish"
  | "verify"
  | "archive"
  | "rollback";

export interface CmsActionMeta {
  readonly label: string;
  /** API path suffix below /api/cms/dictionary/[id] ("" = item route). */
  readonly pathSuffix: string;
  readonly method: "PATCH" | "POST";
  /** Button styling role. */
  readonly tone: "primary" | "dark" | "danger" | "neutral";
}

export const CMS_ACTION_META: Record<CmsActionId, CmsActionMeta> = {
  save: { label: "Save Draft", pathSuffix: "", method: "PATCH", tone: "primary" },
  submit: { label: "Submit for Review", pathSuffix: "/submit", method: "POST", tone: "dark" },
  requestChanges: { label: "Request Changes", pathSuffix: "/request-changes", method: "POST", tone: "neutral" },
  approve: { label: "Approve", pathSuffix: "/approve", method: "POST", tone: "primary" },
  override: { label: "Admin Override Approve", pathSuffix: "/approve-override", method: "POST", tone: "danger" },
  schedule: { label: "Schedule", pathSuffix: "/schedule", method: "POST", tone: "dark" },
  publish: { label: "Publish", pathSuffix: "/publish", method: "POST", tone: "primary" },
  verify: { label: "Verify Translation", pathSuffix: "/verify", method: "POST", tone: "primary" },
  archive: { label: "Archive", pathSuffix: "/archive", method: "POST", tone: "neutral" },
  rollback: { label: "Rollback", pathSuffix: "/rollback", method: "POST", tone: "danger" },
};

/** Status pill metadata reusing the app's badge vocabulary. */
export const CMS_STATUS_META: Record<
  CmsStatus,
  { label: string; badgeClass: string }
> = {
  draft: {
    label: "Draft",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
  },
  review: {
    label: "In Review",
    badgeClass: "bg-amber-100 text-amber-800 border border-amber-200",
  },
  approved: {
    label: "Approved",
    badgeClass: "bg-blue-100 text-blue-800 border border-blue-200",
  },
  scheduled: {
    label: "Scheduled",
    badgeClass: "bg-violet-100 text-violet-800 border border-violet-200",
  },
  published: {
    label: "Published",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  },
  archived: {
    label: "Archived",
    badgeClass: "bg-stone-200 text-stone-700 border border-stone-300",
  },
};

export const CMS_STATUS_FILTERS: readonly (CmsStatus | "all")[] = [
  "all",
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

/**
 * Which actions to display. Mirrors the server matrix (role → permission
 * from 13.3A, transitions from 13.3B): permission AND valid source status
 * must both hold. Authors never see Approve on their own items (the server
 * rejects self-approval; admins see the explicit override instead).
 *
 * 13.5D-2: `contentType` (default "dictionary") selects translation
 * disposition — approved translations show `verify` instead of
 * schedule/publish/archive/rollback, which have no translation endpoints
 * (the server also 400-rejects publish/schedule on translations).
 */
export function visibleActions(input: {
  permissions: readonly CmsPermission[];
  isAdmin: boolean;
  status: CmsStatus;
  isAuthor: boolean;
  contentType?: string;
}): CmsActionId[] {
  const { permissions, isAdmin, status, isAuthor } = input;
  const isTranslation = (input.contentType ?? "dictionary") === "translation";
  const can = (p: CmsPermission): boolean => permissions.includes(p);
  const actions: CmsActionId[] = [];

  if (can("cms.edit") && status === "draft") actions.push("save");
  if (can("cms.submit_review") && status === "draft") actions.push("submit");
  if (can("cms.approve") && status === "review") {
    actions.push("requestChanges");
    if (!isAuthor) actions.push("approve");
    if (isAdmin) actions.push("override");
  }
  if (can("cms.schedule") && status === "approved" && !isTranslation) {
    actions.push("schedule");
  }
  if (
    can("cms.publish") &&
    (status === "approved" || status === "scheduled") &&
    !isTranslation
  ) {
    actions.push("publish");
  }
  if (can("cms.verify_translation") && status === "approved" && isTranslation) {
    actions.push("verify");
  }
  if (can("cms.archive") && status === "published" && !isTranslation) {
    actions.push("archive");
  }
  if (can("cms.rollback") && !isTranslation) actions.push("rollback");

  return actions;
}
