/**
 * Canonical Kanji dataset model, state classification and provisioning plan.
 *
 * WHY THIS EXISTS
 * ---------------
 * The canonical Kanji foundation has two first-party datasets that were
 * historically treated as one:
 *
 *  1. `kanji-mindtree` — authored in `src/data/kanji.ts`, written by
 *     `KnowledgeService.ensureSeeded()` (33 headwords, 55 elements,
 *     71 composition edges).
 *  2. `kanji-corpus-pilot` — the curated pilot corpus in
 *     `src/etl/kanji/fixture.ts`, written by the ETL loader
 *     (12 headwords, 8 elements, 19 composition edges).
 *
 * A database provisioned only by the bootstrap path is therefore *incomplete*
 * against the 45-headword first-party baseline that
 * `scripts/ingest-kanjidic2.ts` requires before it will ingest anything. The
 * old bootstrap guard keyed on `kana_entries` alone, so that incomplete state
 * was indistinguishable from a fully provisioned one and was silently left in
 * place.
 *
 * This module is deliberately pure: no database client, no environment reads,
 * no network. It answers three questions:
 *
 *  - What should a dataset contain? (`buildMindtreeDataset`,
 *    `buildCorpusPilotDataset`)
 *  - What state is a database in? (`assessDataset`, `classifyCanonicalState`)
 *  - What exactly must be inserted to close a gap? (`planProvisioning`)
 *
 * Every write decision is expressed as data so the operator tool can print it
 * before writing anything and the same plan can be replayed inside a
 * transaction.
 */

import { createHash } from "node:crypto";
import {
  COMPOSITION,
  ELEMENTS,
  EXTRA_ELEMENTS,
  KANJI,
  KANJI_SOURCE_REF,
} from "@/data/kanji";
import { PILOT_KANJI_ENTRIES, PILOT_RADICALS } from "@/etl/kanji/fixture";
import { validateAndTransformKanjiData } from "@/etl/kanji/transformer";

export const MINDTREE_SOURCE_REF = KANJI_SOURCE_REF; // "first-party:kanji-mindtree:v1"
export const CORPUS_SOURCE_REF = "first-party:kanji-corpus:v1";

export type CanonicalDatasetId = "kanji-mindtree" | "kanji-corpus-pilot";

export interface KanjiVocabularyItem {
  word: string;
  reading: string;
  meaning: string;
}

export interface RadicalRecord {
  id: string;
  character: string;
  altForms: string[];
  meaning: string;
  readingKun: string | null;
  readingOn: string | null;
  strokeCount: number;
  kangxiNumber: number | null;
  category: string;
  typicalRole: string;
  mnemonic: string | null;
  sourceRef: string;
}

export interface KanjiRecord {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  gradeLevel: number | null;
  primaryRadicalId: string | null;
  mnemonic: string | null;
  vocabulary: KanjiVocabularyItem[];
  sourceRef: string;
}

export interface CompositionRecord {
  id: string;
  kanjiId: string;
  elementId: string;
  role: string;
  position: string | null;
  renderedAs: string;
  orderIndex: number;
}

export interface CanonicalRows {
  radicals: RadicalRecord[];
  kanji: KanjiRecord[];
  composition: CompositionRecord[];
}

export interface CanonicalDataset {
  id: CanonicalDatasetId;
  label: string;
  sourceRef: string;
  /** Rows this dataset owns and must insert when absent. */
  rows: CanonicalRows;
  /**
   * Foreign rows this dataset depends on but does not own. A dependency that is
   * absent *and* not part of the plan is a hard blocker: inserting the dependant
   * rows would create dangling references.
   */
  dependencies: {
    elementIds: string[];
    kanjiIds: string[];
  };
}

/* ------------------------------------------------------------------ */
/* Dataset construction (authoritative, from repository source data)  */
/* ------------------------------------------------------------------ */

export function compositionId(
  kanjiId: string,
  elementId: string,
  orderIndex: number
): string {
  return `comp-${kanjiId}-${elementId}-${orderIndex}`;
}

function emptyVocabulary(): KanjiVocabularyItem[] {
  return [];
}

/** The dataset written by `KnowledgeService.ensureSeeded()` today. */
export function buildMindtreeDataset(): CanonicalDataset {
  const elements = [...ELEMENTS, ...EXTRA_ELEMENTS];
  const radicals: RadicalRecord[] = elements.map((e) => ({
    id: e.id,
    character: e.character,
    altForms: [...e.altForms],
    meaning: e.meaning,
    readingKun: e.readingKun,
    readingOn: e.readingOn || null,
    strokeCount: e.strokeCount,
    kangxiNumber: e.kangxiNumber,
    category: e.category,
    typicalRole: e.typicalRole,
    mnemonic: e.mnemonic,
    sourceRef: MINDTREE_SOURCE_REF,
  }));

  const kanji: KanjiRecord[] = KANJI.map((k) => ({
    id: k.id,
    character: k.character,
    meaning: k.meaning,
    readingsKun: [...k.readingsKun],
    readingsOn: [...k.readingsOn],
    strokeCount: k.strokeCount,
    jlptLevel: k.jlptLevel,
    gradeLevel: k.gradeLevel,
    primaryRadicalId: k.primaryRadicalId,
    mnemonic: k.mnemonic,
    vocabulary: (k.vocabulary ?? []).map((v) => ({ ...v })),
    sourceRef: MINDTREE_SOURCE_REF,
  }));

  const composition: CompositionRecord[] = COMPOSITION.map((c) => ({
    id: compositionId(c.kanjiId, c.elementId, c.orderIndex),
    kanjiId: c.kanjiId,
    elementId: c.elementId,
    role: c.role,
    position: c.position ?? null,
    renderedAs: c.renderedAs,
    orderIndex: c.orderIndex,
  }));

  return {
    id: "kanji-mindtree",
    label: "First-party Mind Tree (src/data/kanji.ts)",
    sourceRef: MINDTREE_SOURCE_REF,
    rows: { radicals, kanji, composition },
    dependencies: { elementIds: [], kanjiIds: [] },
  };
}

/**
 * The curated pilot corpus. Rows are produced through the same transformer the
 * ETL pipeline uses, so the provisioner cannot drift from
 * `runKanjiETLPipeline()` output.
 */
export function buildCorpusPilotDataset(): CanonicalDataset {
  const transformed = validateAndTransformKanjiData(
    PILOT_KANJI_ENTRIES,
    PILOT_RADICALS
  );

  const radicals: RadicalRecord[] = transformed.radicals.map((r) => ({
    id: r.id,
    character: r.character,
    altForms: [...(r.altForms ?? [])],
    meaning: r.meaning,
    readingKun: r.readingKun,
    readingOn: r.readingOn ?? null,
    strokeCount: Math.max(1, r.strokeCount),
    kangxiNumber: r.kangxiNumber ?? null,
    category: r.category,
    typicalRole: r.typicalRole,
    mnemonic: r.mnemonic ?? null,
    sourceRef: r.sourceRef ?? CORPUS_SOURCE_REF,
  }));

  const kanji: KanjiRecord[] = transformed.kanji.map((k) => ({
    id: k.id,
    character: k.character,
    meaning: k.meaning,
    readingsKun: [...k.readingsKun],
    readingsOn: [...k.readingsOn],
    strokeCount: k.strokeCount,
    jlptLevel: k.jlptLevel,
    gradeLevel: k.gradeLevel ?? null,
    primaryRadicalId: k.primaryRadicalId ?? null,
    mnemonic: k.mnemonic ?? null,
    vocabulary: (k.vocabulary ?? emptyVocabulary()).map((v) => ({ ...v })),
    sourceRef: k.sourceRef ?? CORPUS_SOURCE_REF,
  }));

  const composition: CompositionRecord[] = transformed.compositions.map((c) => ({
    id: compositionId(c.kanjiId, c.elementId, c.orderIndex),
    kanjiId: c.kanjiId,
    elementId: c.elementId,
    role: c.role,
    position: c.position ?? null,
    renderedAs: c.renderedAs || c.rendering || "",
    orderIndex: c.orderIndex,
  }));

  return {
    id: "kanji-corpus-pilot",
    label: "First-party curated corpus (src/etl/kanji/fixture.ts)",
    sourceRef: CORPUS_SOURCE_REF,
    rows: { radicals, kanji, composition },
    dependencies: { elementIds: [], kanjiIds: [] },
  };
}

export function buildCanonicalDatasets(): CanonicalDataset[] {
  return [buildMindtreeDataset(), buildCorpusPilotDataset()];
}

/** Expected row counts for a fully provisioned first-party Kanji foundation. */
export function expectedCanonicalTotals(): {
  radicals: number;
  kanji: number;
  composition: number;
  provenance: Record<string, number>;
} {
  const datasets = buildCanonicalDatasets();
  const provenance: Record<string, number> = {};
  let radicals = 0;
  let kanji = 0;
  let composition = 0;
  for (const dataset of datasets) {
    radicals += dataset.rows.radicals.length;
    kanji += dataset.rows.kanji.length;
    composition += dataset.rows.composition.length;
    provenance[dataset.sourceRef] = dataset.rows.kanji.length;
  }
  return { radicals, kanji, composition, provenance };
}

/* ------------------------------------------------------------------ */
/* Content comparison                                                  */
/* ------------------------------------------------------------------ */

function sortedCopy(values: string[]): string[] {
  return [...values].sort();
}

function vocabularyKey(items: KanjiVocabularyItem[]): string {
  return JSON.stringify(
    items.map((v) => [v.word, v.reading, v.meaning])
  );
}

export function radicalFingerprint(row: RadicalRecord): string {
  return JSON.stringify([
    row.id,
    row.character,
    sortedCopy(row.altForms),
    row.meaning,
    row.readingKun,
    row.readingOn,
    row.strokeCount,
    row.kangxiNumber,
    row.category,
    row.typicalRole,
    row.mnemonic,
    row.sourceRef,
  ]);
}

export function kanjiFingerprint(row: KanjiRecord): string {
  return JSON.stringify([
    row.id,
    row.character,
    row.meaning,
    sortedCopy(row.readingsKun),
    sortedCopy(row.readingsOn),
    row.strokeCount,
    row.jlptLevel,
    row.gradeLevel,
    row.primaryRadicalId,
    row.mnemonic,
    vocabularyKey(row.vocabulary),
    row.sourceRef,
  ]);
}

export function compositionFingerprint(row: CompositionRecord): string {
  return JSON.stringify([
    row.id,
    row.kanjiId,
    row.elementId,
    row.role,
    row.position,
    row.renderedAs,
    row.orderIndex,
  ]);
}

/* ------------------------------------------------------------------ */
/* Assessment                                                          */
/* ------------------------------------------------------------------ */

export type DatasetStatus = "COMPLETE" | "EMPTY" | "PARTIAL" | "CONFLICTING";

export interface RowConflict {
  table: "kanji_radicals" | "kanji_entries" | "kanji_composition";
  expectedId: string;
  reason: string;
  /** Existing row id whose content or unique character collides. */
  conflictingId: string;
}

export interface MissingRows {
  radicals: string[];
  kanji: string[];
  composition: string[];
}

export interface DatasetAssessment {
  id: CanonicalDatasetId;
  label: string;
  status: DatasetStatus;
  expected: { radicals: number; kanji: number; composition: number };
  present: { radicals: number; kanji: number; composition: number };
  missing: MissingRows;
  conflicts: RowConflict[];
  /** Expected ids that exist but whose content differs from the canonical source. */
  drifted: MissingRows;
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function characterOwner(
  rows: Array<{ id: string; character: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.character, row.id);
  return map;
}

export function assessDataset(
  dataset: CanonicalDataset,
  observed: CanonicalRows
): DatasetAssessment {
  const obsRadicals = indexById(observed.radicals);
  const obsKanji = indexById(observed.kanji);
  const obsComposition = indexById(observed.composition);
  const obsKanjiChars = characterOwner(observed.kanji);
  const obsRadicalChars = characterOwner(observed.radicals);

  const missing: MissingRows = { radicals: [], kanji: [], composition: [] };
  const drifted: MissingRows = { radicals: [], kanji: [], composition: [] };
  const conflicts: RowConflict[] = [];

  for (const row of dataset.rows.radicals) {
    const existing = obsRadicals.get(row.id);
    if (!existing) {
      missing.radicals.push(row.id);
      const owner = obsRadicalChars.get(row.character);
      if (owner && owner !== row.id) {
        conflicts.push({
          table: "kanji_radicals",
          expectedId: row.id,
          conflictingId: owner,
          reason: `element character ${row.character} already exists under id ${owner}`,
        });
      }
      continue;
    }
    if (radicalFingerprint(existing) !== radicalFingerprint(row)) {
      drifted.radicals.push(row.id);
    }
  }

  for (const row of dataset.rows.kanji) {
    const existing = obsKanji.get(row.id);
    if (!existing) {
      missing.kanji.push(row.id);
      const owner = obsKanjiChars.get(row.character);
      if (owner && owner !== row.id) {
        conflicts.push({
          table: "kanji_entries",
          expectedId: row.id,
          conflictingId: owner,
          reason: `kanji character ${row.character} already exists under id ${owner}`,
        });
      }
      continue;
    }
    if (kanjiFingerprint(existing) !== kanjiFingerprint(row)) {
      drifted.kanji.push(row.id);
    }
  }

  for (const row of dataset.rows.composition) {
    const existing = obsComposition.get(row.id);
    if (!existing) {
      missing.composition.push(row.id);
      continue;
    }
    if (compositionFingerprint(existing) !== compositionFingerprint(row)) {
      drifted.composition.push(row.id);
    }
  }

  const expectedTotal =
    dataset.rows.radicals.length +
    dataset.rows.kanji.length +
    dataset.rows.composition.length;
  const missingTotal =
    missing.radicals.length + missing.kanji.length + missing.composition.length;

  let status: DatasetStatus;
  if (missingTotal === expectedTotal && drifted.radicals.length === 0 &&
      drifted.kanji.length === 0 && drifted.composition.length === 0 &&
      conflicts.length === 0) {
    status = "EMPTY";
  } else if (missingTotal === 0 && drifted.radicals.length === 0 &&
      drifted.kanji.length === 0 && drifted.composition.length === 0 &&
      conflicts.length === 0) {
    status = "COMPLETE";
  } else if (drifted.radicals.length > 0 || drifted.kanji.length > 0 ||
      drifted.composition.length > 0 || conflicts.length > 0) {
    // A mismatch is never repaired automatically and never overwritten.
    status = "CONFLICTING";
  } else {
    status = "PARTIAL";
  }

  return {
    id: dataset.id,
    label: dataset.label,
    status,
    expected: {
      radicals: dataset.rows.radicals.length,
      kanji: dataset.rows.kanji.length,
      composition: dataset.rows.composition.length,
    },
    present: {
      radicals: dataset.rows.radicals.length - missing.radicals.length,
      kanji: dataset.rows.kanji.length - missing.kanji.length,
      composition: dataset.rows.composition.length - missing.composition.length,
    },
    missing,
    conflicts,
    drifted,
  };
}

/* ------------------------------------------------------------------ */
/* Whole-foundation classification                                     */
/* ------------------------------------------------------------------ */

export type CanonicalStateStatus =
  | "FULLY_PROVISIONED"
  | "EMPTY"
  | "PARTIALLY_PROVISIONED"
  | "INCONSISTENT"
  | "UNKNOWN";

export interface CanonicalStateReport {
  status: CanonicalStateStatus;
  /** Empty when the state cannot be determined (for example a failed read). */
  assessments: DatasetAssessment[];
  kana: { total: number; provenance: Record<string, number> } | null;
  issues: string[];
  /** Human-readable, secret-free remediation for a non-provisioned state. */
  remediation: string | null;
}

export const PROVISIONING_REMEDIATION =
  "Canonical Kanji data is provisioned only by an authorized operator procedure " +
  "(scripts/provision-kanji-corpus.ts, dry-run first). The application never " +
  "repairs canonical data from a request path.";

/**
 * Classify the whole first-party Kanji foundation.
 *
 * `kana` and `observed` must be `null` when the corresponding read failed:
 * "unable to determine" is a distinct state from "empty" and must never be
 * reported as a clean database.
 */
export function classifyCanonicalState(input: {
  kana: { total: number; provenance: Record<string, number> } | null;
  observed: CanonicalRows | null;
  expectedKana: number;
}): CanonicalStateReport {
  if (input.kana === null || input.observed === null) {
    return {
      status: "UNKNOWN",
      assessments: [],
      kana: input.kana,
      issues: ["Canonical state could not be read; the database may be unreachable."],
      remediation: null,
    };
  }

  const datasets = buildCanonicalDatasets();
  const assessments = datasets.map((dataset) =>
    assessDataset(dataset, input.observed as CanonicalRows)
  );

  const issues: string[] = [];
  const observedTotal =
    input.observed.radicals.length +
    input.observed.kanji.length +
    input.observed.composition.length;

  if (input.kana.total !== input.expectedKana) {
    issues.push(
      `kana_entries has ${input.kana.total} rows, expected ${input.expectedKana}`
    );
  }
  for (const assessment of assessments) {
    if (assessment.status === "CONFLICTING") {
      issues.push(
        `${assessment.id}: ${assessment.conflicts.length} conflict(s), ` +
          `${assessment.drifted.radicals.length + assessment.drifted.kanji.length + assessment.drifted.composition.length} drifted row(s)`
      );
    } else if (assessment.status === "PARTIAL") {
      issues.push(
        `${assessment.id}: ${assessment.missing.kanji.length} kanji, ` +
          `${assessment.missing.radicals.length} element(s) and ` +
          `${assessment.missing.composition.length} composition edge(s) missing`
      );
    } else if (assessment.status === "EMPTY" && observedTotal > 0) {
      issues.push(
        `${assessment.id}: dataset absent — ${assessment.missing.kanji.length} kanji, ` +
          `${assessment.missing.radicals.length} element(s) and ` +
          `${assessment.missing.composition.length} composition edge(s) missing`
      );
    }
  }

  const anyConflicting = assessments.some((a) => a.status === "CONFLICTING");

  let status: CanonicalStateStatus;
  if (observedTotal === 0 && input.kana.total === 0) {
    status = "EMPTY";
  } else if (anyConflicting || input.kana.total > input.expectedKana) {
    status = "INCONSISTENT";
  } else if (assessments.every((a) => a.status === "COMPLETE") &&
      input.kana.total === input.expectedKana) {
    status = "FULLY_PROVISIONED";
  } else {
    status = "PARTIALLY_PROVISIONED";
  }

  return {
    status,
    assessments,
    kana: input.kana,
    issues,
    remediation: status === "FULLY_PROVISIONED" ? null : PROVISIONING_REMEDIATION,
  };
}

/* ------------------------------------------------------------------ */
/* Provisioning plan                                                   */
/* ------------------------------------------------------------------ */

export interface ProvisioningPlan {
  datasetId: CanonicalDatasetId;
  /** Rows to insert, in dependency order. */
  inserts: CanonicalRows;
  alreadyPresent: { radicals: number; kanji: number; composition: number };
  /** Differences are reported, never overwritten. */
  drifted: MissingRows;
  conflicts: RowConflict[];
  blockers: string[];
  expected: { radicals: number; kanji: number; composition: number };
  expectedAfter: {
    radicals: number;
    kanji: number;
    composition: number;
  };
}

/**
 * Build an insert-only plan for one dataset.
 *
 * The plan is derived from the *observed* database rows, so re-running a
 * completed plan yields zero inserts (idempotent). Any content difference or
 * unique-character collision is a blocker, not a silent update.
 */
export function planProvisioning(
  dataset: CanonicalDataset,
  observed: CanonicalRows
): ProvisioningPlan {
  const assessment = assessDataset(dataset, observed);
  const radicalIds = new Set(assessment.missing.radicals);
  const kanjiIds = new Set(assessment.missing.kanji);
  const compositionIds = new Set(assessment.missing.composition);

  const blockers: string[] = [];
  for (const conflict of assessment.conflicts) {
    blockers.push(
      `${conflict.table}: ${conflict.reason} (expected id ${conflict.expectedId}, found ${conflict.conflictingId})`
    );
  }
  for (const id of assessment.drifted.radicals) {
    blockers.push(`kanji_radicals ${id} exists with different content than the canonical source`);
  }
  for (const id of assessment.drifted.kanji) {
    blockers.push(`kanji_entries ${id} exists with different content than the canonical source`);
  }
  for (const id of assessment.drifted.composition) {
    blockers.push(`kanji_composition ${id} exists with different content than the canonical source`);
  }

  // Referential preconditions: every element/kanji referenced by the inserted
  // rows must exist afterwards, either already in the database or in the plan.
  const existingElementIds = new Set(observed.radicals.map((r) => r.id));
  const existingKanjiIds = new Set(observed.kanji.map((k) => k.id));
  const plannedElementIds = new Set(dataset.rows.radicals.map((r) => r.id));
  const plannedKanjiIds = new Set(dataset.rows.kanji.map((k) => k.id));

  const requiredElements = new Set<string>();
  for (const row of dataset.rows.kanji) {
    if (row.primaryRadicalId) requiredElements.add(row.primaryRadicalId);
  }
  for (const row of dataset.rows.composition) requiredElements.add(row.elementId);

  for (const elementId of requiredElements) {
    if (!existingElementIds.has(elementId) && !plannedElementIds.has(elementId)) {
      blockers.push(
        `referential integrity: element ${elementId} is referenced by the dataset but is neither provisioned nor planned`
      );
    }
  }
  for (const row of dataset.rows.composition) {
    if (!existingKanjiIds.has(row.kanjiId) && !plannedKanjiIds.has(row.kanjiId)) {
      blockers.push(
        `referential integrity: composition edge ${row.id} references unknown kanji ${row.kanjiId}`
      );
    }
  }

  return {
    datasetId: dataset.id,
    inserts: {
      radicals: dataset.rows.radicals.filter((r) => radicalIds.has(r.id)),
      kanji: dataset.rows.kanji.filter((k) => kanjiIds.has(k.id)),
      composition: dataset.rows.composition.filter((c) => compositionIds.has(c.id)),
    },
    alreadyPresent: {
      radicals: dataset.rows.radicals.length - assessment.missing.radicals.length,
      kanji: dataset.rows.kanji.length - assessment.missing.kanji.length,
      composition: dataset.rows.composition.length - assessment.missing.composition.length,
    },
    drifted: assessment.drifted,
    conflicts: assessment.conflicts,
    blockers,
    expected: assessment.expected,
    expectedAfter: {
      radicals: observed.radicals.length + assessment.missing.radicals.length,
      kanji: observed.kanji.length + assessment.missing.kanji.length,
      composition: observed.composition.length + assessment.missing.composition.length,
    },
  };
}

export function planIsNoop(plan: ProvisioningPlan): boolean {
  return (
    plan.inserts.radicals.length === 0 &&
    plan.inserts.kanji.length === 0 &&
    plan.inserts.composition.length === 0
  );
}

/* ------------------------------------------------------------------ */
/* Post-write invariants                                               */
/* ------------------------------------------------------------------ */

export interface InvariantViolation {
  code:
    | "DUPLICATE_IDENTIFIER"
    | "DUPLICATE_CHARACTER"
    | "DANGLING_COMPOSITION_EDGE"
    | "DANGLING_PRIMARY_RADICAL"
    | "MISSING_SOURCE_REF"
    | "UNEXPECTED_PROVENANCE"
    | "DATASET_INCOMPLETE"
    | "UNEXPECTED_MUTATION";
  detail: string;
}

/**
 * Validate the canonical foundation after a write.
 *
 * `untouchedDigestBefore/After` covers every row that existed before the run
 * and was not part of the plan: they must be byte-identical afterwards.
 */
export function validateCanonicalInvariants(input: {
  observed: CanonicalRows;
  kana: { total: number; provenance: Record<string, number> } | null;
  expectedKana: number;
  untouchedDigestBefore?: string;
  untouchedDigestAfter?: string;
}): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const kanjiIds = new Set(input.observed.kanji.map((k) => k.id));
  const elementIds = new Set(input.observed.radicals.map((r) => r.id));

  const seenKanjiIds = new Set<string>();
  const seenKanjiChars = new Set<string>();
  for (const row of input.observed.kanji) {
    if (seenKanjiIds.has(row.id)) {
      violations.push({ code: "DUPLICATE_IDENTIFIER", detail: `kanji_entries id ${row.id} appears twice` });
    }
    seenKanjiIds.add(row.id);
    if (seenKanjiChars.has(row.character)) {
      violations.push({ code: "DUPLICATE_CHARACTER", detail: `kanji character ${row.character} appears twice` });
    }
    seenKanjiChars.add(row.character);
    if (!row.sourceRef) {
      violations.push({ code: "MISSING_SOURCE_REF", detail: `kanji_entries ${row.id} has no provenance` });
    } else if (!row.sourceRef.startsWith("first-party:") && !row.sourceRef.startsWith("upstream:")) {
      violations.push({
        code: "UNEXPECTED_PROVENANCE",
        detail: `kanji_entries ${row.id} carries unrecognized provenance ${row.sourceRef}`,
      });
    }
    if (row.primaryRadicalId && !elementIds.has(row.primaryRadicalId)) {
      violations.push({
        code: "DANGLING_PRIMARY_RADICAL",
        detail: `kanji_entries ${row.id} references missing element ${row.primaryRadicalId}`,
      });
    }
  }

  const seenElementIds = new Set<string>();
  for (const row of input.observed.radicals) {
    if (seenElementIds.has(row.id)) {
      violations.push({ code: "DUPLICATE_IDENTIFIER", detail: `kanji_radicals id ${row.id} appears twice` });
    }
    seenElementIds.add(row.id);
    if (!row.sourceRef) {
      violations.push({ code: "MISSING_SOURCE_REF", detail: `kanji_radicals ${row.id} has no provenance` });
    }
  }

  for (const edge of input.observed.composition) {
    if (!kanjiIds.has(edge.kanjiId)) {
      violations.push({
        code: "DANGLING_COMPOSITION_EDGE",
        detail: `kanji_composition ${edge.id} references missing kanji ${edge.kanjiId}`,
      });
    }
    if (!elementIds.has(edge.elementId)) {
      violations.push({
        code: "DANGLING_COMPOSITION_EDGE",
        detail: `kanji_composition ${edge.id} references missing element ${edge.elementId}`,
      });
    }
  }

  for (const dataset of buildCanonicalDatasets()) {
    const assessment = assessDataset(dataset, input.observed);
    if (assessment.status !== "COMPLETE") {
      violations.push({
        code: "DATASET_INCOMPLETE",
        detail: `${dataset.id} is ${assessment.status}: ` +
          `${assessment.missing.kanji.length} kanji / ` +
          `${assessment.missing.radicals.length} element(s) / ` +
          `${assessment.missing.composition.length} edge(s) missing`,
      });
    }
  }

  if (input.kana === null) {
    violations.push({ code: "DATASET_INCOMPLETE", detail: "kana_entries could not be read" });
  } else if (input.kana.total !== input.expectedKana) {
    violations.push({
      code: "DATASET_INCOMPLETE",
      detail: `kana_entries has ${input.kana.total} rows, expected ${input.expectedKana}`,
    });
  }

  if (
    input.untouchedDigestBefore !== undefined &&
    input.untouchedDigestAfter !== undefined &&
    input.untouchedDigestBefore !== input.untouchedDigestAfter
  ) {
    violations.push({
      code: "UNEXPECTED_MUTATION",
      detail: "pre-existing canonical rows changed during provisioning",
    });
  }

  return violations;
}

/** Stable digest over a set of rows, used to prove untouched rows did not move. */
export function digestRows(rows: CanonicalRows): string {
  const parts = [
    ...rows.radicals.map((r) => `r:${radicalFingerprint(r)}`),
    ...rows.kanji.map((k) => `k:${kanjiFingerprint(k)}`),
    ...rows.composition.map((c) => `c:${compositionFingerprint(c)}`),
  ].sort();
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** Rows that exist in `observed` but are not part of `dataset` (untouched rows). */
export function subtractDataset(
  observed: CanonicalRows,
  dataset: CanonicalDataset
): CanonicalRows {
  const radicalIds = new Set(dataset.rows.radicals.map((r) => r.id));
  const kanjiIds = new Set(dataset.rows.kanji.map((k) => k.id));
  const compositionIds = new Set(dataset.rows.composition.map((c) => c.id));
  return {
    radicals: observed.radicals.filter((r) => !radicalIds.has(r.id)),
    kanji: observed.kanji.filter((k) => !kanjiIds.has(k.id)),
    composition: observed.composition.filter((c) => !compositionIds.has(c.id)),
  };
}
