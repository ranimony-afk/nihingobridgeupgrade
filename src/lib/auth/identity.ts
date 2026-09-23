import "server-only";

/**
 * Provider-independent authenticated identity — Phase 13.4C-1.
 *
 * This module is the seam between Supabase Auth (provider-specific, kept in
 * ./supabase/*) and everything above it. It answers exactly one question:
 *
 *   "This request has been authenticated as WHICH provider subject?"
 *
 * It deliberately does NOT answer "what may this user do" — there is no
 * role here, no CmsActor here (Phase 13.4D), and no application user lookup
 * (the users table stays untouched in this phase).
 *
 * Verification follows current official Supabase guidance: identity comes
 * from `auth.getClaims()`, which verifies the access token signature on
 * every call (locally via cached JWKS on asymmetric-signing projects, the
 * default for new projects). The raw cookie-session reader is never used
 * for auth decisions — it reads the cookie without revalidating it.
 *
 * Fail-closed in every direction: missing configuration, provider errors,
 * thrown exceptions, and malformed claim shapes all resolve to `null`
 * (unauthenticated), never to a partial or guessed identity.
 */

/** Minimal structural surface this module needs from a Supabase client. */
export interface ClaimsCapableClient {
  auth: {
    getClaims: () => Promise<{ data: unknown; error: unknown }>;
  };
}

export type SupabaseClientFactory = () =>
  | Promise<ClaimsCapableClient>
  | ClaimsCapableClient;

/**
 * Test seam (mirrors the 13.3A `setActorResolver` pattern): deterministic
 * unit tests inject canned clients; production always uses the default
 * cookie-backed server client. Server-only by module construction.
 */
let clientFactoryOverride: SupabaseClientFactory | null = null;

export function setSupabaseClientFactory(
  factory: SupabaseClientFactory
): void {
  clientFactoryOverride = factory;
}

export function resetSupabaseClientFactory(): void {
  clientFactoryOverride = null;
}

/**
 * Provider-independent authenticated identity. `subject` is the stable
 * provider subject (Supabase `sub` claim). Contact/display fields are
 * optional hints only — never authorization inputs.
 */
export interface AuthenticatedIdentity {
  readonly provider: "supabase";
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Normalize verified JWT claims into an AuthenticatedIdentity.
 * Pure and total: anything that is not a well-formed claim set with a
 * non-empty `sub` returns null. Unknown extra claims are ignored.
 */
export function normalizeSupabaseIdentity(
  claims: unknown
): AuthenticatedIdentity | null {
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
    return null;
  }
  const record = claims as Record<string, unknown>;
  const subject = asNonEmptyString(record.sub);
  if (!subject) return null;

  const identity: {
    provider: "supabase";
    subject: string;
    email?: string;
    displayName?: string;
  } = { provider: "supabase", subject };

  const email = asNonEmptyString(record.email);
  if (email) identity.email = email;

  const metadata = record.user_metadata;
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata)
  ) {
    const meta = metadata as Record<string, unknown>;
    const displayName =
      asNonEmptyString(meta.display_name) ??
      asNonEmptyString(meta.full_name) ??
      asNonEmptyString(meta.name);
    if (displayName) identity.displayName = displayName;
  }

  return identity;
}

async function defaultClientFactory(): Promise<ClaimsCapableClient> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    // No Supabase project configured: report unauthenticated without
    // touching cookie scope (safe in tests, builds, and plain dev).
    return {
      auth: {
        getClaims: async () => ({ data: null, error: true }),
      },
    };
  }
  // Dynamic import keeps `next/headers` (via ./supabase/server) out of the
  // static import graph, so unit tests can exercise this module without a
  // Next.js request scope. Production always resolves the real client.
  const { createServerSupabaseClient } = await import("./supabase/server");
  return createServerSupabaseClient();
}

/**
 * Current request's verified identity, or null when unauthenticated.
 * Takes NO arguments: the session comes solely from the server-side
 * cookie-backed Supabase client. Never consults caller-supplied values.
 */
export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  try {
    const factory = clientFactoryOverride ?? defaultClientFactory;
    const client = await factory();
    const { data, error } = await client.auth.getClaims();
    if (error) return null;
    if (typeof data !== "object" || data === null) return null;
    return normalizeSupabaseIdentity(
      (data as { claims?: unknown }).claims
    );
  } catch {
    return null;
  }
}
