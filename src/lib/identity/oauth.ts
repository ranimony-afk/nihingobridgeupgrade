import { upsertOAuthUser } from "./service";

export function oauthEnabled() {
  return {
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  };
}

export async function linkOAuthProfile(input: {
  email?: string | null;
  name?: string | null;
  provider?: string | null;
  providerAccountId?: string | null;
}) {
  if (!input.email || !input.provider || !input.providerAccountId) return null;
  return upsertOAuthUser({
    email: input.email,
    name: input.name || input.email.split("@")[0] || "Student",
    provider: input.provider,
    providerAccountId: input.providerAccountId,
  });
}
