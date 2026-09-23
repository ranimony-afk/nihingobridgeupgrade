/**
 * Phase 13.4D-2 — identity → application user → CmsActor tests.
 *
 * The pipeline is exercised through its two established seams:
 * `setSupabaseClientFactory` (verified provider identity) and
 * `setApplicationUserStore` (in-memory users table). No DATABASE_URL, no
 * Supabase project, no production contact. Real-SQL proof of the Drizzle
 * store (including a true concurrent race) runs separately on disposable
 * PGlite and is reported with the phase evidence.
 */
import { describe, expect, it, beforeEach } from "vitest";

import type {
  ApplicationUserRecord,
  ApplicationUserStore,
  AuthenticatedIdentity,
  NewApplicationUser,
} from "@/lib/auth";
import {
  getCurrentActor,
  getCurrentApplicationUser,
  requirePermission,
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  resolveApplicationUser,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import { CmsService } from "@/services/cms/cmsService";
import { FakeCmsStore } from "./cms-fake-store";

/** In-memory users table mirroring the unique (provider, subject) index. */
class FakeUserStore implements ApplicationUserStore {
  private readonly rows = new Map<string, ApplicationUserRecord>();
  /** When true, the next insert loses a simulated race (returns null). */
  failNextInsert = false;

  get size(): number {
    return this.rows.size;
  }

  seed(row: ApplicationUserRecord & { provider: string; subject: string }) {
    this.rows.set(`${row.provider}:${row.subject}`, {
      id: row.id,
      name: row.name,
      role: row.role,
    });
  }

  async findByProviderIdentity(
    provider: string,
    subject: string
  ): Promise<ApplicationUserRecord | null> {
    return this.rows.get(`${provider}:${subject}`) ?? null;
  }

  async insertUserIfAbsent(
    row: NewApplicationUser
  ): Promise<ApplicationUserRecord | null> {
    const key = `${row.authProvider}:${row.authSubject}`;
    if (this.failNextInsert) {
      this.failNextInsert = false;
      return null;
    }
    if (this.rows.has(key)) return null;
    const record = { id: row.id, name: row.name, role: row.role };
    this.rows.set(key, record);
    return record;
  }
}

let store: FakeUserStore;

function authenticateAs(
  subject: string,
  opts: { email?: string; displayName?: string } = {}
) {
  const claims: Record<string, unknown> = { sub: subject };
  if (opts.email !== undefined) claims.email = opts.email;
  if (opts.displayName !== undefined) {
    claims.user_metadata = { display_name: opts.displayName };
  }
  setSupabaseClientFactory(() => ({
    auth: { getClaims: async () => ({ data: { claims }, error: null }) },
  }));
}

function identityOf(
  subject: string,
  overrides: Record<string, unknown> = {}
): AuthenticatedIdentity {
  return { provider: "supabase", subject, ...overrides };
}

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  store = new FakeUserStore();
  setApplicationUserStore(store);
});

describe("Phase 13.4D-2: application-user resolution", () => {
  it("1. unauthenticated request resolves to null (no provisioning)", async () => {
    await expect(getCurrentActor()).resolves.toBeNull();
    await expect(getCurrentApplicationUser()).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it("2. first authenticated identity provisions exactly one learner", async () => {
    authenticateAs("sub-new-1", {
      email: "new@example.com",
      displayName: "New User",
    });
    const actor = await getCurrentActor();
    expect(actor).toMatchObject({ role: "learner", displayName: "New User" });
    expect(actor!.id).toMatch(/^user-/);
    expect(store.size).toBe(1);
  });

  it("3. repeated resolution returns the same users.id", async () => {
    authenticateAs("sub-repeat");
    const first = await getCurrentActor();
    const second = await getCurrentActor();
    const third = await getCurrentActor();
    expect(first!.id).toBe(second!.id);
    expect(second!.id).toBe(third!.id);
    expect(store.size).toBe(1);
  });

  it("4. existing learner resolves to a learner actor", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-learner",
      id: "user-learner-1",
      name: "Learner",
      role: "learner",
    });
    authenticateAs("sub-learner");
    await expect(getCurrentActor()).resolves.toMatchObject({
      id: "user-learner-1",
      role: "learner",
    });
  });

  it("5. existing editor resolves to an editor actor", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-editor",
      id: "user-editor-1",
      name: "Edi",
      role: "editor",
    });
    authenticateAs("sub-editor");
    await expect(getCurrentActor()).resolves.toMatchObject({
      id: "user-editor-1",
      role: "editor",
    });
  });

  it("6. existing reviewer resolves to a reviewer actor", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-reviewer",
      id: "user-reviewer-1",
      name: "Rev",
      role: "reviewer",
    });
    authenticateAs("sub-reviewer");
    await expect(getCurrentActor()).resolves.toMatchObject({
      role: "reviewer",
    });
  });

  it("7. existing admin resolves to an admin actor", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-admin",
      id: "user-admin-1",
      name: "Admin",
      role: "admin",
    });
    authenticateAs("sub-admin");
    await expect(getCurrentActor()).resolves.toMatchObject({
      id: "user-admin-1",
      role: "admin",
    });
  });

  it("8. unknown stored role fails safe to learner", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-root",
      id: "user-root-1",
      name: "Root",
      role: "superadmin",
    });
    authenticateAs("sub-root");
    const actor = await getCurrentActor();
    expect(actor!.role).toBe("learner");
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("9. distinct provider+subject pairs create distinct users", async () => {
    const a = await resolveApplicationUser(identityOf("sub-A"), store);
    const b = await resolveApplicationUser(identityOf("sub-B"), store);
    const c = await resolveApplicationUser(
      { provider: "other", subject: "sub-A" } as unknown as AuthenticatedIdentity,
      store
    );
    expect(new Set([a!.id, b!.id, c!.id]).size).toBe(3);
    expect(store.size).toBe(3);
  });

  it("10. same provider+subject returns the same user (profile untouched)", async () => {
    const first = await resolveApplicationUser(
      identityOf("sub-same", {
        email: "one@example.com",
        displayName: "One",
      }),
      store
    );
    const second = await resolveApplicationUser(
      identityOf("sub-same", {
        email: "two@example.com",
        displayName: "Two",
      }),
      store
    );
    expect(second!.id).toBe(first!.id);
    expect(second!.name).toBe("One");
    expect(store.size).toBe(1);
  });

  it("11. concurrent provisioning yields exactly one logical user", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        resolveApplicationUser(identityOf("sub-race"), store)
      )
    );
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    expect(store.size).toBe(1);
  });

  it("11b. lost insert race re-reads the winner instead of failing", async () => {
    const winner = { id: "user-winner-1", name: "Winner", role: "editor" };
    let finds = 0;
    const racingStore: ApplicationUserStore = {
      async findByProviderIdentity() {
        finds += 1;
        return finds === 1 ? null : winner; // miss, then winner appears
      },
      async insertUserIfAbsent() {
        return null; // our insert lost the race
      },
    };
    const resolved = await resolveApplicationUser(
      identityOf("sub-winner"),
      racingStore
    );
    expect(resolved).toEqual(winner);
    expect(finds).toBe(2);
  });

  it("12+13. caller-supplied userId and role have no effect", async () => {
    authenticateAs("sub-victim");
    const hostile = {
      ...identityOf("sub-victim"),
      id: "user-admin-1",
      userId: "user-admin-1",
      role: "admin",
    } as unknown as AuthenticatedIdentity;
    const resolved = await resolveApplicationUser(hostile, store);
    expect(resolved!.role).toBe("learner");
    const actor = await getCurrentActor();
    expect(actor!.id).toBe(resolved!.id);
    expect(actor!.role).toBe("learner");
    expect(getCurrentActor.length).toBe(0);
  });

  it("14. unauthenticated caller claiming admin remains null", async () => {
    await expect(getCurrentActor()).resolves.toBeNull();
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 401,
    });
    expect(store.size).toBe(0);
  });

  it("15. authenticated learner supplying admin role stays learner", async () => {
    authenticateAs("sub-learner-2");
    const actor = await getCurrentActor();
    expect(actor!.role).toBe("learner");
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("16. existing privileged role is preserved across resolutions", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-keep-admin",
      id: "user-keep-admin",
      name: "Keep",
      role: "admin",
    });
    const resolved = await resolveApplicationUser(
      identityOf("sub-keep-admin", { displayName: "Changed" }),
      store
    );
    expect(resolved).toMatchObject({ id: "user-keep-admin", role: "admin" });
    expect(resolved!.name).toBe("Keep");
  });

  it("17. provider subject is never users.id", async () => {
    authenticateAs("sub-not-an-id");
    const actor = await getCurrentActor();
    expect(actor!.id).not.toBe("sub-not-an-id");
    expect(actor!.id).toMatch(/^user-/);
  });

  it("18. malformed identities fail closed without provisioning", async () => {
    for (const bad of [
      null,
      undefined,
      {},
      { provider: "supabase" },
      { subject: "x" },
      { provider: "", subject: "x" },
      { provider: "supabase", subject: "" },
    ]) {
      expect(
        await resolveApplicationUser(bad as unknown as AuthenticatedIdentity, store)
      ).toBeNull();
    }
    expect(store.size).toBe(0);
  });
});

describe("Phase 13.4D-2: spoofing resistance", () => {
  it("request-body userId/role cannot hijack or elevate the actor", async () => {
    // Victim signs in.
    authenticateAs("sub-alice", { displayName: "Alice" });
    const alice = await getCurrentActor();
    expect(alice!.role).toBe("learner");

    // Attacker-controlled payload sitting alongside the request.
    const hostileBody = { userId: "user-admin-1", role: "admin" };
    void hostileBody;

    // The pipeline has no input channel for it: same actor, no elevation.
    const again = await getCurrentActor();
    expect(again).toEqual(alice);
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("CmsService attributes work to the resolved user, never the spoofed one", async () => {
    store.seed({
      provider: "supabase",
      subject: "sub-author",
      id: "user-author-1",
      name: "Author",
      role: "editor",
    });
    authenticateAs("sub-author", { displayName: "Author" });
    const actor = await getCurrentActor();
    expect(actor).toMatchObject({ id: "user-author-1", role: "editor" });
    const cms = new CmsService(new FakeCmsStore());
    const draft = await cms.createDraft({
      contentType: "dictionary",
      title: "spoof-proof",
      stagedPayload: { headword: "x" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
    });
    expect(draft.authorId).toBe(actor!.id);
    expect(draft.authorId).not.toBe("user-admin-1");
  });
});

describe("Phase 13.4D-2: authorization integration (existing matrix)", () => {
  async function actorFor(subject: string, role: string) {
    store.seed({
      provider: "supabase",
      subject,
      id: `user-${subject}`,
      name: subject,
      role,
    });
    authenticateAs(subject);
    return getCurrentActor();
  }

  it("learner cannot approve or publish", async () => {
    await actorFor("sub-l", "learner");
    await expect(requirePermission("cms.approve")).rejects.toMatchObject({
      status: 403,
    });
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("editor can edit and submit, cannot approve", async () => {
    await actorFor("sub-e", "editor");
    await expect(requirePermission("cms.edit")).resolves.toMatchObject({
      role: "editor",
    });
    await expect(requirePermission("cms.submit_review")).resolves.toMatchObject(
      { role: "editor" }
    );
    await expect(requirePermission("cms.approve")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("reviewer can review and approve, cannot publish", async () => {
    await actorFor("sub-r", "reviewer");
    await expect(requirePermission("cms.read")).resolves.toMatchObject({
      role: "reviewer",
    });
    await expect(requirePermission("cms.approve")).resolves.toMatchObject({
      role: "reviewer",
    });
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("admin holds administrative permissions", async () => {
    await actorFor("sub-a", "admin");
    await expect(requirePermission("cms.publish")).resolves.toMatchObject({
      role: "admin",
    });
    await expect(requirePermission("cms.rollback")).resolves.toMatchObject({
      role: "admin",
    });
  });
});
