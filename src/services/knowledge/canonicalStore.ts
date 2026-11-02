/**
 * SQL read/write boundary for canonical Kanji provisioning.
 *
 * Design rules enforced here:
 *  - Reads never write. `readCanonicalRows` is used by dry-run, by the
 *    application's state report, and by the pre/post checks of an execute run.
 *  - Writes are insert-only and happen inside ONE transaction guarded by an
 *    advisory lock, with a re-read + re-plan after the lock is taken so a
 *    concurrent run cannot insert a row the plan did not expect.
 *  - The post-write invariants are evaluated inside the same transaction:
 *    a violation rolls the transaction back, so a failed run leaves no partial
 *    provisioning behind.
 *  - Nothing in this module logs a connection string, host, user or password.
 *
 * `Queryable` is satisfied by `pg.Client`, `pg.Pool` and by PGlite, which is
 * what lets the same code path be tested on a disposable in-process database.
 */

import {
  CanonicalDataset,
  CanonicalRows,
  CompositionRecord,
  InvariantViolation,
  KanjiRecord,
  ProvisioningPlan,
  RadicalRecord,
  digestRows,
  planIsNoop,
  planProvisioning,
  subtractDataset,
  validateCanonicalInvariants,
} from "./canonicalDataset";

export interface QueryResultLike<T> {
  rows: T[];
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResultLike<T>>;
}

/** Fixed, documented lock key. Derived from "nihongo:canonical:kanji:v1". */
export const CANONICAL_PROVISIONING_LOCK_KEY = "7416299504429250983";

export class CanonicalProvisioningError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = "CanonicalProvisioningError";
    this.code = code;
    this.details = details;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function vocabulary(value: unknown): KanjiRecord["vocabulary"] {
  if (!Array.isArray(value)) return [];
  const items: KanjiRecord["vocabulary"] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.word === "string" &&
      typeof record.reading === "string" &&
      typeof record.meaning === "string"
    ) {
      items.push({
        word: record.word,
        reading: record.reading,
        meaning: record.meaning,
      });
    }
  }
  return items;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function int(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number.parseInt(value, 10);
  return 0;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return int(value);
}

export const CANONICAL_TABLES = [
  "kanji_radicals",
  "kanji_entries",
  "kanji_composition",
] as const;

export const CANONICAL_REQUIRED_TABLES = [
  "kana_entries",
  ...CANONICAL_TABLES,
] as const;

/**
 * Which canonical tables the connection can actually see.
 *
 * Checks all four: a database where `kanji_entries` exists but `kana_entries`
 * does not would otherwise fail later, inside a transaction, with a message
 * that names no table.
 */
export async function canonicalSchemaStatus(
  db: Queryable
): Promise<{ present: string[]; missing: string[] }> {
  const result = await db.query<{ name: string; present: string | null }>(
    `SELECT name, to_regclass('public.' || name) AS present
       FROM unnest($1::text[]) AS name`,
    [CANONICAL_REQUIRED_TABLES as unknown as string[]]
  );
  const present: string[] = [];
  const missing: string[] = [];
  for (const row of result.rows) {
    if (row.present) present.push(str(row.name));
    else missing.push(str(row.name));
  }
  return { present, missing };
}

/** True only when every canonical table exists. */
export async function canonicalSchemaPresent(db: Queryable): Promise<boolean> {
  const status = await canonicalSchemaStatus(db);
  return status.missing.length === 0;
}

export async function readCanonicalRows(db: Queryable): Promise<CanonicalRows> {
  const radicals = await db.query<Record<string, unknown>>(
    `SELECT id, character, alt_forms, meaning, reading_kun, reading_on,
            stroke_count, kangxi_number, category, typical_role, mnemonic,
            source_ref
       FROM kanji_radicals
      ORDER BY id`
  );
  const kanji = await db.query<Record<string, unknown>>(
    `SELECT id, character, meaning, readings_kun, readings_on, stroke_count,
            jlpt_level, grade_level, primary_radical_id, mnemonic, vocabulary,
            source_ref
       FROM kanji_entries
      ORDER BY id`
  );
  const composition = await db.query<Record<string, unknown>>(
    `SELECT id, kanji_id, element_id, role, position, rendered_as, order_index
       FROM kanji_composition
      ORDER BY id`
  );

  return {
    radicals: radicals.rows.map(
      (row): RadicalRecord => ({
        id: str(row.id),
        character: str(row.character),
        altForms: stringArray(row.alt_forms),
        meaning: str(row.meaning),
        readingKun: nullableStr(row.reading_kun),
        readingOn: nullableStr(row.reading_on),
        strokeCount: int(row.stroke_count),
        kangxiNumber: nullableInt(row.kangxi_number),
        category: str(row.category),
        typicalRole: str(row.typical_role),
        mnemonic: nullableStr(row.mnemonic),
        sourceRef: str(row.source_ref),
      })
    ),
    kanji: kanji.rows.map(
      (row): KanjiRecord => ({
        id: str(row.id),
        character: str(row.character),
        meaning: str(row.meaning),
        readingsKun: stringArray(row.readings_kun),
        readingsOn: stringArray(row.readings_on),
        strokeCount: int(row.stroke_count),
        jlptLevel: str(row.jlpt_level),
        gradeLevel: nullableInt(row.grade_level),
        primaryRadicalId: nullableStr(row.primary_radical_id),
        mnemonic: nullableStr(row.mnemonic),
        vocabulary: vocabulary(row.vocabulary),
        sourceRef: str(row.source_ref),
      })
    ),
    composition: composition.rows.map(
      (row): CompositionRecord => ({
        id: str(row.id),
        kanjiId: str(row.kanji_id),
        elementId: str(row.element_id),
        role: str(row.role),
        position: nullableStr(row.position),
        renderedAs: str(row.rendered_as),
        orderIndex: int(row.order_index),
      })
    ),
  };
}

export async function readKanaCounts(
  db: Queryable
): Promise<{ total: number; provenance: Record<string, number> }> {
  const result = await db.query<{ source_ref: string; n: number | string }>(
    `SELECT source_ref, count(*)::int AS n FROM kana_entries GROUP BY source_ref ORDER BY source_ref`
  );
  const provenance: Record<string, number> = {};
  let total = 0;
  for (const row of result.rows) {
    const count = int(row.n);
    provenance[str(row.source_ref)] = count;
    total += count;
  }
  return { total, provenance };
}

export interface ProvisioningRunResult {
  outcome: "already-complete" | "provisioned";
  plan: ProvisioningPlan;
  inserted: { radicals: number; kanji: number; composition: number };
  countsBefore: { radicals: number; kanji: number; composition: number };
  countsAfter: { radicals: number; kanji: number; composition: number };
  untouchedDigestBefore: string;
  untouchedDigestAfter: string;
}

async function insertRadicals(db: Queryable, rows: RadicalRecord[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO kanji_radicals
         (id, character, alt_forms, meaning, reading_kun, reading_on,
          stroke_count, kangxi_number, category, typical_role, mnemonic, source_ref)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.id,
        row.character,
        JSON.stringify(row.altForms),
        row.meaning,
        row.readingKun,
        row.readingOn,
        row.strokeCount,
        row.kangxiNumber,
        row.category,
        row.typicalRole,
        row.mnemonic,
        row.sourceRef,
      ]
    );
  }
}

async function insertKanji(db: Queryable, rows: KanjiRecord[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO kanji_entries
         (id, character, meaning, readings_kun, readings_on, stroke_count,
          jlpt_level, grade_level, primary_radical_id, mnemonic, vocabulary,
          source_ref)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      [
        row.id,
        row.character,
        row.meaning,
        JSON.stringify(row.readingsKun),
        JSON.stringify(row.readingsOn),
        row.strokeCount,
        row.jlptLevel,
        row.gradeLevel,
        row.primaryRadicalId,
        row.mnemonic,
        JSON.stringify(row.vocabulary),
        row.sourceRef,
      ]
    );
  }
}

async function insertComposition(
  db: Queryable,
  rows: CompositionRecord[]
): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO kanji_composition
         (id, kanji_id, element_id, role, position, rendered_as, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        row.id,
        row.kanjiId,
        row.elementId,
        row.role,
        row.position,
        row.renderedAs,
        row.orderIndex,
      ]
    );
  }
}

function counts(rows: CanonicalRows): {
  radicals: number;
  kanji: number;
  composition: number;
} {
  return {
    radicals: rows.radicals.length,
    kanji: rows.kanji.length,
    composition: rows.composition.length,
  };
}

/**
 * Plan without writing. Executes no DDL and no DML; safe on any connection that
 * may only read.
 */
export async function dryRunProvisioning(
  db: Queryable,
  dataset: CanonicalDataset
): Promise<{ plan: ProvisioningPlan; counts: ReturnType<typeof counts> }> {
  const observed = await readCanonicalRows(db);
  return { plan: planProvisioning(dataset, observed), counts: counts(observed) };
}

/**
 * Insert the missing rows of one dataset inside a single transaction.
 *
 * Throws `CanonicalProvisioningError` — after rolling back — when the plan has
 * blockers, when the state changed between planning and locking, or when a
 * post-write invariant fails.
 */
export async function executeProvisioning(
  db: Queryable,
  dataset: CanonicalDataset,
  options: { expectedKana: number }
): Promise<ProvisioningRunResult> {
  await db.query("BEGIN");
  try {
    // Serialize concurrent operators. The lock is transaction-scoped, so it is
    // released by COMMIT or ROLLBACK.
    await db.query("SELECT pg_advisory_xact_lock($1::bigint)", [
      CANONICAL_PROVISIONING_LOCK_KEY,
    ]);

    const before = await readCanonicalRows(db);
    const plan = planProvisioning(dataset, before);

    // Fail before the first INSERT rather than after: the kana baseline is part
    // of the approved change record, and a mismatch means the operator is
    // looking at a database they were not authorized for.
    const kanaBefore = await readKanaCounts(db);
    if (kanaBefore.total !== options.expectedKana) {
      throw new CanonicalProvisioningError(
        "KANA_BASELINE_MISMATCH",
        `Refusing to provision ${dataset.id}: kana_entries holds ${kanaBefore.total} rows, expected ${options.expectedKana}. No row was written.`,
        [`kana baseline observed ${kanaBefore.total}, approved ${options.expectedKana}`]
      );
    }

    if (plan.blockers.length > 0) {
      throw new CanonicalProvisioningError(
        "PLAN_BLOCKED",
        `Refusing to provision ${dataset.id}: the database does not match the canonical source`,
        plan.blockers
      );
    }

    const untouchedDigestBefore = digestRows(subtractDataset(before, dataset));

    if (planIsNoop(plan)) {
      const verdict = await verifyInsideTransaction(db, {
        dataset,
        expectedKana: options.expectedKana,
        untouchedDigestBefore,
      });
      if (verdict.length > 0) {
        throw new CanonicalProvisioningError(
          "INVARIANTS_FAILED",
          `Dataset ${dataset.id} is present but the canonical foundation is invalid`,
          verdict.map((v) => `${v.code}: ${v.detail}`)
        );
      }
      await db.query("ROLLBACK");
      return {
        outcome: "already-complete",
        plan,
        inserted: { radicals: 0, kanji: 0, composition: 0 },
        countsBefore: counts(before),
        countsAfter: counts(before),
        untouchedDigestBefore,
        untouchedDigestAfter: untouchedDigestBefore,
      };
    }

    await insertRadicals(db, plan.inserts.radicals);
    await insertKanji(db, plan.inserts.kanji);
    await insertComposition(db, plan.inserts.composition);

    const after = await readCanonicalRows(db);
    const untouchedDigestAfter = digestRows(subtractDataset(after, dataset));
    const verdict: InvariantViolation[] = await verifyInsideTransaction(db, {
      dataset,
      expectedKana: options.expectedKana,
      untouchedDigestBefore,
      untouchedDigestAfter,
    });

    if (verdict.length > 0) {
      throw new CanonicalProvisioningError(
        "INVARIANTS_FAILED",
        `Post-write validation failed for ${dataset.id}; rolled back`,
        verdict.map((v) => `${v.code}: ${v.detail}`)
      );
    }

    await db.query("COMMIT");
    return {
      outcome: "provisioned",
      plan,
      inserted: {
        radicals: plan.inserts.radicals.length,
        kanji: plan.inserts.kanji.length,
        composition: plan.inserts.composition.length,
      },
      countsBefore: counts(before),
      countsAfter: counts(after),
      untouchedDigestBefore,
      untouchedDigestAfter,
    };
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      // A failed rollback must not mask the original error; the connection is
      // discarded by the caller either way.
    }
    throw error;
  }
}

async function verifyInsideTransaction(
  db: Queryable,
  input: {
    dataset: CanonicalDataset;
    expectedKana: number;
    untouchedDigestBefore: string;
    untouchedDigestAfter?: string;
  }
): Promise<InvariantViolation[]> {
  const observed = await readCanonicalRows(db);
  const kana = await readKanaCounts(db);
  const untouchedDigestAfter = input.untouchedDigestAfter ??
    digestRows(subtractDataset(observed, input.dataset));
  return validateCanonicalInvariants({
    observed,
    kana,
    expectedKana: input.expectedKana,
    untouchedDigestBefore: input.untouchedDigestBefore,
    untouchedDigestAfter,
  });
}

/**
 * Read-only verification of the whole canonical foundation.
 *
 * Runs in a READ ONLY transaction and always rolls back, so it is safe against
 * any database the operator may inspect — including production — without a
 * write-capable role.
 */
export async function verifyCanonicalFoundation(
  db: Queryable,
  options: { expectedKana: number }
): Promise<{
  status: ReturnType<typeof validateCanonicalInvariants>;
  counts: { radicals: number; kanji: number; composition: number };
  kana: { total: number; provenance: Record<string, number> };
}> {
  await db.query("BEGIN");
  try {
    await db.query("SET TRANSACTION READ ONLY");
    const observed = await readCanonicalRows(db);
    const kana = await readKanaCounts(db);
    const status = validateCanonicalInvariants({
      observed,
      kana,
      expectedKana: options.expectedKana,
    });
    await db.query("ROLLBACK");
    return { status, counts: counts(observed), kana };
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}
