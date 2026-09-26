/**
 * Phase 14.4F-R — shared, bounded parsing for dictionary/kanji routes.
 */

export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_OFFSET = 100_000;
export const MAX_SEARCH_QUERY_LENGTH = 1_000;
export const MAX_ROUTE_IDENTIFIER_LENGTH = 256;

export interface BoundedIntOptions {
  fallback: number;
  min?: number;
  max?: number;
}

/**
 * Parse a complete decimal integer token. Invalid, fractional, unsafe, blank, or
 * out-of-range-low values use the caller's fallback; high values are clamped.
 * The complete-token check prevents inputs such as `10junk` being read as 10.
 */
export function parseBoundedInt(
  raw: string | null | undefined,
  options: BoundedIntOptions
): number {
  const min = options.min ?? 0;
  const max = options.max ?? MAX_PAGE_LIMIT;
  if (raw === null || raw === undefined || !/^-?\d+$/.test(raw)) {
    return options.fallback;
  }

  try {
    const parsed = BigInt(raw);
    if (parsed < BigInt(min)) return options.fallback;
    if (parsed > BigInt(max)) return max;
    return Number(parsed);
  } catch {
    return options.fallback;
  }
}

/** Parses limit into [1, 200], using 50 for invalid or below-minimum values. */
export function parseLimit(
  raw: string | null | undefined,
  fallback = DEFAULT_PAGE_LIMIT
): number {
  return parseBoundedInt(raw, { fallback, min: 1, max: MAX_PAGE_LIMIT });
}

/** Parses offset into [0, 100000], using 0 for invalid or negative values. */
export function parseOffset(raw: string | null | undefined, fallback = 0): number {
  return parseBoundedInt(raw, { fallback, min: 0, max: MAX_OFFSET });
}

/** Only literal `true` and `false` are recognized. */
export function parseBooleanFlag(raw: string | null | undefined): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

/** A present but unrecognized boolean value is invalid (absence is permitted). */
export function isBooleanFlagInputValid(raw: string | null | undefined): boolean {
  return raw === null || raw === undefined || raw === "true" || raw === "false";
}

/** Code-point length avoids treating a supplementary-plane character as two. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/**
 * The kanji endpoints address one Unicode unified ideograph. This property
 * includes uncommon/compatibility ideographs and supplementary-plane forms.
 */
const UNIFIED_IDEOGRAPH = /^\p{Unified_Ideograph}$/u;
export function isKanjiRouteCharacter(value: unknown): value is string {
  return typeof value === "string" && codePointLength(value) === 1 && UNIFIED_IDEOGRAPH.test(value);
}

/** Validate an already-decoded Next.js route parameter; never decode it twice. */
export function isValidRouteIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    codePointLength(value) <= MAX_ROUTE_IDENTIFIER_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

export function errorBody(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}
