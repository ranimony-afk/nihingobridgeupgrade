/**
 * Deterministic recursive JSON diff — Phase 13.5D-2.
 *
 * Pure, read-only comparison of two immutable version snapshots. No
 * dependency: the snapshots are small editorial JSON objects, so a
 * structural walk is sufficient. Never mutates its inputs.
 */
export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  /** Dot-joined path (`senses[0].glosses[1]`); "" for the root. */
  readonly path: string;
  readonly kind: DiffKind;
  readonly before: unknown;
  readonly after: unknown;
}

/** Depth guard so a hostile payload cannot blow the call stack. */
const MAX_DIFF_DEPTH = 25;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function joinPath(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

function joinIndex(base: string, index: number): string {
  return `${base}[${index}]`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(b, key) &&
          valuesEqual(a[key], b[key])
      )
    );
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]))
    );
  }
  return false;
}

function walk(
  before: unknown,
  after: unknown,
  path: string,
  depth: number,
  out: DiffEntry[]
): void {
  if (valuesEqual(before, after)) {
    out.push({ path, kind: "unchanged", before, after });
    return;
  }
  if (depth >= MAX_DIFF_DEPTH) {
    out.push({ path, kind: "changed", before, after });
    return;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    keys.sort();
    for (const key of keys) {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      const child = joinPath(path, key);
      if (!hasBefore) {
        out.push({ path: child, kind: "added", before: undefined, after: after[key] });
      } else if (!hasAfter) {
        out.push({ path: child, kind: "removed", before: before[key], after: undefined });
      } else {
        walk(before[key], after[key], child, depth + 1, out);
      }
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) {
      const child = joinIndex(path, i);
      if (i >= before.length) {
        out.push({ path: child, kind: "added", before: undefined, after: after[i] });
      } else if (i >= after.length) {
        out.push({ path: child, kind: "removed", before: before[i], after: undefined });
      } else {
        walk(before[i], after[i], child, depth + 1, out);
      }
    }
    return;
  }
  out.push({ path, kind: "changed", before, after });
}

/**
 * Compare two snapshots. Returns every leaf with its classification;
 * callers filter to changed kinds for display. Inputs are never mutated.
 */
export function diffSnapshots(before: unknown, after: unknown): DiffEntry[] {
  const entries: DiffEntry[] = [];
  walk(before, after, "", 0, entries);
  return entries;
}

/** Changed-only subset (added/removed/changed), in deterministic order. */
export function changedEntries(entries: readonly DiffEntry[]): DiffEntry[] {
  return entries.filter((entry) => entry.kind !== "unchanged");
}
