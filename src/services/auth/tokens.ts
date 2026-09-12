/**
 * Session tokens.
 *
 * Opaque random strings, not JWTs. This is a deliberate choice:
 *
 *   - revocation is immediate (delete the row) rather than "wait for expiry";
 *   - there is no signing algorithm to confuse, and no `alg: none` class of bug;
 *   - there is no key rotation problem;
 *   - the token carries no claims, so nothing sensitive sits in a cookie.
 *
 * The database stores only SHA-256 of the token, so a leaked table dump does
 * not yield usable sessions. Lookup is by digest, which is an indexed equality
 * match — no secret-to-secret comparison happens, so there is no timing side
 * channel to defend against here.
 */

import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy. */
const TOKEN_BYTES = 32;

/** Mint a new session token. Returned to the client exactly once. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Digest used as the stored lookup key. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Extract a bearer token from an Authorization header.
 * Returns null for anything that is not a well-formed `Bearer <token>`.
 */
export function bearerFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/** Reject tokens that cannot possibly be ours before touching the database. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(value);
}
