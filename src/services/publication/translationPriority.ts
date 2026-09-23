/**
 * Verified-first translation ordering — Phase 13.5F.
 *
 * Pure ranking over the established `sourceType` / `isVerified` fields.
 * Verified human translations sort before everything else; all other
 * rows keep their relative (database-returned) order via a stable sort,
 * so behavior without verified rows is byte-identical to before.
 */
export interface TranslationPriorityRow {
  readonly sourceType: string;
  readonly isVerified: boolean;
}

export function translationPriorityRank(row: TranslationPriorityRow): number {
  if (row.sourceType === "verified_human" && row.isVerified) return 0;
  if (row.isVerified) return 1;
  if (row.sourceType === "canonical") return 2;
  return 3;
}

/** Stable verified-first copy; the input array is never mutated. */
export function sortTranslationsVerifiedFirst<T extends TranslationPriorityRow>(
  rows: readonly T[]
): T[] {
  return [...rows].sort(
    (a, b) => translationPriorityRank(a) - translationPriorityRank(b)
  );
}
