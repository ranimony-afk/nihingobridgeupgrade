/**
 * Phase 14.4F-R — Shared route parameter parsing.
 *
 * Route handlers must never pass caller-supplied numbers straight into a query.
 * These helpers enforce bounds and fail closed to the documented default, so an
 * unbounded `?limit=999999999` cannot be turned into an unbounded scan.
 *
 * Kept deliberately small: only the two shapes 14.4F-R routes actually need.
 */

/** Upper bound for any list-shaped response. Bounded by policy, not by data. */
export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;

export interface BoundedIntOptions {
  fallback: number;
  min?: number;
  max?: number;
}

/**
 * Parses a signed integer from an untrusted query parameter.
 *
 * Returns `fallback` when the value is absent, non-numeric, or out of range.
 * Never returns NaN or Infinity to the caller.
 */
export function parseBoundedInt(
  raw: string | null | undefined,
  options: BoundedIntOptions
): number {
  const min = options.min ?? 0;
  const max = options.max ?? MAX_PAGE_LIMIT;

  if (raw === null || raw === undefined || raw.trim() === "") {
    return options.fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return options.fallback;

  if (parsed < min) return options.fallback;
  if (parsed > max) return max;

  return parsed;
}

/** Parses a paginated `limit`, clamped to [1, MAX_PAGE_LIMIT]. */
export function parseLimit(raw: string | null | undefined, fallback = DEFAULT_PAGE_LIMIT): number {
  return parseBoundedInt(raw, { fallback, min: 1, max: MAX_PAGE_LIMIT });
}

/** Parses a paginated `offset`, clamped to [0, MAX_OFFSET]. */
export const MAX_OFFSET = 100_000;

export function parseOffset(raw: string | null | undefined, fallback = 0): number {
  return parseBoundedInt(raw, { fallback, min: 0, max: MAX_OFFSET });
}

/** Parses a boolean query flag. Only the literal "true"/"false" count. */
export function parseBooleanFlag(raw: string | null | undefined): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

/** Shared error envelope, matching the existing dictionary/kanji route contract. */
export function errorBody(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}
