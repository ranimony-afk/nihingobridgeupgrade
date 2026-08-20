import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, staffUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/audit/crypto";
import { setIdentityCookies } from "@/lib/identity/cookies";
import { oauthEnabled, linkOAuthProfile } from "@/lib/identity/oauth";
import { issueTokens } from "@/lib/identity/service";
import { authSecret, getEnv } from "@/lib/infra/env";
import { logger } from "@/lib/infra/logger";
import { uid } from "@/lib/utils";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: authSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/admin/login" },
  providers: [
    ...(oauthEnabled().google
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
    ...(oauthEnabled().github
      ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET })]
      : []),
    Credentials({
      name: "Staff credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
        if (!staff || !verifyPassword(password, staff.passwordHash)) return null;
        try {
          await db.insert(authSessions).values({
            id: uid("ses"),
            staffId: staff.id,
            provider: "credentials",
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          });
        } catch (error) {
          logger.warn("auth.session_row_failed", {
            message: error instanceof Error ? error.message : "unknown",
          });
        }
        return { id: staff.id, email: staff.email, name: staff.name, role: staff.role };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" || account?.provider === "github") {
        const linked = await linkOAuthProfile({
          email: user.email,
          name: user.name,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });
        if (linked) {
          const tokens = await issueTokens(linked);
          await setIdentityCookies({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            learnerId: tokens.user.learnerId,
          });
        }
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as { role?: string }).role ?? "editor";
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      const user = session.user as typeof session.user & { id: string; role: string };
      user.id = token.sub ?? "";
      user.role = typeof token.role === "string" ? token.role : "editor";
      user.email = token.email ?? user.email;
      user.name = token.name ?? user.name;
      session.user = user;
      return session;
    },
  },
});

export function publicAppUrl() {
  return getEnv().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
