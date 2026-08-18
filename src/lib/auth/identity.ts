import "server-only";

import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  authActionTokens,
  authAuditEvents,
  institutionMembers,
  institutions,
  refreshTokens,
  sessions,
  subscriptions,
  twoFactorCredentials,
  userCredentials,
  userPermissionOverrides,
  users,
} from "@/db/schema";
import { decryptMfaSecret, encryptMfaSecret, generateOpaqueToken, hashToken } from "@/lib/auth/crypto";
import { sendAccountActionEmail } from "@/lib/auth/email";
import { issueMobileAccessToken } from "@/lib/auth/jwt";
import { hashPassword, validatePassword, verifyPassword, type PasswordPolicyIssue } from "@/lib/auth/password";
import {
  normalizeRole,
  roleHasPermission,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import {
  createRecoveryCodes,
  createTotpEnrollment,
  currentTotpStep,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { env } from "@/lib/env";
import { reportException } from "@/lib/observability";

const PASSWORD_LOCK_THRESHOLD = 5;
const PASSWORD_LOCK_MINUTES = 15;
const ACTION_TOKEN_MINUTES = {
  emailVerification: 60 * 24,
  passwordReset: 30,
  mfaChallenge: 5,
} as const;

export type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuthenticatedUser = typeof users.$inferSelect;
export type SubscriptionAccess = {
  active: boolean;
  status: string;
  plan: string | null;
  institutionId: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getRequestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

export async function writeAuthAuditEvent(
  event: string,
  metadata: RequestMetadata & { userId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.insert(authAuditEvents).values({
      userId: metadata.userId ?? null,
      event,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: metadata.details ?? {},
    });
  } catch (error) {
    reportException(error, { component: "auth-audit", event }, "Could not persist authentication audit event");
  }
}

async function createActionToken(
  input: { userId?: string | null; email?: string | null; type: "email_verification" | "password_reset" | "mfa_challenge" },
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(
    Date.now() +
      (input.type === "email_verification"
        ? ACTION_TOKEN_MINUTES.emailVerification
        : input.type === "password_reset"
          ? ACTION_TOKEN_MINUTES.passwordReset
          : ACTION_TOKEN_MINUTES.mfaChallenge) *
        60_000,
  );

  await db.insert(authActionTokens).values({
    userId: input.userId ?? null,
    email: input.email ? normalizeEmail(input.email) : null,
    type: input.type,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  return rawToken;
}

async function findActiveActionToken(rawToken: string, type: string) {
  const [record] = await db
    .select()
    .from(authActionTokens)
    .where(
      and(
        eq(authActionTokens.tokenHash, hashToken(rawToken)),
        eq(authActionTokens.type, type),
        isNull(authActionTokens.consumedAt),
        gt(authActionTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return record ?? null;
}

async function consumeActionToken(id: string): Promise<boolean> {
  const updated = await db
    .update(authActionTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(authActionTokens.id, id), isNull(authActionTokens.consumedAt)))
    .returning({ id: authActionTokens.id });

  return updated.length === 1;
}

export async function registerPasswordUser(input: {
  name: string;
  email: string;
  password: string;
  metadata: RequestMetadata;
}): Promise<{ passwordIssues: PasswordPolicyIssue[] }> {
  const passwordIssues = validatePassword(input.password);
  if (passwordIssues.length > 0) return { passwordIssues };

  const email = normalizeEmail(input.email);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await writeAuthAuditEvent("registration_duplicate_attempt", {
      ...input.metadata,
      details: { emailDomain: email.split("@")[1] ?? "unknown" },
    });
    return { passwordIssues: [] };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(users)
      .values({
        name: input.name.trim().slice(0, 120),
        email,
        role: "student",
        status: "pending_verification",
      })
      .returning();

    await transaction.insert(userCredentials).values({
      userId: created.id,
      passwordHash,
    });

    return created;
  });

  const token = await createActionToken({
    userId: user.id,
    email,
    type: "email_verification",
  });
  const actionUrl = new URL("/api/v1/auth/email/verify", env.NEXT_PUBLIC_APP_URL);
  actionUrl.searchParams.set("token", token);

  await sendAccountActionEmail(email, "verify_email", actionUrl.toString());
  await writeAuthAuditEvent("registration_created", {
    ...input.metadata,
    userId: user.id,
  });

  return { passwordIssues: [] };
}

export async function requestEmailVerification(emailInput: string, metadata: RequestMetadata): Promise<void> {
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || user.emailVerified) {
    await writeAuthAuditEvent("email_verification_requested", {
      ...metadata,
      userId: user?.id ?? null,
    });
    return;
  }

  const token = await createActionToken({ userId: user.id, email, type: "email_verification" });
  const actionUrl = new URL("/api/v1/auth/email/verify", env.NEXT_PUBLIC_APP_URL);
  actionUrl.searchParams.set("token", token);
  await sendAccountActionEmail(email, "verify_email", actionUrl.toString());
  await writeAuthAuditEvent("email_verification_requested", { ...metadata, userId: user.id });
}

export async function verifyEmailToken(rawToken: string, metadata: RequestMetadata): Promise<boolean> {
  const token = await findActiveActionToken(rawToken, "email_verification");
  if (!token?.userId) return false;

  const consumed = await db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(authActionTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(authActionTokens.id, token.id), isNull(authActionTokens.consumedAt)))
      .returning({ id: authActionTokens.id });
    if (!updated) return false;

    await transaction
      .update(users)
      .set({ emailVerified: new Date(), status: "active", updatedAt: new Date() })
      .where(eq(users.id, token.userId!));
    return true;
  });

  if (consumed) {
    await writeAuthAuditEvent("email_verified", { ...metadata, userId: token.userId });
  }
  return consumed;
}

export async function requestPasswordReset(emailInput: string, metadata: RequestMetadata): Promise<void> {
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || user.status !== "active") {
    await writeAuthAuditEvent("password_reset_requested", { ...metadata, userId: user?.id ?? null });
    return;
  }

  const token = await createActionToken({ userId: user.id, email, type: "password_reset" });
  const actionUrl = new URL("/auth/reset-password", env.NEXT_PUBLIC_APP_URL);
  actionUrl.searchParams.set("token", token);
  await sendAccountActionEmail(email, "password_reset", actionUrl.toString());
  await writeAuthAuditEvent("password_reset_requested", { ...metadata, userId: user.id });
}

export async function resetPassword(
  rawToken: string,
  password: string,
  metadata: RequestMetadata,
): Promise<{ ok: boolean; passwordIssues: PasswordPolicyIssue[] }> {
  const passwordIssues = validatePassword(password);
  if (passwordIssues.length > 0) return { ok: false, passwordIssues };

  const token = await findActiveActionToken(rawToken, "password_reset");
  if (!token?.userId) return { ok: false, passwordIssues: [] };

  const passwordHash = await hashPassword(password);
  const completed = await db.transaction(async (transaction) => {
    const [consumed] = await transaction
      .update(authActionTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(authActionTokens.id, token.id), isNull(authActionTokens.consumedAt)))
      .returning({ id: authActionTokens.id });
    if (!consumed) return false;

    await transaction
      .update(userCredentials)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(userCredentials.userId, token.userId!));
    await transaction.delete(sessions).where(eq(sessions.userId, token.userId!));
    await transaction
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, token.userId!), isNull(refreshTokens.revokedAt)));
    await transaction
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, token.userId!));
    return true;
  });

  if (completed) {
    await writeAuthAuditEvent("password_reset_completed", { ...metadata, userId: token.userId });
  }

  return { ok: completed, passwordIssues: [] };
}

export type PasswordLoginResult =
  | { status: "invalid" }
  | { status: "locked"; retryAfterSeconds: number }
  | { status: "mfa_required" }
  | { status: "success"; user: AuthenticatedUser };

export async function authenticatePassword(
  emailInput: string,
  password: string,
  twoFactorCode: string | undefined,
  metadata: RequestMetadata,
): Promise<PasswordLoginResult> {
  const email = normalizeEmail(emailInput);
  const rows = await db
    .select({ user: users, credentials: userCredentials })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  const record = rows[0];

  if (!record || record.user.status !== "active" || !record.user.emailVerified) {
    await writeAuthAuditEvent("password_login_failed", {
      ...metadata,
      userId: record?.user.id ?? null,
      details: { reason: "invalid_credentials_or_unverified" },
    });
    return { status: "invalid" };
  }

  if (record.credentials.lockedUntil && record.credentials.lockedUntil > new Date()) {
    return {
      status: "locked",
      retryAfterSeconds: Math.max(1, Math.ceil((record.credentials.lockedUntil.getTime() - Date.now()) / 1_000)),
    };
  }

  const passwordMatches = await verifyPassword(password, record.credentials.passwordHash);
  if (!passwordMatches) {
    const failedAttempts = record.credentials.failedAttempts + 1;
    const lockedUntil = failedAttempts >= PASSWORD_LOCK_THRESHOLD
      ? new Date(Date.now() + PASSWORD_LOCK_MINUTES * 60_000)
      : null;
    await db
      .update(userCredentials)
      .set({ failedAttempts, lockedUntil, updatedAt: new Date() })
      .where(eq(userCredentials.userId, record.user.id));
    await writeAuthAuditEvent("password_login_failed", {
      ...metadata,
      userId: record.user.id,
      details: { reason: "invalid_password" },
    });
    return { status: "invalid" };
  }

  const [mfa] = await db
    .select()
    .from(twoFactorCredentials)
    .where(and(eq(twoFactorCredentials.userId, record.user.id), isNotNull(twoFactorCredentials.enabledAt)))
    .limit(1);

  if (mfa) {
    if (!twoFactorCode) return { status: "mfa_required" };
    const validMfa = await verifyUserSecondFactor(record.user.id, twoFactorCode, metadata);
    if (!validMfa) return { status: "invalid" };
  }

  await db
    .update(userCredentials)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(userCredentials.userId, record.user.id));
  await writeAuthAuditEvent("password_login_succeeded", { ...metadata, userId: record.user.id });
  return { status: "success", user: record.user };
}

export async function createWebSession(userId: string, metadata: RequestMetadata): Promise<{ token: string; expires: Date }> {
  const token = generateOpaqueToken();
  const expires = new Date(Date.now() + env.AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1_000);
  await db.insert(sessions).values({
    sessionToken: token,
    userId,
    expires,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });
  return { token, expires };
}

export function sessionCookieName(): string {
  return new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function sessionCookieValue(token: string, expires: Date): string {
  const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:" ? "; Secure" : "";
  const maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1_000));
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Expires=${expires.toUTCString()}${secure}`;
}

export function expiredSessionCookieValue(): string {
  const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const rawCookies = request.headers.get("cookie");
  if (!rawCookies) return null;
  const cookie = rawCookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName()}=`));
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName().length + 1)) : null;
}

export async function listUserSessions(userId: string) {
  return db
    .select({
      sessionToken: sessions.sessionToken,
      expires: sessions.expires,
      createdAt: sessions.createdAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expires, new Date())))
    .orderBy(desc(sessions.createdAt));
}

export async function revokeUserSession(userId: string, sessionToken: string): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.sessionToken, sessionToken)))
    .returning({ sessionToken: sessions.sessionToken });
  return deleted.length === 1;
}

export async function revokeAllUserSessions(userId: string, exceptSessionToken?: string): Promise<void> {
  const conditions = [eq(sessions.userId, userId)];
  if (exceptSessionToken) conditions.push(sql`${sessions.sessionToken} <> ${exceptSessionToken}`);
  await db.delete(sessions).where(and(...conditions));
}

export async function beginTwoFactorEnrollment(userId: string) {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.email) throw new Error("Account email is required before enabling two-factor authentication.");

  const [existingCredential] = await db
    .select({ enabledAt: twoFactorCredentials.enabledAt })
    .from(twoFactorCredentials)
    .where(eq(twoFactorCredentials.userId, userId))
    .limit(1);
  if (existingCredential?.enabledAt) {
    throw new Error("Disable the existing authenticator before enrolling a new one.");
  }

  const enrollment = await createTotpEnrollment(user.email);
  await db
    .insert(twoFactorCredentials)
    .values({
      userId,
      secretEncrypted: encryptMfaSecret(enrollment.secret),
      enabledAt: null,
      lastUsedStep: null,
      recoveryCodeHashes: [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: twoFactorCredentials.userId,
      set: {
        secretEncrypted: encryptMfaSecret(enrollment.secret),
        enabledAt: null,
        lastUsedStep: null,
        recoveryCodeHashes: [],
        updatedAt: new Date(),
      },
    });

  return {
    otpauthUri: enrollment.uri,
    qrCodeDataUrl: enrollment.qrCodeDataUrl,
    manualKey: enrollment.secret,
  };
}

export async function confirmTwoFactorEnrollment(
  userId: string,
  code: string,
  metadata: RequestMetadata,
): Promise<{ recoveryCodes: string[] } | null> {
  const [credential] = await db
    .select()
    .from(twoFactorCredentials)
    .where(eq(twoFactorCredentials.userId, userId))
    .limit(1);
  if (!credential || credential.enabledAt) return null;

  const valid = await verifyTotpCode(decryptMfaSecret(credential.secretEncrypted), code);
  if (!valid) return null;

  const recovery = createRecoveryCodes();
  await db
    .update(twoFactorCredentials)
    .set({
      enabledAt: new Date(),
      lastUsedStep: currentTotpStep(),
      recoveryCodeHashes: recovery.hashes,
      updatedAt: new Date(),
    })
    .where(eq(twoFactorCredentials.userId, userId));
  await writeAuthAuditEvent("mfa_enabled", { ...metadata, userId });
  return { recoveryCodes: recovery.plainCodes };
}

export async function verifyUserSecondFactor(
  userId: string,
  code: string,
  metadata: RequestMetadata,
): Promise<boolean> {
  const [credential] = await db
    .select()
    .from(twoFactorCredentials)
    .where(and(eq(twoFactorCredentials.userId, userId), isNotNull(twoFactorCredentials.enabledAt)))
    .limit(1);
  if (!credential?.enabledAt) return false;

  const normalizedRecoveryCode = normalizeRecoveryCode(code);
  const candidateHash = hashToken(normalizedRecoveryCode);
  const recoveryIndex = credential.recoveryCodeHashes.findIndex((hash) => hash === candidateHash);
  if (recoveryIndex >= 0) {
    const remaining = credential.recoveryCodeHashes.filter((_, index) => index !== recoveryIndex);
    await db
      .update(twoFactorCredentials)
      .set({ recoveryCodeHashes: remaining, updatedAt: new Date() })
      .where(eq(twoFactorCredentials.userId, userId));
    await writeAuthAuditEvent("mfa_recovery_code_used", { ...metadata, userId });
    return true;
  }

  const currentStep = currentTotpStep();
  if (credential.lastUsedStep && currentStep <= credential.lastUsedStep) return false;
  const valid = await verifyTotpCode(decryptMfaSecret(credential.secretEncrypted), code);
  if (!valid) {
    await writeAuthAuditEvent("mfa_verification_failed", { ...metadata, userId });
    return false;
  }

  await db
    .update(twoFactorCredentials)
    .set({ lastUsedStep: currentStep, updatedAt: new Date() })
    .where(eq(twoFactorCredentials.userId, userId));
  await writeAuthAuditEvent("mfa_verified", { ...metadata, userId });
  return true;
}

export async function disableTwoFactor(userId: string, code: string, metadata: RequestMetadata): Promise<boolean> {
  const valid = await verifyUserSecondFactor(userId, code, metadata);
  if (!valid) return false;
  await db.delete(twoFactorCredentials).where(eq(twoFactorCredentials.userId, userId));
  await writeAuthAuditEvent("mfa_disabled", { ...metadata, userId });
  return true;
}

export async function createMfaChallenge(userId: string): Promise<string> {
  return createActionToken({ userId, type: "mfa_challenge" });
}

export async function completeMfaChallenge(
  rawChallenge: string,
  code: string,
  metadata: RequestMetadata,
): Promise<{ userId: string } | null> {
  const token = await findActiveActionToken(rawChallenge, "mfa_challenge");
  if (!token?.userId) return null;
  const valid = await verifyUserSecondFactor(token.userId, code, metadata);
  if (!valid || !(await consumeActionToken(token.id))) return null;
  return { userId: token.userId };
}

export async function issueMobileTokenPair(
  user: AuthenticatedUser,
  metadata: RequestMetadata,
  familyId = crypto.randomUUID(),
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresAt: Date }> {
  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000);
  await db.insert(refreshTokens).values({
    userId: user.id,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  });

  const accessToken = await issueMobileAccessToken({
    userId: user.id,
    role: normalizeRole(user.role),
    tokenVersion: user.tokenVersion,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshExpiresAt,
  };
}

export async function rotateMobileRefreshToken(
  rawRefreshToken: string,
  metadata: RequestMetadata,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresAt: Date } | null> {
  const [record] = await db
    .select({ token: refreshTokens, user: users })
    .from(refreshTokens)
    .innerJoin(users, eq(refreshTokens.userId, users.id))
    .where(eq(refreshTokens.tokenHash, hashToken(rawRefreshToken)))
    .limit(1);

  if (!record || record.token.revokedAt || record.token.expiresAt <= new Date() || record.user.status !== "active") {
    return null;
  }

  const revoked = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), lastUsedAt: new Date() })
    .where(and(eq(refreshTokens.id, record.token.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  if (revoked.length !== 1) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, record.token.familyId), isNull(refreshTokens.revokedAt)));
    await writeAuthAuditEvent("refresh_token_reuse_detected", {
      ...metadata,
      userId: record.user.id,
    });
    return null;
  }

  const pair = await issueMobileTokenPair(record.user, metadata, record.token.familyId);
  await writeAuthAuditEvent("mobile_token_refreshed", { ...metadata, userId: record.user.id });
  return pair;
}

export async function revokeMobileRefreshToken(rawRefreshToken: string, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashToken(rawRefreshToken)),
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function revokeAllMobileRefreshTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function getUserById(userId: string): Promise<AuthenticatedUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function hasPermission(userId: string, role: string, permission: Permission): Promise<boolean> {
  const [override] = await db
    .select({ granted: userPermissionOverrides.granted })
    .from(userPermissionOverrides)
    .where(
      and(
        eq(userPermissionOverrides.userId, userId),
        eq(userPermissionOverrides.permission, permission),
      ),
    )
    .limit(1);

  return override ? override.granted : roleHasPermission(role, permission);
}

export async function getSubscriptionAccess(userId: string): Promise<SubscriptionAccess> {
  const [membership] = await db
    .select({
      institutionId: institutions.id,
      status: institutions.subscriptionStatus,
      plan: institutions.plan,
      endsAt: institutions.subscriptionEndsAt,
    })
    .from(institutionMembers)
    .innerJoin(institutions, eq(institutionMembers.institutionId, institutions.id))
    .where(eq(institutionMembers.userId, userId))
    .limit(1);

  if (membership) {
    const active = isSubscriptionActive(membership.status, membership.endsAt);
    return {
      active,
      status: membership.status,
      plan: membership.plan,
      institutionId: membership.institutionId,
    };
  }

  const [personalSubscription] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.institutionId)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!personalSubscription) {
    return { active: true, status: "free", plan: "free", institutionId: null };
  }

  return {
    active: isSubscriptionActive(personalSubscription.status, personalSubscription.currentPeriodEndsAt),
    status: personalSubscription.status,
    plan: personalSubscription.plan,
    institutionId: null,
  };
}

function isSubscriptionActive(status: string, endsAt: Date | null): boolean {
  if (endsAt && endsAt < new Date()) return false;
  return status === "active" || status === "trialing" || status === "free";
}

export function asRole(value: string): Role {
  return normalizeRole(value);
}
