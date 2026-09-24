/**
 * §19 — Data-quality checks.
 *
 * Pure, dependency-free validation primitives. These operate on in-memory values,
 * never on the database, so they are unit-testable in any environment and can be
 * reused by ETL stages, ingestion gates, and reporting jobs alike.
 *
 * ## Contract
 *
 * - Checks **classify**; they never repair. Silent correction is prohibited —
 *   a check reports `ERROR` / `WARNING` / `INFO` and the caller decides.
 * - Checks never throw on malformed input. Bad input *is* the finding.
 * - Every finding carries a stable machine-readable `code`, so reports can be
 *   diffed across runs and tests can assert on codes rather than prose.
 */

export type Severity = "ERROR" | "WARNING" | "INFO";

export interface QualityFinding {
  code: string;
  severity: Severity;
  /** What was checked, e.g. `"dictionary_entries"`. */
  subject: string;
  /** Identity of the offending item, when one exists. */
  ref?: string;
  /** Human-readable detail. Never a substitute for `code`. */
  detail: string;
}

export interface QualityReport {
  findings: QualityFinding[];
  counts: Record<Severity, number>;
}

/** Aggregates findings into a deterministic report, sorted for stable diffing. */
export function buildReport(findings: QualityFinding[]): QualityReport {
  const sorted = [...findings].sort(compareFindings);
  const counts: Record<Severity, number> = { ERROR: 0, WARNING: 0, INFO: 0 };
  for (const finding of sorted) counts[finding.severity]++;
  return { findings: sorted, counts };
}

/**
 * Deterministic finding order: severity, then code, then ref.
 *
 * Severity is ordered ERROR → WARNING → INFO so the most serious findings sort
 * first, which is also the order a human should read them in.
 */
export function compareFindings(a: QualityFinding, b: QualityFinding): number {
  const rank: Record<Severity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const ar = a.ref ?? "";
  const br = b.ref ?? "";
  if (ar !== br) return ar < br ? -1 : 1;
  return 0;
}

/* ------------------------------------------------------------------ *
 * Identifier integrity
 * ------------------------------------------------------------------ */

/**
 * Detects duplicate identifiers.
 *
 * Duplicates are `ERROR`: two canonical records sharing an id means one silently
 * shadows the other.
 */
export function checkDuplicateIds(
  subject: string,
  ids: Iterable<string | null | undefined>
): QualityFinding[] {
  const seen = new Map<string, number>();
  for (const id of ids) {
    if (id === null || id === undefined || id === "") continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }

  const findings: QualityFinding[] = [];
  for (const [id, count] of seen) {
    if (count > 1) {
      findings.push({
        code: "DUPLICATE_ID",
        severity: "ERROR",
        subject,
        ref: id,
        detail: `Identifier appears ${count} times`,
      });
    }
  }
  return findings;
}

/** Detects duplicate records by canonical content key. */
export function checkDuplicateContent(
  subject: string,
  records: Iterable<{ id: string; key: string }>
): QualityFinding[] {
  const byKey = new Map<string, string[]>();
  for (const record of records) {
    if (!record.key) continue;
    const list = byKey.get(record.key);
    if (list) list.push(record.id);
    else byKey.set(record.key, [record.id]);
  }

  const findings: QualityFinding[] = [];
  for (const [key, ids] of byKey) {
    if (ids.length > 1) {
      findings.push({
        code: "DUPLICATE_CONTENT",
        severity: "WARNING",
        subject,
        ref: key,
        detail: `${ids.length} records share content key (ids: ${[...ids].sort().join(", ")})`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Referential integrity
 * ------------------------------------------------------------------ */

/**
 * Detects references that point at nothing.
 *
 * `ERROR`, because an orphan edge is a broken graph invariant, not a style issue.
 */
export function checkOrphanReferences(
  subject: string,
  references: Iterable<{ from: string; to: string }>,
  existingIds: Set<string>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const reference of references) {
    if (!existingIds.has(reference.to)) {
      findings.push({
        code: "ORPHAN_REFERENCE",
        severity: "ERROR",
        subject,
        ref: reference.from,
        detail: `References missing target "${reference.to}"`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Field completeness
 * ------------------------------------------------------------------ */

export function checkRequiredFields(
  subject: string,
  records: Iterable<{ id: string; fields: Record<string, unknown> }>,
  required: readonly string[]
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    for (const field of required) {
      const value = record.fields[field];
      if (value === null || value === undefined || value === "") {
        findings.push({
          code: "MISSING_REQUIRED_FIELD",
          severity: "ERROR",
          subject,
          ref: record.id,
          detail: `Required field "${field}" is absent or empty`,
        });
      }
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

/**
 * Placeholder strings that must never stand in for real provenance.
 *
 * These are the values most often written when provenance is genuinely unknown.
 * Each is indistinguishable from a real source id at read time, which is exactly
 * why they are rejected structurally rather than by convention.
 */
export const PROVENANCE_PLACEHOLDERS = [
  "latest",
  "unknown",
  "manual",
  "ai",
  "n/a",
  "none",
  "tbd",
  "todo",
] as const;

/**
 * Validates a `sourceRef`.
 *
 * An absent or placeholder value is `ERROR`; the correct representation of
 * unknown provenance is an explicit `requiresReview` flag, not a placeholder.
 */
export function checkProvenanceRef(
  subject: string,
  records: Iterable<{ id: string; sourceRef: string | null | undefined }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const ref = (record.sourceRef ?? "").trim();
    if (!ref) {
      findings.push({
        code: "MISSING_PROVENANCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: "sourceRef is absent",
      });
      continue;
    }
    if ((PROVENANCE_PLACEHOLDERS as readonly string[]).includes(ref.toLowerCase())) {
      findings.push({
        code: "PLACEHOLDER_PROVENANCE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `sourceRef is the placeholder "${ref}"; use requiresReview instead`,
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Text integrity
 * ------------------------------------------------------------------ */

/** Matches C0/C1 control characters, excluding tab and newline. */
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Detects lone surrogates — a sign of a broken UTF-16 truncation. */
export function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Detects text-integrity defects.
 *
 * Control characters are `WARNING` (they may be legitimate in some sources but
 * are never expected in Japanese prose); lone surrogates are `ERROR` because the
 * string is already corrupt and cannot be reliably sliced.
 */
export function checkTextIntegrity(
  subject: string,
  records: Iterable<{ id: string; text: string | null | undefined }>
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const record of records) {
    const text = record.text;
    if (text === null || text === undefined) continue;

    if (text.length === 0) {
      findings.push({
        code: "EMPTY_TEXT",
        severity: "WARNING",
        subject,
        ref: record.id,
        detail: "Text is present but empty",
      });
      continue;
    }

    if (hasLoneSurrogate(text)) {
      findings.push({
        code: "LONE_SURROGATE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: "Text contains an unpaired surrogate; the string is corrupt",
      });
    }

    if (CONTROL_CHAR_REGEX.test(text)) {
      findings.push({
        code: "CONTROL_CHARACTER",
        severity: "WARNING",
        subject,
        ref: record.id,
        detail: "Text contains control characters",
      });
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Controlled vocabularies
 * ------------------------------------------------------------------ */

export function checkControlledVocabulary(
  subject: string,
  records: Iterable<{ id: string; value: string | null | undefined; field: string }>,
  allowed: readonly string[]
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const permitted = new Set(allowed);
  for (const record of records) {
    const value = record.value;
    if (value === null || value === undefined || value === "") continue;
    if (!permitted.has(value)) {
      findings.push({
        code: "INVALID_CONTROLLED_VALUE",
        severity: "ERROR",
        subject,
        ref: record.id,
        detail: `Field "${record.field}" has value "${value}", not in the controlled set`,
      });
    }
  }
  return findings;
}

/**
 * Cross-record consistency for translations.
 *
 * Reports records sharing the same target but differing in text — a genuine
 * conflict requiring human resolution, never an automatic pick.
 */
export function checkTranslationConflicts(
  subject: string,
  records: Iterable<{ id: string; entityType: string; entityId: string; language: string; text: string }>
): QualityFinding[] {
  const groups = new Map<string, Array<{ id: string; text: string }>>();
  for (const record of records) {
    const key = `${record.entityType}:${record.entityId}:${record.language}`;
    const list = groups.get(key);
    if (list) list.push({ id: record.id, text: record.text });
    else groups.set(key, [{ id: record.id, text: record.text }]);
  }

  const findings: QualityFinding[] = [];
  for (const [key, entries] of groups) {
    const distinct = new Set(entries.map((e) => e.text));
    if (distinct.size > 1) {
      findings.push({
        code: "TRANSLATION_CONFLICT",
        severity: "WARNING",
        subject,
        ref: key,
        detail: `${entries.length} translations disagree (${distinct.size} distinct values)`,
      });
    }
  }
  return findings;
}
