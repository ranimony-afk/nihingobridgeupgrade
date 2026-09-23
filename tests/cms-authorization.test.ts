/**
 * Phase 13.3A — authorization foundation tests.
 *
 * Deterministic unit tests over the server-side authorization boundary.
 * Actors are injected via setActorResolver() (the seam the future real
 * authentication mechanism will plug into). No database, no production
 * contact, no secrets.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";

import type { CmsActor, CmsPermission, CmsRole } from "@/lib/auth";
import {
  AuthorizationError,
  CMS_PERMISSIONS,
  ROLE_PERMISSIONS,
  actorHasPermission,
  getCurrentActor,
  requirePermission,
  requireRole,
  resetActorResolver,
  rolePermissions,
  setActorResolver,
  toErrorPayload,
} from "@/lib/auth";

function actor(id: string, role: CmsRole, displayName?: string): CmsActor {
  return displayName ? { id, role, displayName } : { id, role };
}

beforeEach(() => {
  resetActorResolver();
});

describe("Phase 13.3A: CMS authorization foundation", () => {
  it("1. unauthenticated actor is rejected with 401", async () => {
    // Default resolver: no authentication mechanism wired yet.
    await expect(getCurrentActor()).resolves.toBeNull();
    const failure = await requirePermission("cms.read").catch((e) => e);
    expect(failure).toBeInstanceOf(AuthorizationError);
    expect(failure.status).toBe(401);
    expect(failure.code).toBe("UNAUTHENTICATED");
  });

  it("2. learner attempting a CMS action is rejected with 403", async () => {
    setActorResolver(() => actor("user-1", "learner"));
    const failure = await requirePermission("cms.create").catch((e) => e);
    expect(failure).toBeInstanceOf(AuthorizationError);
    expect(failure.status).toBe(403);
    expect(failure.code).toBe("FORBIDDEN");
  });

  it("3. editor reading CMS content is allowed", async () => {
    setActorResolver(() => actor("editor-1", "editor"));
    const resolved = await requirePermission("cms.read");
    expect(resolved.id).toBe("editor-1");
    expect(resolved.role).toBe("editor");
  });

  it("4. editor creating a draft is allowed", async () => {
    setActorResolver(() => actor("editor-1", "editor"));
    await expect(requirePermission("cms.create")).resolves.toMatchObject({
      role: "editor",
    });
  });

  it("5. editor approving is denied", async () => {
    setActorResolver(() => actor("editor-1", "editor"));
    await expect(requirePermission("cms.approve")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("6. reviewer approving is allowed", async () => {
    setActorResolver(() => actor("reviewer-1", "reviewer"));
    await expect(requirePermission("cms.approve")).resolves.toMatchObject({
      role: "reviewer",
    });
  });

  it("7. reviewer publishing is denied", async () => {
    setActorResolver(() => actor("reviewer-1", "reviewer"));
    await expect(requirePermission("cms.publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("8. admin publishing is allowed", async () => {
    setActorResolver(() => actor("admin-1", "admin"));
    await expect(requirePermission("cms.publish")).resolves.toMatchObject({
      role: "admin",
    });
  });

  it("9. admin rollback is allowed", async () => {
    setActorResolver(() => actor("admin-1", "admin"));
    await expect(requirePermission("cms.rollback")).resolves.toMatchObject({
      role: "admin",
    });
  });

  it("10. client-supplied fake role is ignored", async () => {
    // (a) Identity/role have no input channel: getCurrentActor takes zero
    // arguments, so no request value can ever reach the trust decision.
    expect(getCurrentActor.length).toBe(0);

    // (b) Even a forged role string reaching the boundary degrades to
    // learner (least privilege) instead of widening access.
    setActorResolver(() =>
      actor("attacker-1", "superadmin" as unknown as CmsRole)
    );
    const resolved = await getCurrentActor();
    expect(resolved?.role).toBe("learner");
    await expect(requirePermission("cms.read")).rejects.toMatchObject({
      status: 403,
    });
    expect(rolePermissions("superadmin")).toEqual([]);
  });

  it("11. client-supplied fake user ID is not treated as authentication", async () => {
    // With no server-side resolver result there is no actor — regardless of
    // any userId value an attacker may submit alongside the request (the
    // boundary accepts no such value; see getCurrentActor.length === 0).
    setActorResolver(() => null);
    await expect(getCurrentActor()).resolves.toBeNull();
    await expect(requirePermission("cms.read")).rejects.toMatchObject({
      status: 401,
    });

    // An identity-less resolver result is unauthenticated even with a
    // privileged role attached.
    setActorResolver(
      () => ({ id: "", role: "admin" }) as unknown as CmsActor
    );
    await expect(getCurrentActor()).resolves.toBeNull();
    await expect(requireRole("admin")).rejects.toMatchObject({ status: 401 });
  });

  it("12. permission checks remain server-side", () => {
    // Static boundary check: every auth module carries the server-only
    // marker (enforced by Next.js at build time), and none of them reads
    // environment secrets or defines an auth bypass.
    const sources = [
      "src/lib/auth/actor.ts",
      "src/lib/auth/authorization.ts",
      "src/lib/auth/index.ts",
    ].map((file) => ({ file, text: readFileSync(file, "utf8") }));
    for (const { file, text } of sources) {
      expect(text, `${file} must import server-only`).toContain("server-only");
      expect(text, `${file} must not read env`).not.toContain("process.env");
      expect(text, `${file} must not define an admin-key bypass`).not.toMatch(
        /ADMIN_API_SECRET|x-admin-key/i
      );
    }
  });

  it("role checks distinguish 401 from 403", async () => {
    await expect(requireRole("admin")).rejects.toMatchObject({ status: 401 });
    setActorResolver(() => actor("editor-1", "editor"));
    await expect(requireRole("admin")).rejects.toMatchObject({ status: 403 });
    await expect(
      requireRole("editor", "admin")
    ).resolves.toMatchObject({ role: "editor" });
  });

  it("permission matrix matches the specified role mapping", () => {
    expect(ROLE_PERMISSIONS.learner).toEqual([]);
    expect([...ROLE_PERMISSIONS.editor]).toEqual([
      "cms.read",
      "cms.create",
      "cms.edit",
      "cms.submit_review",
    ]);
    expect([...ROLE_PERMISSIONS.reviewer]).toEqual([
      "cms.read",
      "cms.approve",
      "cms.verify_translation",
    ]);
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual(
      [...CMS_PERMISSIONS].sort()
    );
    expect(CMS_PERMISSIONS).toHaveLength(10);
  });

  it("pure checks fail closed on null actors and unknown permissions", () => {
    expect(actorHasPermission(null, "cms.read")).toBe(false);
    expect(actorHasPermission(undefined, "cms.read")).toBe(false);
    expect(
      actorHasPermission(actor("admin-1", "admin"), "cms.nonexistent")
    ).toBe(false);
    expect(
      actorHasPermission(actor("admin-1", "admin"), "cms.publish")
    ).toBe(true);
  });

  it("unknown permission strings fail loud as programming errors", async () => {
    setActorResolver(() => actor("admin-1", "admin"));
    const failure = await requirePermission(
      "cms.nonexistent" as unknown as CmsPermission
    ).catch((e) => e);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AuthorizationError);
  });

  it("error payloads use the stable API shape without leaking detail", () => {
    const unauth = toErrorPayload(new AuthorizationError(401));
    expect(unauth.status).toBe(401);
    expect(unauth.body).toEqual({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication required." },
    });
    const forbidden = toErrorPayload(new AuthorizationError(403));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
    // Generic messages carry no specific role, permission code, or identity.
    expect(JSON.stringify(forbidden.body)).not.toMatch(
      /cms\.[a-z_]+|admin|editor|reviewer|learner|user-\d+/i
    );
  });

  it("resolved actors are frozen against downstream escalation", async () => {
    setActorResolver(() => actor("editor-1", "editor"));
    const resolved = await getCurrentActor();
    expect(Object.isFrozen(resolved)).toBe(true);
  });
});
