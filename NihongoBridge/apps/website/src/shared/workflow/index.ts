/**
 * Enterprise Publishing Workflow State Machine
 *
 * All 10 Supported Publishing Workflow States:
 *  - draft
 *  - needs_review
 *  - in_review
 *  - changes_requested
 *  - approved
 *  - scheduled
 *  - published
 *  - expired
 *  - archived
 *  - deleted
 */

export const EDITORIAL_STATUSES = [
  "draft",
  "needs_review",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "expired",
  "archived",
  "deleted",
] as const;

export type EditorialStatus = (typeof EDITORIAL_STATUSES)[number];

export function isEditorialStatus(v: unknown): v is EditorialStatus {
  return typeof v === "string" && (EDITORIAL_STATUSES as readonly string[]).includes(v);
}

export const VALID_TRANSITIONS: Record<EditorialStatus, EditorialStatus[]> = {
  draft: ["needs_review", "in_review", "scheduled", "archived", "deleted"],
  needs_review: ["in_review", "changes_requested", "approved", "draft"],
  in_review: ["changes_requested", "approved", "draft", "published", "archived"],
  changes_requested: ["draft", "needs_review", "in_review"],
  approved: ["scheduled", "published", "draft"],
  scheduled: ["published", "draft", "archived"],
  published: ["expired", "archived", "draft", "deleted"],
  expired: ["draft", "archived"],
  archived: ["draft", "deleted"],
  deleted: ["draft"],
};

export function canTransition(from: EditorialStatus, to: EditorialStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

/* ------------------------------------------------------------------ */
/* Visual Diff Computation                                             */
/* ------------------------------------------------------------------ */

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
  isChanged: boolean;
}

export function computeVisualDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff[] {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.map((key) => {
    const b = before[key];
    const a = after[key];
    const isChanged = JSON.stringify(b) !== JSON.stringify(a);
    return { field: key, before: b, after: a, isChanged };
  });
}

/* ------------------------------------------------------------------ */
/* Mention Extraction (@username / @email)                             */
/* ------------------------------------------------------------------ */

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_.-]+)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}
