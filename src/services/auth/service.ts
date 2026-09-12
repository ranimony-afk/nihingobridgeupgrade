/**
 * AuthService — the single authority on identity (DOMAIN_OWNERSHIP §10).
 *
 * Framework-agnostic: no Request, no Response, no cookies. Route handlers
 * translate between HTTP and these calls.
 */

import { serverEnv } from "@/config/env";
import type { IdentityRole } from "@/db/schema";
import { ConflictError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import * as repo from "@/repositories/identity";

import {
  burnTime,
  checkPasswordPolicy,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "./password.ts";
import { generateSessionToken, hashSessionToken, looksLikeToken } from "./tokens.ts";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  roles: IdentityRole[];
  createdAt: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  session: IssuedSession;
}

export type Transport = "cookie" | "bearer";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  transport?: Transport;
  userAgent?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
  transport?: Transport;
  userAgent?: string | null;
}

const EMAIL_MAX = 320;
const DISPLAY_NAME_MAX = 100;

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

/**
 * Pragmatic email check. Full RFC 5322 validation rejects addresses that work
 * and accepts ones that do not; deliverability is proven by sending mail, not
 * by a regular expression.
 */
function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ValidationError("Invalid request", [{ path: "email", message: "Email is required" }]);
  }
  const email = raw.trim();
  const problems: string[] = [];

  if (email.length === 0) problems.push("Email is required");
  else if (email.length > EMAIL_MAX) problems.push("Email is too long");
  else if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) problems.push("Email is not valid");

  if (problems.length > 0) {
    throw new ValidationError(
      "Invalid request",
      problems.map((message) => ({ path: "email", message })),
    );
  }
  return email;
}

function normalizeDisplayName(raw: unknown, email: string): string {
  if (raw === undefined || raw === null || raw === "") {
    // Default to the local part rather than forcing a second field at signup.
    return email.split("@")[0]?.slice(0, DISPLAY_NAME_MAX) || "Learner";
  }
  if (typeof raw !== "string") {
    throw new ValidationError("Invalid request", [
      { path: "displayName", message: "Display name must be text" },
    ]);
  }
  const name = raw.trim();
  if (name.length === 0 || name.length > DISPLAY_NAME_MAX) {
    throw new ValidationError("Invalid request", [
      { path: "displayName", message: `Display name must be 1–${DISPLAY_NAME_MAX} characters` },
    ]);
  }
  return name;
}

function requirePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new ValidationError("Invalid request", [
      { path: "password", message: "Password is required" },
    ]);
  }
  return raw;
}

function toPublicUser(
  user: { id: string; email: string; displayName: string; createdAt: Date },
  roles: IdentityRole[],
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles,
    createdAt: user.createdAt.toISOString(),
  };
}

function sessionTtlMs(transport: Transport): number {
  const { auth } = serverEnv();
  const seconds =
    transport === "bearer" ? auth.refreshTokenTtlSeconds : auth.sessionTtlSeconds;
  return seconds * 1000;
}

async function issueSession(
  userId: string,
  transport: Transport,
  userAgent: string | null | undefined,
): Promise<IssuedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs(transport));

  await repo.createSession({
    userId,
    tokenHash: hashSessionToken(token),
    transport,
    expiresAt,
    userAgent: userAgent ?? null,
  });

  return { token, expiresAt };
}

// ─────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────

/** Create an account and sign the new user in. */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const password = requirePassword(input.password);
  const displayName = normalizeDisplayName(input.displayName, email);

  const policy = checkPasswordPolicy(password);
  if (!policy.valid) {
    throw new ValidationError(
      "Password does not meet requirements",
      policy.problems.map((message) => ({ path: "password", message })),
    );
  }

  if (await repo.findUserByEmail(email)) {
    // Registration necessarily reveals whether an address is taken; the
    // alternative (silent success) breaks the signup flow. Login does not
    // leak this — see `login` below.
    throw new ConflictError("An account with that email already exists");
  }

  const user = await repo.createUser({
    email,
    displayName,
    passwordHash: await hashPassword(password),
  });

  const transport = input.transport ?? "cookie";
  const session = await issueSession(user.id, transport, input.userAgent);

  return { user: toPublicUser(user, ["learner"]), session };
}

/**
 * Verify credentials and start a session.
 *
 * Every failure path — unknown email, wrong password, suspended account —
 * returns the same error and spends comparable time, so the endpoint cannot
 * be used to enumerate registered addresses.
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const password = requirePassword(input.password);
  const failure = new UnauthenticatedError("Invalid email or password");

  const user = await repo.findUserByEmail(email);
  if (!user) {
    await burnTime();
    throw failure;
  }

  const storedHash = await repo.getPasswordHash(user.id);
  if (!storedHash) {
    await burnTime();
    throw failure;
  }

  const correct = await verifyPassword(password, storedHash);
  if (!correct) throw failure;

  if (user.status !== "active") throw failure;

  // Upgrade the digest in place when cost parameters have been raised.
  if (needsRehash(storedHash)) {
    await repo.updatePasswordHash(user.id, await hashPassword(password));
  }

  const transport = input.transport ?? "cookie";
  const session = await issueSession(user.id, transport, input.userAgent);

  return { user: toPublicUser(user, await repo.getRoles(user.id)), session };
}

/** Resolve a raw token to its user. Returns null for anything unusable. */
export async function resolveSession(
  token: string | null | undefined,
): Promise<{ user: PublicUser; sessionId: string } | null> {
  if (!token || !looksLikeToken(token)) return null;

  const record = await repo.findAuthenticatedByTokenHash(hashSessionToken(token));
  if (!record) return null;

  return {
    user: toPublicUser(record.user, record.roles),
    sessionId: record.session.id,
  };
}

/** End one session. Idempotent, so a double logout is not an error. */
export async function logout(token: string | null | undefined): Promise<boolean> {
  if (!token || !looksLikeToken(token)) return false;
  return repo.revokeSessionByTokenHash(hashSessionToken(token));
}

/** End every session for a user. */
export async function logoutEverywhere(userId: string): Promise<number> {
  return repo.revokeAllSessions(userId);
}
