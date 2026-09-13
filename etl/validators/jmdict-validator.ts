/**
 * Validation + in-run deduplication.
 * Invalid records are rejected and sampled, never silently written.
 */

import type { NormalizedEntry } from "../transforms/jmdict-transform";

export type ValidationIssue = {
  sourceId: string;
  reason: string;
};

export function validateEntry(entry: NormalizedEntry): ValidationIssue | null {
  if (!/^\d+$/.test(entry.sourceId)) {
    return { sourceId: entry.sourceId, reason: "ent_seq must be numeric" };
  }
  if (entry.readings.length === 0) {
    return { sourceId: entry.sourceId, reason: "entry has no reading (r_ele)" };
  }
  if (entry.headword.length === 0) {
    return { sourceId: entry.sourceId, reason: "entry has no headword" };
  }
  const usableSenses = entry.senses.filter((s) => s.glosses.length > 0);
  if (usableSenses.length === 0) {
    return { sourceId: entry.sourceId, reason: "entry has no sense with a gloss" };
  }
  return null;
}

export class Deduplicator {
  private readonly seen = new Set<string>();
  private duplicates = 0;

  /** Returns true when the entry is new for this run. */
  accept(sourceId: string): boolean {
    if (this.seen.has(sourceId)) {
      this.duplicates += 1;
      return false;
    }
    this.seen.add(sourceId);
    return true;
  }

  get duplicateCount(): number {
    return this.duplicates;
  }

  get uniqueCount(): number {
    return this.seen.size;
  }
}
