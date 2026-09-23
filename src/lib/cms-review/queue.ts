/**
 * Review queue data shaping — Phase 13.5D-2.
 *
 * Pure client-safe helpers: normalize the two slice list responses into
 * one view model and order it. The merged order is UI ordering only, not
 * a transactional guarantee.
 */
import {
  CMS_DICTIONARY_API,
  CMS_TRANSLATIONS_API,
} from "@/lib/cms-admin/api";
import type { AdminCmsItem, CmsStatus } from "@/lib/cms-admin/types";
import type {
  ReviewQueueItem,
  ReviewQueueTab,
  ReviewTypeFilter,
} from "./types";

export const REVIEW_QUEUE_LIMIT = 50;

export function toQueueItem(item: AdminCmsItem): ReviewQueueItem {
  return {
    id: item.id,
    contentType: item.contentType,
    title: item.title,
    entityId: item.entityId,
    status: item.status,
    currentVersion: item.currentVersion,
    authorId: item.authorId,
    reviewerId: item.reviewerId,
    provenanceType: item.provenanceType,
    sourceRef: item.sourceRef,
    updatedAt: item.updatedAt,
  };
}

function updatedTime(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Merge both slice results, newest first (UI ordering only). */
export function mergeQueueResults(
  dictionaryItems: readonly AdminCmsItem[],
  translationItems: readonly AdminCmsItem[]
): ReviewQueueItem[] {
  return [...dictionaryItems, ...translationItems]
    .map(toQueueItem)
    .sort((a, b) => updatedTime(b.updatedAt) - updatedTime(a.updatedAt));
}

export type ReviewSlice = "dictionary" | "translation";

/** Which slice APIs a type filter requires. */
export function slicesForFilter(filter: ReviewTypeFilter): ReviewSlice[] {
  if (filter === "dictionary") return ["dictionary"];
  if (filter === "translation") return ["translation"];
  return ["dictionary", "translation"];
}

/** List URL for one slice: server-side status + `q`, fixed page size. */
export function buildQueueListUrl(
  slice: ReviewSlice,
  tab: ReviewQueueTab,
  query: string
): string {
  const base =
    slice === "dictionary" ? CMS_DICTIONARY_API : CMS_TRANSLATIONS_API;
  const params = new URLSearchParams();
  params.set("status", tab satisfies CmsStatus as string);
  if (query.trim() !== "") params.set("q", query.trim());
  params.set("limit", String(REVIEW_QUEUE_LIMIT));
  return `${base}?${params.toString()}`;
}
