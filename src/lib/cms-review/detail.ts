/**
 * Review detail action routing — Phase 13.5D-2.
 *
 * Pure client-safe mapping from (action, contentType) to the existing
 * CMS endpoint. The review workspace is a decision surface, not an
 * editor: `save` has no target here (dictionary editing lives at
 * /admin/dictionary/[id]), and translation disposition routes to
 * /verify — publish/schedule/archive/rollback have no translation
 * endpoints and resolve to null so no button can ever call them.
 */
import {
  CMS_ACTION_META,
  visibleActions,
} from "@/lib/cms-admin/actions";
import type { CmsActionId } from "@/lib/cms-admin/actions";
import {
  CMS_DICTIONARY_API,
  CMS_TRANSLATIONS_API,
} from "@/lib/cms-admin/api";
import type { CmsPermission, CmsStatus } from "@/lib/cms-admin/types";
import type { ApiFailureKind } from "@/lib/cms-admin/api";

export type KnownReviewSlice = "dictionary" | "translation";

export function sliceApiBase(slice: KnownReviewSlice): string {
  return slice === "dictionary" ? CMS_DICTIONARY_API : CMS_TRANSLATIONS_API;
}

const TRANSLATION_FORBIDDEN: ReadonlySet<CmsActionId> = new Set([
  "schedule",
  "publish",
  "archive",
  "rollback",
]);

export interface ActionTarget {
  readonly url: string;
  readonly method: "POST" | "PATCH";
}

/**
 * Resolve an action to its existing endpoint, or null when the action
 * has no valid target (unknown content type, translation publish-class
 * actions, verify outside translations, or `save` which needs an
 * editor form). Buttons render only for non-null targets.
 */
export function resolveActionTarget(
  action: CmsActionId,
  contentType: string,
  id: string
): ActionTarget | null {
  if (action === "save") return null;
  if (contentType !== "dictionary" && contentType !== "translation") {
    return null;
  }
  if (contentType === "translation" && TRANSLATION_FORBIDDEN.has(action)) {
    return null;
  }
  if (action === "verify" && contentType !== "translation") return null;
  const meta = CMS_ACTION_META[action];
  const base = sliceApiBase(contentType);
  return {
    url: `${base}/${encodeURIComponent(id)}${meta.pathSuffix}`,
    method: meta.method,
  };
}

/** Actions the review detail bar may render (visibleActions minus `save`). */
export function reviewDetailActions(input: {
  permissions: readonly CmsPermission[];
  isAdmin: boolean;
  status: CmsStatus;
  isAuthor: boolean;
  contentType: string;
}): CmsActionId[] {
  return visibleActions(input).filter((action) => action !== "save");
}

/**
 * Slice probing for detail load: try dictionary first, then translations.
 * Only a 404 may fall through to the other slice — 401/403/409/500 must
 * surface immediately and never masquerade as "not found".
 */
export function shouldTryOtherSlice(kind: ApiFailureKind): boolean {
  return kind === "notFound";
}

/** Actions whose review modal collects a reason before submitting. */
export function actionNeedsReason(action: CmsActionId): boolean {
  return action === "requestChanges" || action === "override";
}
