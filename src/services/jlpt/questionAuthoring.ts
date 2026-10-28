import "server-only";

import { db } from "@/db";
import { questions as questionsTable } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import {
  MAX_REQUEST_BODY_BYTES,
  QuestionAuthoringError,
  parseCreateQuestionDraft,
} from "./questionDraft";
import type { NewQuestionRow } from "./questionDraft";

/**
 * Authorized question authoring — `POST /api/questions`.
 *
 * Trust flow (the ONLY supported direction, identical to the CMS pipeline):
 *
 *   request → verified server-side identity → application user → role
 *           → `cms.create` → validation → database write
 *
 * Non-negotiable properties:
 * - Authentication/authorization is the FIRST thing that happens: before
 *   the payload is even parsed, so an anonymous or unauthorized caller
 *   cannot reach validation, the store, or any indirect mutation, and
 *   cannot use validation messages as an unauthenticated oracle.
 * - There is NO identity parameter. `createQuestion` takes a raw body
 *   string and nothing else; no client-supplied id, role, ownership claim,
 *   header, or payload field can influence who the caller is.
 * - `cms.create` is the established action-level permission for authoring
 *   content (held by `editor` and `admin`, denied to `learner` and
 *   `reviewer`). No new permission, role, or identity system is introduced.
 * - Validation happens after authorization and before any write.
 * - The store port is the single write surface, so "no write happened" is
 *   observable and testable.
 *
 * Scope note: this module governs creation only. It deliberately does not
 * add update/delete routes or a question review lifecycle.
 */

/** The write surface. Production: Drizzle over the `questions` table. */
export interface QuestionStore {
  insertQuestion(row: NewQuestionRow): Promise<void>;
}

type Database = typeof db;

/**
 * `questions.id` is a text primary key, so a duplicate raises a unique
 * violation (SQLSTATE 23505). Recognized here — at the persistence
 * boundary — so the transport layer never has to know driver codes, and
 * the client receives a sanitized 409 instead of a 500 with SQL details.
 */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: unknown } | null)?.code ??
    (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === "23505";
}

/**
 * Drizzle adapter. `isActive` is server-authoritative here (always true,
 * exactly as before this change) and timestamps stay database-owned, so a
 * client cannot inject either through the payload.
 */
export function createDrizzleQuestionStore(database: Database): QuestionStore {
  return {
    async insertQuestion(row) {
      await database.insert(questionsTable).values({
        ...row,
        isActive: true,
      });
    },
  };
}

const defaultStore = createDrizzleQuestionStore(db);

/**
 * Test seam (mirrors `setActorResolver` / `setCmsDatabaseOverride`):
 * deterministic tests inject an in-memory or PGlite-backed store.
 */
let storeOverride: QuestionStore | null = null;

export function setQuestionStore(store: QuestionStore): void {
  storeOverride = store;
}

export function resetQuestionStore(): void {
  storeOverride = null;
}

function currentStore(): QuestionStore {
  return storeOverride ?? defaultStore;
}

/**
 * Create one question draft.
 *
 * @param rawBody Raw request body text. Taken as text — not as a parsed
 *   object — so that parsing (and therefore any interpretation of client
 *   input at all) strictly follows the authorization check.
 * @returns the persisted question id.
 * @throws AuthorizationError 401 (no verified identity) / 403 (no
 *   `cms.create`).
 * @throws QuestionAuthoringError 400 (malformed body/payload) / 409
 *   (duplicate id).
 */
export async function createQuestion(
  rawBody: string
): Promise<{ id: string }> {
  // 1. Authentication + authorization. Must stay first.
  await requirePermission("cms.create");

  // 2. Input validation — no I/O, no writes.
  if (typeof rawBody !== "string") {
    throw QuestionAuthoringError.validation(
      "Request body must be valid JSON.",
      "body"
    );
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw QuestionAuthoringError.validation(
      `Request body must be at most ${MAX_REQUEST_BODY_BYTES} bytes.`,
      "body"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw QuestionAuthoringError.validation(
      "Request body must be valid JSON.",
      "body"
    );
  }
  const row = parseCreateQuestionDraft(parsed);

  // 3. Persistence — the only write in this flow.
  try {
    await currentStore().insertQuestion(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw QuestionAuthoringError.idConflict();
    throw error;
  }

  return { id: row.id };
}
