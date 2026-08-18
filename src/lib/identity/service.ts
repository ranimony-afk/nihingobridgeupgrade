import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  identityAccounts,
  identityChallenges,
  identityRefreshTokens,
  identityUsers,
  institutions,
  learners,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/audit/crypto";
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC, hashToken, signJwt, verifyJwt } from "./jwt";
import { enqueueMail, appOrigin } from "./mail";
import { isRole, type Plan, type Role } from "./rbac";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { uid } from "@/lib/utils";
import { randomBytes } from "crypto";

function publicUser(user: typeof identityUsers.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    status: user.status,
    learnerId: user.learnerId,
    institutionId: user.institutionId,
    emailVerified: Boolean(user.emailVerifiedAt),
    totpEnabled: user.totpEnabled,
  };
}

async function ensureLearner(userId: string, name: string, existingLearnerId?: string | null) {
  if (existingLearnerId) {
    const [row] = await db.select({ id: learners.id }).from(learners).where(eq(learners.id, existingLearnerId));
    if (row) {
      await db.update(identityUsers).set({ learnerId: row.id }).where(eq(identityUsers.id, userId));
      return row.id;
    }
  }
  const learnerId = uid("lrn");
  await db.insert(learners).values({
    id: learnerId,
    name,
    gems: 500,
    streakFreezes: 1,
  });
  await db.update(identityUsers).set({ learnerId }).where(eq(identityUsers.id, userId));
  return learnerId;
}

export async function issueTokens(user: typeof identityUsers.$inferSelect, userAgent?: string | null) {
  const learnerId = user.learnerId ?? (await ensureLearner(user.id, user.name, user.learnerId));
  const jti = uid("jti");
  const accessToken = signJwt(
    { sub: user.id, role: user.role, plan: user.plan, learnerId, typ: "access", jti },
    ACCESS_TTL_SEC,
  );
  const refreshToken = signJwt(
    { sub: user.id, role: user.role, plan: user.plan, learnerId, typ: "refresh", jti: uid("jti") },
    REFRESH_TTL_SEC,
  );
  await db.insert(identityRefreshTokens).values({
    id: uid("rft"),
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    userAgent: userAgent ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC, user: publicUser({ ...user, learnerId }) };
}

async function createChallenge(email: string, kind: string, userId: string | null, ttlMin: number) {
  const token = randomBytes(24).toString("hex");
  await db.insert(identityChallenges).values({
    id: uid("chg"),
    userId,
    email,
    kind,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMin * 60 * 1000),
  });
  return token;
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  role?: Role;
  learnerId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@") || input.password.length < 8) {
    return { ok: false as const, error: "Valid email and 8+ character password required", status: 400 };
  }
  const existing = await db.select({ id: identityUsers.id }).from(identityUsers).where(eq(identityUsers.email, email));
  if (existing.length) return { ok: false as const, error: "Email already registered", status: 409 };

  const role: Role = input.role && isRole(input.role) && input.role !== "super_admin" ? input.role : "student";
  const id = uid("idn");
  await db.insert(identityUsers).values({
    id,
    email,
    name: input.name.trim().slice(0, 48) || "Student",
    passwordHash: hashPassword(input.password),
    role,
  });
  const learnerId = await ensureLearner(id, input.name, input.learnerId);
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, id));
  const verifyToken = await createChallenge(email, "verify", id, 60 * 24);
  const link = `${appOrigin()}/verify-email?token=${verifyToken}`;
  await enqueueMail({
    to: email,
    subject: "Verify your NihongoBridge email",
    body: `Verify: ${link}`,
    kind: "verify",
  });
  return { ok: true as const, user: publicUser(user!), learnerId, verifyLink: link };
}

export async function loginUser(input: { email: string; password: string; otp?: string; userAgent?: string }) {
  const email = input.email.trim().toLowerCase();
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.email, email));
  if (!user || user.status !== "active" || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
    return { ok: false as const, error: "Invalid credentials", status: 401 };
  }
  if (user.totpEnabled) {
    if (!input.otp) {
      const challengeId = await createChallenge(email, "2fa", user.id, 10);
      return { ok: true as const, requires2fa: true as const, challengeId };
    }
    if (!user.totpSecret || !verifyTotp(user.totpSecret, input.otp)) {
      return { ok: false as const, error: "Invalid authenticator code", status: 401 };
    }
  }
  const tokens = await issueTokens(user, input.userAgent);
  return { ok: true as const, requires2fa: false as const, ...tokens };
}

export async function completeTwoFactor(challengeId: string, code: string, userAgent?: string) {
  const [challenge] = await db
    .select()
    .from(identityChallenges)
    .where(and(eq(identityChallenges.tokenHash, hashToken(challengeId)), eq(identityChallenges.kind, "2fa")));
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now() || !challenge.userId) {
    return { ok: false as const, error: "Challenge expired", status: 400 };
  }
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, challenge.userId));
  if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) {
    return { ok: false as const, error: "Invalid authenticator code", status: 401 };
  }
  await db.update(identityChallenges).set({ consumedAt: new Date() }).where(eq(identityChallenges.id, challenge.id));
  return { ok: true as const, ...(await issueTokens(user, userAgent)) };
}

export async function refreshSession(refreshToken: string, userAgent?: string) {
  const claims = verifyJwt(refreshToken);
  if (!claims || claims.typ !== "refresh") return { ok: false as const, error: "Invalid refresh token", status: 401 };
  const [row] = await db
    .select()
    .from(identityRefreshTokens)
    .where(eq(identityRefreshTokens.tokenHash, hashToken(refreshToken)));
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "Refresh token revoked", status: 401 };
  }
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, claims.sub));
  if (!user || user.status !== "active") return { ok: false as const, error: "Account disabled", status: 401 };
  await db.update(identityRefreshTokens).set({ revokedAt: new Date() }).where(eq(identityRefreshTokens.id, row.id));
  return { ok: true as const, ...(await issueTokens(user, userAgent)) };
}

export async function logoutSession(refreshToken: string | null) {
  if (!refreshToken) return;
  await db
    .update(identityRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(identityRefreshTokens.tokenHash, hashToken(refreshToken)));
}

export async function requestMagicLink(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.email, email));
  const token = await createChallenge(email, "magic", user?.id ?? null, 20);
  const link = `${appOrigin()}/login?magic=${token}`;
  await enqueueMail({ to: email, subject: "Your NihongoBridge magic link", body: `Sign in: ${link}`, kind: "magic" });
  return { ok: true as const, devLink: link };
}

export async function consumeMagicLink(token: string, userAgent?: string) {
  const [challenge] = await db
    .select()
    .from(identityChallenges)
    .where(and(eq(identityChallenges.tokenHash, hashToken(token)), eq(identityChallenges.kind, "magic")));
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "Link expired", status: 400 };
  }
  let [user] = challenge.userId
    ? await db.select().from(identityUsers).where(eq(identityUsers.id, challenge.userId))
    : [];
  if (!user) {
    const created = await registerUser({
      email: challenge.email,
      name: challenge.email.split("@")[0] || "Traveler",
      password: randomBytes(12).toString("hex") + "Aa1!",
    });
    if (!created.ok) return created;
    [user] = await db.select().from(identityUsers).where(eq(identityUsers.email, challenge.email));
  }
  await db.update(identityChallenges).set({ consumedAt: new Date() }).where(eq(identityChallenges.id, challenge.id));
  await db.update(identityUsers).set({ emailVerifiedAt: new Date() }).where(eq(identityUsers.id, user!.id));
  return { ok: true as const, ...(await issueTokens(user!, userAgent)) };
}

export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.email, email));
  const token = await createChallenge(email, "reset", user?.id ?? null, 30);
  const link = `${appOrigin()}/reset-password?token=${token}`;
  await enqueueMail({ to: email, subject: "Reset your password", body: `Reset: ${link}`, kind: "reset" });
  return { ok: true as const, devLink: link };
}

export async function resetPassword(token: string, password: string) {
  if (password.length < 8) return { ok: false as const, error: "Password too short", status: 400 };
  const [challenge] = await db
    .select()
    .from(identityChallenges)
    .where(and(eq(identityChallenges.tokenHash, hashToken(token)), eq(identityChallenges.kind, "reset")));
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now() || !challenge.userId) {
    return { ok: false as const, error: "Reset link expired", status: 400 };
  }
  await db.update(identityUsers).set({ passwordHash: hashPassword(password) }).where(eq(identityUsers.id, challenge.userId));
  await db.update(identityChallenges).set({ consumedAt: new Date() }).where(eq(identityChallenges.id, challenge.id));
  return { ok: true as const };
}

export async function verifyEmail(token: string) {
  const [challenge] = await db
    .select()
    .from(identityChallenges)
    .where(and(eq(identityChallenges.tokenHash, hashToken(token)), eq(identityChallenges.kind, "verify")));
  if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() < Date.now() || !challenge.userId) {
    return { ok: false as const, error: "Verification link expired", status: 400 };
  }
  await db.update(identityUsers).set({ emailVerifiedAt: new Date() }).where(eq(identityUsers.id, challenge.userId));
  await db.update(identityChallenges).set({ consumedAt: new Date() }).where(eq(identityChallenges.id, challenge.id));
  return { ok: true as const };
}

export async function setupTotp(userId: string) {
  const secret = generateTotpSecret();
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, userId));
  if (!user) return { ok: false as const, error: "Missing user", status: 404 };
  await db.update(identityUsers).set({ totpSecret: secret, totpEnabled: false }).where(eq(identityUsers.id, userId));
  return { ok: true as const, secret, otpauth: otpauthUrl(user.email, secret) };
}

export async function enableTotp(userId: string, code: string) {
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, userId));
  if (!user?.totpSecret) return { ok: false as const, error: "Start setup first", status: 400 };
  if (!verifyTotp(user.totpSecret, code)) return { ok: false as const, error: "Invalid code", status: 400 };
  await db.update(identityUsers).set({ totpEnabled: true }).where(eq(identityUsers.id, userId));
  return { ok: true as const };
}

export async function disableTotp(userId: string, code: string) {
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, userId));
  if (!user?.totpSecret || !verifyTotp(user.totpSecret, code)) {
    return { ok: false as const, error: "Invalid code", status: 400 };
  }
  await db.update(identityUsers).set({ totpEnabled: false, totpSecret: null }).where(eq(identityUsers.id, userId));
  return { ok: true as const };
}

export async function listSessions(userId: string) {
  return db
    .select()
    .from(identityRefreshTokens)
    .where(and(eq(identityRefreshTokens.userId, userId), isNull(identityRefreshTokens.revokedAt)))
    .orderBy(desc(identityRefreshTokens.createdAt));
}

export async function revokeSession(userId: string, sessionId: string) {
  await db
    .update(identityRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(identityRefreshTokens.userId, userId), eq(identityRefreshTokens.id, sessionId)));
}

export async function upsertOAuthUser(input: { email: string; name: string; provider: string; providerAccountId: string }) {
  const email = input.email.trim().toLowerCase();
  let [user] = await db.select().from(identityUsers).where(eq(identityUsers.email, email));
  if (!user) {
    const id = uid("idn");
    await db.insert(identityUsers).values({
      id,
      email,
      name: input.name || email.split("@")[0] || "Student",
      role: "student",
      emailVerifiedAt: new Date(),
    });
    await ensureLearner(id, input.name || "Student");
    [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, id));
  }
  await db
    .insert(identityAccounts)
    .values({
      id: uid("acc"),
      userId: user!.id,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    })
    .onConflictDoNothing();
  return user!;
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, id));
  return user ?? null;
}

export async function listIdentityUsers() {
  return db.select().from(identityUsers).orderBy(desc(identityUsers.createdAt));
}

export async function updateIdentityUser(
  id: string,
  patch: Partial<Pick<typeof identityUsers.$inferInsert, "role" | "plan" | "status" | "institutionId">>,
) {
  if (patch.role && !isRole(patch.role)) return { ok: false as const, error: "Invalid role", status: 400 };
  if (patch.plan && !["free", "plus", "institution"].includes(patch.plan)) {
    return { ok: false as const, error: "Invalid plan", status: 400 };
  }
  await db.update(identityUsers).set(patch).where(eq(identityUsers.id, id));
  const [user] = await db.select().from(identityUsers).where(eq(identityUsers.id, id));
  return { ok: true as const, user };
}

export async function listInstitutions() {
  return db.select().from(institutions);
}

export { publicUser };
export type { Plan };
