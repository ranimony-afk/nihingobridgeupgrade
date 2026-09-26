/**
 * Canonical payload comparison shared by preflight and the persistence adapter.
 * Identity is the deterministic id. Conflict is any difference in the persisted
 * canonical fields, including sourceRef — not a sourceRef-only check.
 */

export type ConflictPolicy = "abort" | "update";

export function areSensesEqual(
  a: Array<{ glosses: string[]; note?: string | null }>,
  b: Array<{ glosses: string[]; note?: string | null }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sA = a[i];
    const sB = b[i];
    if ((sA.note || null) !== (sB.note || null)) return false;
    if (sA.glosses.length !== sB.glosses.length) return false;
    for (let j = 0; j < sA.glosses.length; j++) {
      if (sA.glosses[j] !== sB.glosses[j]) return false;
    }
  }
  return true;
}

export function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface CanonicalPayload {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  frequencyRank: number | null;
  partsOfSpeech: string[];
  senses: Array<{ glosses: string[]; note?: string | null }>;
  kanjiCharacters: string[];
  tags: string[];
  sourceRef: string;
}

export interface PersistencePlan<T extends CanonicalPayload = CanonicalPayload> {
  inserts: T[];
  identical: T[];
  conflicts: T[];
}

export function payloadsEqual(existing: CanonicalPayload, candidate: CanonicalPayload): boolean {
  return existing.headword === candidate.headword &&
    existing.reading === candidate.reading &&
    existing.romaji === candidate.romaji &&
    existing.jlptLevel === candidate.jlptLevel &&
    existing.isCommon === candidate.isCommon &&
    (existing.frequencyRank ?? null) === (candidate.frequencyRank ?? null) &&
    existing.sourceRef === candidate.sourceRef &&
    areArraysEqual(existing.partsOfSpeech ?? [], candidate.partsOfSpeech ?? []) &&
    areArraysEqual(existing.kanjiCharacters ?? [], candidate.kanjiCharacters ?? []) &&
    areArraysEqual(existing.tags ?? [], candidate.tags ?? []) &&
    areSensesEqual(existing.senses ?? [], candidate.senses ?? []);
}

export function planPersistence<T extends CanonicalPayload>(
  candidates: T[],
  existing: Map<string, CanonicalPayload>,
): PersistencePlan<T> {
  const inserts: T[] = [];
  const identical: T[] = [];
  const conflicts: T[] = [];
  for (const candidate of candidates) {
    const prior = existing.get(candidate.id);
    if (!prior) inserts.push(candidate);
    else if (payloadsEqual(prior, candidate)) identical.push(candidate);
    else conflicts.push(candidate);
  }
  return { inserts, identical, conflicts };
}

export function summarizePlan(plan: PersistencePlan, policy: ConflictPolicy = "abort"): {
  expectedInserts: number;
  expectedSkips: number;
  conflictingIdCount: number;
  expectedUpdates: number;
} {
  return {
    expectedInserts: plan.inserts.length,
    expectedSkips: plan.identical.length,
    conflictingIdCount: plan.conflicts.length,
    expectedUpdates: policy === "update" ? plan.conflicts.length : 0,
  };
}

export function resolveConflictPolicy(value: unknown): ConflictPolicy {
  if (value === undefined) return "abort";
  if (value === "abort" || value === "update") return value;
  throw new Error("Invalid conflictPolicy");
}
