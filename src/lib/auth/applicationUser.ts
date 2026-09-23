import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { AuthenticatedIdentity } from "./identity";
import { getAuthenticatedIdentity } from "./identity";

/**
 * Application-user bridge — Phase 13.4D-2.
 *
 * Resolves the provider-independent `AuthenticatedIdentity` into the durable
 * application user (`users` row) that `CmsActor` is built from:
 *
 *   AuthenticatedIdentity { provider, subject }
 *     → find by (auth_provider, auth_subject)
 *     → if absent, provision exactly one learner row (race-safe)
 *     → ApplicationUser { id: users.id, role: users.role, name }
 *
 * Trust rules (non-negotiable):
 * - The ONLY input is the server-verified identity. No caller-supplied id,
 *   role, provider, or subject is ever accepted.
 * - New users are ALWAYS `learner`. Nothing — provider metadata, email
 *   domain, display name — can confer privilege.
 * - Existing rows are returned as-is: role and profile are never
 *   overwritten by this phase (identity resolution, not profile sync).
 * - Unknown stored roles are normalized to `learner` at the actor
 *   boundary (defense in depth: normalizeActor() also enforces this).
 *
 * Race safety: the unique (auth_provider, auth_subject) index is the final
 * arbiter. Provisioning is INSERT … ON CONFLICT DO NOTHING + re-read, so
 * N concurrent first-requests still yield exactly one logical user. A plain
 * transaction alone could not close this race; the constraint does.
 */

/** Minimal application-user shape the actor pipeline needs. */
export interface ApplicationUserRecord {
  readonly id: string;
  readonly name: string;
  /** Stored role string; normalized to CmsRole at the actor boundary. */
  readonly role: string;
}

/** Row the resolver provisions for a never-seen identity. */
export interface NewApplicationUser {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly authProvider: string;
  readonly authSubject: string;
  readonly role: "learner";
}

/**
 * Minimal persistence port. Implemented by the Drizzle store (production)
 * and by in-memory fakes (tests). No CMS knowledge, no Supabase knowledge.
 */
export interface ApplicationUserStore {
  findByProviderIdentity(
    provider: string,
    subject: string
  ): Promise<ApplicationUserRecord | null>;
  /**
   * Insert unless the identity already exists. Returns the inserted row, or
   * null when the unique identity lost a provisioning race (caller re-reads).
   */
  insertUserIfAbsent(
    row: NewApplicationUser
  ): Promise<ApplicationUserRecord | null>;
}

type Database = typeof db;

/** Production store over a Drizzle pg executor. */
export function createDrizzleApplicationUserStore(
  database: Database
): ApplicationUserStore {
  return {
    async findByProviderIdentity(provider, subject) {
      const rows = await database
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(
          and(
            eq(users.authProvider, provider),
            eq(users.authSubject, subject)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async insertUserIfAbsent(row) {
      const rows = await database
        .insert(users)
        .values({
          id: row.id,
          name: row.name,
          email: row.email,
          authProvider: row.authProvider,
          authSubject: row.authSubject,
          role: row.role,
        })
        .onConflictDoNothing({
          target: [users.authProvider, users.authSubject],
        })
        .returning({ id: users.id, name: users.name, role: users.role });
      return rows[0] ?? null;
    },
  };
}

const defaultStore = createDrizzleApplicationUserStore(db);

/**
 * Test seam (mirrors the established setActorResolver /
 * setSupabaseClientFactory patterns): deterministic unit tests inject an
 * in-memory store; production uses the Drizzle store above.
 */
let storeOverride: ApplicationUserStore | null = null;

export function setApplicationUserStore(store: ApplicationUserStore): void {
  storeOverride = store;
}

export function resetApplicationUserStore(): void {
  storeOverride = null;
}

function currentStore(): ApplicationUserStore {
  return storeOverride ?? defaultStore;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Deterministic initial display name for provisioning. users.name is NOT
 * NULL, so a fallback chain is required — all deterministic, none
 * privilege-bearing, none persisted over an existing row.
 */
function initialNameFor(
  identity: Pick<AuthenticatedIdentity, "displayName" | "email" | "subject">
): string {
  const fromIdentity = asNonEmptyString(identity.displayName);
  if (fromIdentity) return fromIdentity;
  const email = asNonEmptyString(identity.email);
  if (email) {
    const localPart = email.split("@")[0];
    if (localPart) return localPart;
  }
  return `user-${identity.subject.slice(0, 8)}`;
}

/**
 * Resolve a verified identity to its application user, provisioning a
 * learner row when absent. Total and fail-closed: malformed identities
 * return null and never touch the database.
 */
export async function resolveApplicationUser(
  identity: AuthenticatedIdentity,
  store: ApplicationUserStore = currentStore()
): Promise<ApplicationUserRecord | null> {
  const provider = asNonEmptyString(
    (identity as { provider?: unknown } | null)?.provider
  );
  const subject = asNonEmptyString(
    (identity as { subject?: unknown } | null)?.subject
  );
  if (!provider || !subject) return null;

  const existing = await store.findByProviderIdentity(provider, subject);
  if (existing) return existing;

  const created = await store.insertUserIfAbsent({
    id: `user-${randomUUID()}`,
    name: initialNameFor(identity),
    email: asNonEmptyString(identity.email) ?? null,
    authProvider: provider,
    authSubject: subject,
    role: "learner",
  });
  if (created) return created;

  // Lost a provisioning race: the winner's row is authoritative.
  return store.findByProviderIdentity(provider, subject);
}

/**
 * Current request's application user, or null when unauthenticated.
 * Takes NO arguments. Never provisions for anonymous requests:
 * provisioning happens only after verified identity exists.
 */
export async function getCurrentApplicationUser(): Promise<ApplicationUserRecord | null> {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return null;
  return resolveApplicationUser(identity);
}
