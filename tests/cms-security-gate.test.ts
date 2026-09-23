/**
 * Phase 13.4E — Authentication & authorization security gate.
 *
 * Adversarial attack matrix A–Q against the 13.3A → 13.4D-2 boundary.
 * Every test is framed as an attack: anonymous caller, privilege grab,
 * spoofed identity, forged header, lifecycle bypass. All seams are the
 * established test doubles (setActorResolver / setSupabaseClientFactory /
 * setApplicationUserStore + FakeCmsStore); no production contact.
 *
 * Claim under test: there is NO input channel — body, query, header,
 * cookie, or provider metadata — through which a client can choose its
 * users.id, its Supabase subject, or its application role.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import type {
  ApplicationUserRecord,
  ApplicationUserStore,
} from "@/lib/auth/applicationUser";
import type { CmsRole } from "@/lib/auth";
import {
  getCurrentActor,
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setActorResolver,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import { CmsService } from "@/services/cms/cmsService";
import type { CreateDraftInput } from "@/services/cms/cmsService";
import { FakeCmsStore } from "./cms-fake-store";

const NOW = new Date("2026-06-01T12:00:00.000Z");

let store: FakeCmsStore;
let service: CmsService;
let idSeq: number;
let users: FakeUserStore;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  store = new FakeCmsStore();
  users = new FakeUserStore();
  setApplicationUserStore(users);
  idSeq = 0;
  service = new CmsService(store, {
    clock: () => new Date(NOW),
    generateId: (prefix) => `test-${prefix}-${++idSeq}`,
  });
});

function actAs(role: CmsRole, id = `${role}-1`) {
  setActorResolver(() => ({ id, role }));
}

/** Minimal in-memory application-user store (mirrors the 13.4D-2 fake). */
class FakeUserStore implements ApplicationUserStore {
  private rows = new Map<string, ApplicationUserRecord>();
  seed(provider: string, subject: string, row: ApplicationUserRecord) {
    this.rows.set(`${provider}:${subject}`, row);
  }
  async findByProviderIdentity(provider: string, subject: string) {
    return this.rows.get(`${provider}:${subject}`) ?? null;
  }
  count() {
    return this.rows.size;
  }
  async insertUserIfAbsent(row: {
    id: string;
    name: string;
    authProvider: string;
    authSubject: string;
    role: "learner";
  }) {
    const key = `${row.authProvider}:${row.authSubject}`;
    const existing = this.rows.get(key);
    if (existing) return null;
    const created = { id: row.id, name: row.name, role: row.role };
    this.rows.set(key, created);
    return created;
  }
}

/** Canned verified-claims client: null = anonymous, else the given claims. */
function authenticateAs(claims: Record<string, unknown> | null) {
  setSupabaseClientFactory(() => ({
    auth: {
      getClaims: async () =>
        claims === null
          ? { data: null, error: true }
          : { data: { claims }, error: null },
    },
  }));
}

function draftInput(overrides: Record<string, unknown> = {}): CreateDraftInput {
  return {
    contentType: "dictionary",
    entityId: null,
    title: "water",
    stagedPayload: { headword: "test", reading: "みず" },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    ...overrides,
  };
}

async function editorCreatesDraft(overrides: Record<string, unknown> = {}) {
  actAs("editor");
  return service.createDraft(draftInput(overrides));
}

async function driveToApproved() {
  const created = await editorCreatesDraft();
  actAs("editor");
  const submitted = await service.submitForReview(created.id, {
    expectedVersion: 1,
  });
  actAs("reviewer");
  return service.approve(submitted.id, { expectedVersion: 2 });
}

describe("13.4E attack matrix: anonymous and privilege escalation", () => {
  it("A. anonymous caller gets 401 on CMS read AND write", async () => {
    const created = await editorCreatesDraft();
    setActorResolver(() => null); // no authenticated identity
    await expect(service.getItem(created.id)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    await expect(service.createDraft(draftInput())).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    await expect(service.getAuditTrail(created.id)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("B. learner cannot perform editor operations", async () => {
    actAs("learner");
    await expect(service.createDraft(draftInput())).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    const created = await editorCreatesDraft();
    actAs("learner");
    await expect(
      service.updateDraft(created.id, {
        expectedVersion: 1,
        title: "hijacked",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("C. learner cannot perform admin operations", async () => {
    const created = await editorCreatesDraft();
    actAs("learner");
    await expect(
      service.rollback(created.id, { expectedVersion: 1, targetVersion: 1 })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.approveWithAdminOverride(created.id, {
        expectedVersion: 1,
        reason: "I am admin, trust me",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("D. editor cannot approve (no cms.approve)", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    const submitted = await service.submitForReview(created.id, {
      expectedVersion: 1,
    });
    await expect(
      service.approve(submitted.id, { expectedVersion: 2 })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("E. editor cannot publish", async () => {
    const approved = await driveToApproved();
    actAs("editor");
    await expect(
      service.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("F. reviewer cannot publish (no cms.publish)", async () => {
    const approved = await driveToApproved();
    actAs("reviewer");
    await expect(
      service.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("13.4E attack matrix: spoofing and forged identity", () => {
  it("G. client userId spoofing: hostile id fields never become attribution", async () => {
    actAs("editor", "user-real-editor");
    const hostile = draftInput({
      authorId: "user-victim",
      reviewerId: "user-victim",
      actorId: "user-victim",
      userId: "user-victim",
      user_id: "user-victim",
      createdById: "user-victim",
    }) as unknown as CreateDraftInput;
    const item = await service.createDraft(hostile);
    expect(item.authorId).toBe("user-real-editor");
    expect(item.reviewerId).toBeNull();
    const versions = await service.getVersions(item.id);
    expect(versions[0]?.createdById).toBe("user-real-editor");
  });

  it("H. client role spoofing: role in the payload confers nothing", async () => {
    // A reviewer smuggles role:"admin" in every input shape, then attempts
    // an admin-only operation. The payload role is ignored; the verified
    // actor role governs.
    const approved = await driveToApproved();
    actAs("reviewer", "user-sneaky");
    await expect(
      service.publish(approved.id, {
        expectedVersion: 3,
        role: "admin",
      } as unknown as { expectedVersion: number })
    ).rejects.toMatchObject({ status: 403 });
    // Even a forged resolver role string degrades to learner, never up.
    setActorResolver(() => ({ id: "user-forged", role: "superadmin" as CmsRole }));
    await expect(
      service.publish(approved.id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("I. forged identity header: no header/transport identity channel exists", async () => {
    // Decision modules must contain ZERO transport reads (comments stripped:
    // documentation may name transports, code may not touch them).
    const decisionFiles = [
      "src/lib/auth/actor.ts",
      "src/lib/auth/authorization.ts",
      "src/lib/auth/applicationUser.ts",
      "src/lib/auth/identity.ts",
      "src/lib/auth/index.ts",
      "src/services/cms/cmsService.ts",
      "src/services/cms/types.ts",
      "src/services/cms/validation.ts",
      "src/services/cms/errors.ts",
      "src/services/cms/stateMachine.ts",
    ];
    const transportTokens =
      /next\/headers|\.headers\.get|request\.headers|cookies\(\)|searchParams|request\.json\(|formData\(|req\.body|req\.query|getHeader\(|x-user-id|x-role|x-admin-key|ADMIN_API_SECRET|getSession\(|app_metadata/;
    for (const file of decisionFiles) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(`${file}: ${source}`).not.toMatch(transportTokens);
    }
    // Adapters (Supabase plumbing + callback) may move cookies, but must
    // never read identity from headers nor consult the unverified reader.
    const adapterFiles = [
      "src/lib/auth/supabase/client.ts",
      "src/lib/auth/supabase/server.ts",
      "src/lib/auth/supabase/proxy.ts",
      "proxy.ts",
      "src/app/auth/callback/route.ts",
    ];
    const adapterTokens =
      /getSession\(|\.headers\.get|getHeader\(|x-user|x-admin|ADMIN_API_SECRET|app_metadata/;
    for (const file of adapterFiles) {
      expect(`${file}: ${readFileSync(file, "utf8")}`).not.toMatch(
        adapterTokens
      );
    }
  });

  it("J. malformed identity resolves to anonymous through the real pipeline", async () => {
    // Verified-claims shape present but unusable: no sub, empty sub,
    // wrong-type sub. Each must yield null actor → 401, with no user row.
    for (const claims of [
      { email: "ghost@example.com" },
      { sub: "" },
      { sub: 12345 },
      { sub: ["sub-attacker"] },
    ]) {
      authenticateAs(claims as Record<string, unknown>);
      expect(await getCurrentActor()).toBeNull();
      await expect(service.createDraft(draftInput())).rejects.toMatchObject({
        status: 401,
      });
    }
    expect(users.count()).toBe(0);
  });

  it("K. unknown stored role fails closed to learner", async () => {
    users.seed("supabase", "sub-weird", {
      id: "user-weird",
      name: "Weird",
      role: "superadmin",
    });
    authenticateAs({ sub: "sub-weird" });
    const actor = await getCurrentActor();
    expect(actor).toMatchObject({ id: "user-weird", role: "learner" });
    await expect(service.createDraft(draftInput())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("L. provider/subject mismatch: attacker cannot reach another users.id", async () => {
    users.seed("supabase", "sub-victim", {
      id: "user-victim",
      name: "Victim",
      role: "admin",
    });
    users.seed("supabase", "sub-attacker", {
      id: "user-attacker",
      name: "Attacker",
      role: "learner",
    });
    // The attacker's own valid login resolves ONLY to the attacker's row —
    // there is no parameter to name the victim's subject or id.
    authenticateAs({ sub: "sub-attacker" });
    const actor = await getCurrentActor();
    expect(actor).toMatchObject({ id: "user-attacker", role: "learner" });
    // Same subject string under a different provider never aliases onto
    // the victim's admin row: lookup is by the full (provider, subject)
    // pair, and a miss provisions a fresh learner — it cannot return a
    // row it was not keyed to.
    const { resolveApplicationUser } = await import(
      "@/lib/auth/applicationUser"
    );
    const alien = await resolveApplicationUser(
      { provider: "other-provider", subject: "sub-victim" } as unknown as {
        provider: "supabase";
        subject: string;
      },
      users
    );
    expect(alien).not.toBeNull();
    expect(alien!.id).not.toBe("user-victim");
    expect(alien!.role).toBe("learner");
  });
});

describe("13.4E attack matrix: lifecycle and audit integrity", () => {
  it("M. self-approval is rejected, including for admins", async () => {
    actAs("admin", "user-admin-author");
    const created = await service.createDraft(draftInput());
    const submitted = await service.submitForReview(created.id, {
      expectedVersion: 1,
    });
    await expect(
      service.approve(submitted.id, { expectedVersion: 2 })
    ).rejects.toMatchObject({
      status: 403,
      code: "SELF_APPROVAL_FORBIDDEN",
    });
    // Status and version are untouched by the rejected attempt.
    actAs("reviewer");
    const untouched = await service.getItem(created.id);
    expect(untouched.status).toBe("review");
    expect(untouched.currentVersion).toBe(2);
  });

  it("N. admin override without reason fails; reviewers can never override", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    const submitted = await service.submitForReview(created.id, {
      expectedVersion: 1,
    });
    actAs("admin");
    await expect(
      service.approveWithAdminOverride(submitted.id, {
        expectedVersion: 2,
        reason: "",
      })
    ).rejects.toMatchObject({ status: 400 });
    actAs("reviewer");
    await expect(
      service.approveWithAdminOverride(submitted.id, {
        expectedVersion: 2,
        reason: "legitimate emergency",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("O. expectedVersion mismatch yields 409 and changes nothing", async () => {
    const created = await editorCreatesDraft();
    actAs("editor");
    await expect(
      service.updateDraft(created.id, {
        expectedVersion: 999,
        title: "stale write",
      })
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    const untouched = await service.getItem(created.id);
    expect(untouched.title).toBe("water");
    expect(untouched.currentVersion).toBe(1);
    expect((await service.getVersions(created.id)).length).toBe(1);
  });

  it("P. rollback is admin-only", async () => {
    const created = await editorCreatesDraft();
    for (const role of ["learner", "editor", "reviewer"] as const) {
      actAs(role);
      await expect(
        service.rollback(created.id, { expectedVersion: 1, targetVersion: 1 })
      ).rejects.toMatchObject({ status: 403 });
    }
    // Admin path still functions (proves the gate is authorization, not breakage).
    actAs("editor");
    await service.updateDraft(created.id, {
      expectedVersion: 1,
      title: "v2",
    });
    actAs("admin");
    const rolled = await service.rollback(created.id, {
      expectedVersion: 2,
      targetVersion: 1,
    });
    expect(rolled.currentVersion).toBe(3);
  });

  it("Q. audit actor identity comes only from the verified actor", async () => {
    actAs("editor", "user-real-editor");
    const hostile = draftInput({
      actorId: "user-ghost",
      authorId: "user-ghost",
    }) as unknown as CreateDraftInput;
    const item = await service.createDraft(hostile);
    actAs("editor", "user-real-editor");
    await service.submitForReview(item.id, {
      expectedVersion: 1,
      actorId: "user-ghost",
    } as unknown as { expectedVersion: number });
    actAs("reviewer", "user-real-reviewer");
    await service.requestChanges(item.id, {
      expectedVersion: 2,
      reason: "needs work",
      reviewerId: "user-ghost",
      actorId: "user-ghost",
    } as unknown as { expectedVersion: number; reason: string });
    const trail = await service.getAuditTrail(item.id);
    expect(trail.map((e) => e.actorId)).toEqual([
      "user-real-editor",
      "user-real-editor",
      "user-real-reviewer",
    ]);
    const returned = await service.getItem(item.id);
    expect(returned.reviewerId).toBe("user-real-reviewer");
  });
});
