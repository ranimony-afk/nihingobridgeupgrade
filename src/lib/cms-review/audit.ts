/**
 * Audit timeline shaping — Phase 13.5D-2.
 *
 * Pure client-safe helpers: human labels for the audited action
 * vocabulary, tolerant reads of structured detail fields, and a
 * defense-in-depth IP strip (13.5D-1 already sanitizes; the UI must
 * still never render the key even if a legacy response carries it).
 */
import type { ReviewAuditEvent } from "./types";

const ACTION_LABELS: Readonly<Record<string, string>> = {
  create_draft: "Draft created",
  edit: "Edited",
  submit_review: "Submitted for review",
  request_changes: "Changes requested",
  approve: "Approved",
  schedule: "Scheduled",
  publish: "Published",
  verify_translation: "Verified translation",
  archive: "Archived",
  rollback: "Rolled back",
};

/** Human label for an audited action; unknown verbs prettify, never crash. */
export function formatAuditAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  return action
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

export interface AuditDetailSummary {
  readonly fromStatus?: string;
  readonly toStatus?: string;
  readonly versionNumber?: number;
  readonly reason?: string;
  readonly adminOverride?: boolean;
  readonly targetVersion?: number;
  readonly entityType?: string;
  readonly language?: string;
  readonly translationId?: string;
}

/** Tolerant pick of the structured fields the timeline highlights. */
export function summarizeAuditDetails(
  details: Record<string, unknown>
): AuditDetailSummary {
  const summary: Record<string, string | number | boolean> = {};
  const fromStatus = asString(details.fromStatus);
  const toStatus = asString(details.toStatus);
  const versionNumber = asNumber(
    details.versionNumber ?? details.version ?? details.targetVersion
  );
  const reason = asString(details.reason);
  const entityType = asString(details.entityType);
  const language = asString(details.language);
  const translationId = asString(details.translationId);
  const targetVersion = asNumber(details.targetVersion);
  if (fromStatus) summary.fromStatus = fromStatus;
  if (toStatus) summary.toStatus = toStatus;
  if (versionNumber !== undefined) summary.versionNumber = versionNumber;
  if (reason) summary.reason = reason;
  if (details.adminOverride === true) summary.adminOverride = true;
  if (targetVersion !== undefined) summary.targetVersion = targetVersion;
  if (entityType) summary.entityType = entityType;
  if (language) summary.language = language;
  if (translationId) summary.translationId = translationId;
  return summary;
}

/** Keys the timeline renders inline (the rest hide behind Details). */
export const AUDIT_INLINE_KEYS: ReadonlySet<string> = new Set([
  "fromStatus",
  "toStatus",
  "versionNumber",
  "version",
  "reason",
  "adminOverride",
  "targetVersion",
  "entityType",
  "language",
  "translationId",
]);

/**
 * Deep-clone a value with every `ipAddress` key removed. The 13.5D-1
 * API never sends the key; this is belt-and-braces for legacy payloads.
 */
export function stripIpAddress<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripIpAddress(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "ipAddress") continue;
      out[key] = stripIpAddress(entry);
    }
    return out as T;
  }
  return value;
}

/** Chronological (oldest-first) copy for timeline rendering. */
export function sortAuditChronological(
  events: readonly ReviewAuditEvent[]
): ReviewAuditEvent[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
}
