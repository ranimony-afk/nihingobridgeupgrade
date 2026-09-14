import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export const LEARNER_COOKIE = "nb_learner";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface Learner {
  id: number;
  publicId: string;
  isAnonymous: boolean;
}

type Row = Record<string, unknown>;
function rows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

/**
 * Cookie signing secret.
 *
 * `LEARNER_SESSION_SECRET` should be set in production. The development
 * fallback is derived from DATABASE_URL so cookies stay valid across restarts
 * without shipping a hard-coded secret.
 */
function secret(): string {
  return (
    process.env.LEARNER_SESSION_SECRET ??
    `dev-only:${process.env.DATABASE_URL ?? "nihongobridge"}`
  );
}

function sign(publicId: string): string {
  return createHmac("sha256", secret()).update(publicId).digest("base64url");
}

function verify(value: string): string | null {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const publicId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(publicId);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return publicId;
}

export function serializeLearnerCookie(publicId: string): string {
  return `${publicId}.${sign(publicId)}`;
}

/** Reads the learner from the signed cookie without creating one. */
export async function readLearner(): Promise<Learner | null> {
  try {
    const store = await cookies();
    const raw = store.get(LEARNER_COOKIE)?.value;
    if (!raw) return null;
    const publicId = verify(raw);
    if (!publicId) return null;

    const result = await getDb().execute(sql`
      SELECT id, public_id, is_anonymous FROM users WHERE public_id = ${publicId} LIMIT 1
    `);
    const [row] = rows<Row>(result);
    if (!row) return null;
    return {
      id: Number(row.id),
      publicId: String(row.public_id),
      isAnonymous: Boolean(row.is_anonymous),
    };
  } catch {
    return null;
  }
}

/**
 * Returns the current learner, creating an anonymous identity when needed.
 *
 * Route handlers must persist `setCookie` on the response; server components
 * cannot mutate cookies, so they fall back to read-only access.
 */
export async function ensureLearner(): Promise<{
  learner: Learner;
  setCookie: string | null;
} | null> {
  const existing = await readLearner();
  if (existing) return { learner: existing, setCookie: null };

  try {
    const publicId = randomUUID();
    const result = await getDb().execute(sql`
      INSERT INTO users (public_id, is_anonymous) VALUES (${publicId}, true)
      RETURNING id, public_id, is_anonymous
    `);
    const [row] = rows<Row>(result);
    if (!row) return null;
    return {
      learner: {
        id: Number(row.id),
        publicId: String(row.public_id),
        isAnonymous: Boolean(row.is_anonymous),
      },
      setCookie: serializeLearnerCookie(publicId),
    };
  } catch {
    return null;
  }
}

/** Applies the learner cookie to a response. */
export function attachLearnerCookie(response: Response, value: string | null): Response {
  if (!value) return response;
  response.headers.append(
    "set-cookie",
    `${LEARNER_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return response;
}

export async function touchLearner(userId: number): Promise<void> {
  try {
    await getDb().execute(sql`UPDATE users SET last_seen_at = now() WHERE id = ${userId}`);
  } catch {
    /* non-fatal */
  }
}
