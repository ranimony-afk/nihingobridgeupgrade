import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  authenticators,
  sessions,
  twoFactorCredentials,
  users,
  verificationTokens,
} from "@/db/schema";
import { createMfaChallenge } from "@/lib/auth/identity";
import { normalizeRole } from "@/lib/auth/permissions";
import { env, isFeatureConfigured } from "@/lib/env";

const providers = [
  ...(isFeatureConfigured("githubOAuth")
    ? [GitHub({ clientId: env.GITHUB_ID!, clientSecret: env.GITHUB_SECRET! })]
    : []),
  ...(isFeatureConfigured("googleOAuth")
    ? [Google({ clientId: env.GOOGLE_ID!, clientSecret: env.GOOGLE_SECRET! })]
    : []),
  ...(isFeatureConfigured("email")
    ? [Resend({ apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM! })]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  providers,
  session: {
    strategy: "database",
    maxAge: env.AUTH_SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST === "true",
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      const [databaseUser] = await db.select().from(users).where(eq(users.id, user.id!)).limit(1);
      if (!databaseUser || databaseUser.status === "suspended") return false;

      if ((account?.provider === "google" || account?.provider === "github" || account?.provider === "resend") && !databaseUser.emailVerified) {
        await db
          .update(users)
          .set({ emailVerified: new Date(), status: "active", updatedAt: new Date() })
          .where(eq(users.id, databaseUser.id));
      }

      const [mfa] = await db
        .select({ userId: twoFactorCredentials.userId })
        .from(twoFactorCredentials)
        .where(
          and(
            eq(twoFactorCredentials.userId, databaseUser.id),
            isNotNull(twoFactorCredentials.enabledAt),
          ),
        )
        .limit(1);

      if (mfa) {
        const challenge = await createMfaChallenge(databaseUser.id);
        return `/auth/two-factor?challenge=${encodeURIComponent(challenge)}`;
      }

      return true;
    },
    session({ session, user }) {
      if (session.user) {
        const enrichedUser = user as typeof user & { role?: string; status?: string };
        session.user.id = user.id;
        session.user.role = normalizeRole(enrichedUser.role);
        session.user.status = enrichedUser.status ?? "active";
      }
      return session;
    },
  },
});
