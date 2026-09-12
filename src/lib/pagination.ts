/**
 * Pagination is owned here — these constants are the single source of truth
 * for every paged endpoint (API_OWNERSHIP §2: pageSize max 100).
 */

import type { PageRequest, Paginated } from "@/types/domain";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE_SIZE = 1;

export interface PaginationInput {
  page?: number | string | null;
  pageSize?: number | string | null;
}

function toPositiveInt(value: number | string | null | undefined, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const truncated = Math.trunc(parsed);
  return truncated < 1 ? fallback : truncated;
}

/**
 * Clamp untrusted paging input into a safe query window.
 * Out-of-range values are corrected, never rejected, so a bad query string
 * degrades gracefully instead of 400-ing a read endpoint.
 */
export function resolvePagination(input: PaginationInput = {}): PageRequest {
  const page = toPositiveInt(input.page, DEFAULT_PAGE);
  const requestedSize = toPositiveInt(input.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(Math.max(requestedSize, MIN_PAGE_SIZE), MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };
}

/** Wrap a result set with its paging metadata. */
export function paginate<T>(items: T[], total: number, request: PageRequest): Paginated<T> {
  const safeTotal = Math.max(0, Math.trunc(total));
  return {
    items,
    total: safeTotal,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: safeTotal === 0 ? 0 : Math.ceil(safeTotal / request.pageSize),
  };
}
