/**
 * Identifier generation.
 *
 * DATABASE_OWNERSHIP §3 freezes primary keys as application-generated `text`:
 *   - imported rows use a DETERMINISTIC id derived from (source, sourceId)
 *     so re-running an ETL pipeline is idempotent and never duplicates rows;
 *   - runtime rows use a random id.
 *
 * Deterministic ids are intentionally stable across processes and machines.
 */

import { createHash, randomUUID } from "node:crypto";

/** Length of the hex digest used in deterministic ids. */
const DIGEST_LENGTH = 24;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Stable id for an externally sourced record.
 * Same (source, sourceId) always yields the same id.
 *
 * @example deterministicId("jmdict", "1358280") -> "jmdict_9f2c…"
 */
export function deterministicId(source: string, sourceId: string): string {
  const cleanSource = normalizeSegment(source);
  const cleanSourceId = sourceId.trim();

  if (!cleanSource) throw new Error("deterministicId requires a non-empty source");
  if (!cleanSourceId) throw new Error("deterministicId requires a non-empty sourceId");

  const digest = sha256Hex(`${cleanSource}:${cleanSourceId}`).slice(0, DIGEST_LENGTH);
  return `${cleanSource}_${digest}`;
}

/**
 * Stable id for a child row that belongs to a parent (sense, reading, …).
 * Position keeps sibling ids distinct and ordered.
 */
export function deterministicChildId(parentId: string, kind: string, position: number): string {
  const cleanParent = parentId.trim();
  const cleanKind = normalizeSegment(kind);

  if (!cleanParent) throw new Error("deterministicChildId requires a parentId");
  if (!cleanKind) throw new Error("deterministicChildId requires a kind");
  if (!Number.isInteger(position) || position < 0) {
    throw new Error("deterministicChildId requires a non-negative integer position");
  }

  const digest = sha256Hex(`${cleanParent}:${cleanKind}:${position}`).slice(0, DIGEST_LENGTH);
  return `${cleanKind}_${digest}`;
}

/** Random id for rows created at runtime (sessions, reviews, events). */
export function newId(prefix?: string): string {
  const raw = randomUUID().replace(/-/g, "");
  const clean = prefix ? normalizeSegment(prefix) : "";
  return clean ? `${clean}_${raw}` : raw;
}

/** Content checksum used by ETL to skip unchanged source records. */
export function checksum(value: string): string {
  return sha256Hex(value);
}
