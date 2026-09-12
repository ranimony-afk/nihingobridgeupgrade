/**
 * Identity repository — the only module that queries the identity_* tables
 * (DATABASE_OWNERSHIP §2.9).
 *
 * Persistence only: no HTTP types, no password logic, no policy decisions.
 */

import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  identityCredentials,
  identityPreferences,
  identityProfiles,
  identitySessions,
  identityUserRoles,
  identityUsers,
  type IdentityPreferences,
  type IdentityProfile,
  type IdentityRole,
  type IdentityUser,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  roles?: IdentityRole[];
  /** IANA timezone for the new profile. Defaults to UTC. */
  timezone?: string;
  /** UI locale for the new profile. Defaults to "en". */
  locale?: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthenticatedRecord {
  user: IdentityUser;
  session: SessionRecord;
  roles: IdentityRole[];
}

/** Case-insensitive lookup, matching the unique index on lower(email). */
export async function findUserByEmail(email: string): Promise<IdentityUser | null> {
  const rows = await db
    .select()
    .from(identityUsers)
    .where(sql`lower(${identityUsers.email}) = lower(${email})`)
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<IdentityUser | null> {
  const rows = await db.select().from(identityUsers).where(eq(identityUsers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const rows = await db
    .select({ hash: identityCredentials.passwordHash })
    .from(identityCredentials)
    .where(eq(identityCredentials.userId, userId))
    .limit(1);
  return rows[0]?.hash ?? null;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db
    .update(identityCredentials)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(identityCredentials.userId, userId));
}

export async function getRoles(userId: string): Promise<IdentityRole[]> {
  const rows = await db
    .select({ role: identityUserRoles.role })
    .from(identityUserRoles)
    .where(eq(identityUserRoles.userId, userId));
  return rows.map((row) => row.role);
}

/**
 * Create a user with every row a complete account requires: credential,
 * role grants, profile, and preferences — all in one transaction.
 *
 * Profile and preferences are 1:1 with the user and the application assumes
 * they exist, so creating them here removes a "might be missing" branch from
 * every downstream consumer. A partially-created account can never exist.
 */
export async function createUser(input: CreateUserInput): Promise<IdentityUser> {
  const roles = input.roles?.length ? input.roles : (["learner"] as IdentityRole[]);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(identityUsers)
      .values({
        id: newId("usr"),
        email: input.email,
        displayName: input.displayName,
      })
      .returning();

    if (!user) throw new Error("Failed to create user");

    await tx.insert(identityCredentials).values({
      id: newId("cred"),
      userId: user.id,
      passwordHash: input.passwordHash,
    });

    await tx.insert(identityUserRoles).values(
      roles.map((role) => ({ id: newId("role"), userId: user.id, role })),
    );

    await tx.insert(identityProfiles).values({
      id: newId("prof"),
      userId: user.id,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
    });

    await tx.insert(identityPreferences).values({
      id: newId("pref"),
      userId: user.id,
    });

    return user;
  });
}

// ─────────────────────────────────────────────
// Profile and preferences
// ─────────────────────────────────────────────

export async function getProfile(userId: string): Promise<IdentityProfile | null> {
  const rows = await db
    .select()
    .from(identityProfiles)
    .where(eq(identityProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPreferences(userId: string): Promise<IdentityPreferences | null> {
  const rows = await db
    .select()
    .from(identityPreferences)
    .where(eq(identityPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Partial update. Only supplied fields change; `updated_at` always moves. */
export async function updateProfile(
  userId: string,
  patch: Partial<Omit<IdentityProfile, "id" | "userId" | "createdAt" | "updatedAt">>,
): Promise<IdentityProfile | null> {
  const rows = await db
    .update(identityProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(identityProfiles.userId, userId))
    .returning();
  return rows[0] ?? null;
}

export async function updatePreferences(
  userId: string,
  patch: Partial<Omit<IdentityPreferences, "id" | "userId" | "createdAt" | "updatedAt">>,
): Promise<IdentityPreferences | null> {
  const rows = await db
    .update(identityPreferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(identityPreferences.userId, userId))
    .returning();
  return rows[0] ?? null;
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  transport: "cookie" | "bearer";
  expiresAt: Date;
  userAgent?: string | null;
}): Promise<SessionRecord> {
  const [session] = await db
    .insert(identitySessions)
    .values({
      id: newId("sess"),
      userId: input.userId,
      tokenHash: input.tokenHash,
      transport: input.transport,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
    })
    .returning({
      id: identitySessions.id,
      userId: identitySessions.userId,
      expiresAt: identitySessions.expiresAt,
      revokedAt: identitySessions.revokedAt,
    });

  if (!session) throw new Error("Failed to create session");
  return session;
}

/**
 * Resolve a token digest to its user, session, and roles in one round trip.
 * Expired and revoked sessions are filtered in SQL, so a stale token can never
 * be resurrected by application-level logic.
 */
export async function findAuthenticatedByTokenHash(
  tokenHash: string,
): Promise<AuthenticatedRecord | null> {
  const rows = await db
    .select({
      user: identityUsers,
      sessionId: identitySessions.id,
      sessionUserId: identitySessions.userId,
      expiresAt: identitySessions.expiresAt,
      revokedAt: identitySessions.revokedAt,
    })
    .from(identitySessions)
    .innerJoin(identityUsers, eq(identityUsers.id, identitySessions.userId))
    .where(
      and(
        eq(identitySessions.tokenHash, tokenHash),
        isNull(identitySessions.revokedAt),
        gt(identitySessions.expiresAt, new Date()),
        eq(identityUsers.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    user: row.user,
    session: {
      id: row.sessionId,
      userId: row.sessionUserId,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    },
    roles: await getRoles(row.sessionUserId),
  };
}

export async function touchSession(sessionId: string): Promise<void> {
  await db
    .update(identitySessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(identitySessions.id, sessionId));
}

/** Revoke a single session. Idempotent. */
export async function revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
  const revoked = await db
    .update(identitySessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(identitySessions.tokenHash, tokenHash), isNull(identitySessions.revokedAt)))
    .returning({ id: identitySessions.id });
  return revoked.length > 0;
}

/** Revoke every active session for a user ("sign out everywhere"). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const revoked = await db
    .update(identitySessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(identitySessions.userId, userId), isNull(identitySessions.revokedAt)))
    .returning({ id: identitySessions.id });
  return revoked.length;
}

/** Housekeeping: drop sessions that are expired or long revoked. */
export async function deleteDeadSessions(): Promise<number> {
  const deleted = await db
    .delete(identitySessions)
    .where(
      or(
        lt(identitySessions.expiresAt, new Date()),
        lt(identitySessions.revokedAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)),
      ),
    )
    .returning({ id: identitySessions.id });
  return deleted.length;
}
