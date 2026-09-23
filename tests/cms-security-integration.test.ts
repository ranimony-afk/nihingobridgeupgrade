/**
 * Phase 13.5E — CMS security & integration gate.
 *
 * Fail-closed verification that identity → actor → permission → service →
 * transaction → audit → review UI form one secure system. Runtime tests run
 * over FakeCmsStore (disposable, never production); architectural invariants
 * are proven by static scans interpreted contextually.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  actorHasPermission,
  getCurrentActor,
  requirePermission,
  resetActorResolver,
  rolePermissions,
  setActorResolver,
  AuthorizationError,
} from "@/lib/auth";
import type { CmsRole } from "@/lib/auth";
import {
  normalizeSupabaseIdentity,
  getAuthenticatedIdentity,
  setSupabaseClientFactory,
  resetSupabaseClientFactory,
} from "@/lib/auth/identity";
import {
  resolveApplicationUser,
} from "@/lib/auth/applicationUser";
import type {
  ApplicationUserRecord,
  ApplicationUserStore,
} from "@/lib/auth/applicationUser";
import { getAdminCapabilities } from "@/lib/cms-admin/server";
import {
  VERSION_CONFLICT_MESSAGE,
  interpretApiResponse,
} from "@/lib/cms-admin/api";
import { visibleActions } from "@/lib/cms-admin/actions";
import {
  canTransition,
  getCmsService,
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import { FakeCmsStore, FailingCmsStore } from "./cms-fake-store";

import { GET as dictListGET, POST as dictCreatePOST } from "@/app/api/cms/dictionary/route";
import { GET as dictGET, PATCH as dictPATCH } from "@/app/api/cms/dictionary/[id]/route";
import { POST as dictSubmitPOST } from "@/app/api/cms/dictionary/[id]/submit/route";
import { POST as dictRequestChangesPOST } from "@/app/api/cms/dictionary/[id]/request-changes/route";
import { POST as dictApprovePOST } from "@/app/api/cms/dictionary/[id]/approve/route";
import { POST as dictOverridePOST } from "@/app/api/cms/dictionary/[id]/approve-override/route";
import { POST as dictSchedulePOST } from "@/app/api/cms/dictionary/[id]/schedule/route";
import { POST as dictPublishPOST } from "@/app/api/cms/dictionary/[id]/publish/route";
import { POST as dictArchivePOST } from "@/app/api/cms/dictionary/[id]/archive/route";
import { POST as dictRollbackPOST } from "@/app/api/cms/dictionary/[id]/rollback/route";
import { GET as dictVersionsGET } from "@/app/api/cms/dictionary/[id]/versions/route";
import { GET as dictAuditGET } from "@/app/api/cms/dictionary/[id]/audit/route";
import { POST as transCreatePOST } from "@/app/api/cms/translations/route";
import { GET as transGET } from "@/app/api/cms/translations/[id]/route";
import { POST as transSubmitPOST } from "@/app/api/cms/translations/[id]/submit/route";
import { POST as transApprovePOST } from "@/app/api/cms/translations/[id]/approve/route";
import { POST as transVerifyPOST } from "@/app/api/cms/translations/[id]/verify/route";
import { GET as transVersionsGET } from "@/app/api/cms/translations/[id]/versions/route";
import { GET as transAuditGET } from "@/app/api/cms/translations/[id]/audit/route";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

let store: FakeCmsStore;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetCmsDatabaseOverride();
  store = new FakeCmsStore();
  setCmsDatabaseOverride(store);
  store.seedCanonicalEntity("dictionary", "dict-1");
});

afterEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetCmsDatabaseOverride();
});

function actAs(role: CmsRole, id?: string) {
  setActorResolver(() => ({ id: id ?? `${role}-1`, role }));
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function readJson(response: Response) {
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

function jsonRequest(url: string, method: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const DICT_DRAFT = {
  title: "water",
  stagedPayload: { headword: "水", reading: "みず" },
  sourceRef: "first-party:test:v1",
  provenanceType: "editorial_curated",
  entityId: null,
};

const TRANS_DRAFT = {
  title: "Tamil gloss",
  entityId: "dict-1",
  stagedPayload: {
    entityType: "dictionary",
    language: "ta",
    translatedText: "தண்ணீர்",
    sourceRef: "test:tamil-lexicon:v1",
  },
  sourceRef: "first-party:test:v1",
  provenanceType: "editorial_curated",
};

async function createDictId(): Promise<string> {
  actAs("editor");
  const res = await readJson(
    await dictCreatePOST(jsonRequest("http://localhost/x", "POST", DICT_DRAFT))
  );
  expect(res.status).toBe(201);
  return (res.json.data as { id: string }).id;
}

async function seedReviewDictId(): Promise<string> {
  const id = await createDictId();
  actAs("editor");
  const res = await readJson(
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(id)
    )
  );
  expect(res.status).toBe(200);
  return id;
}

async function seedApprovedDictId(): Promise<string> {
  const id = await seedReviewDictId();
  actAs("reviewer");
  const res = await readJson(
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(id)
    )
  );
  expect(res.status).toBe(200);
  return id;
}

async function seedApprovedTransId(): Promise<string> {
  actAs("editor");
  const created = await readJson(
    await transCreatePOST(jsonRequest("http://localhost/x", "POST", TRANS_DRAFT))
  );
  expect(created.status).toBe(201);
  const id = (created.json.data as { id: string }).id;
  const submitted = await readJson(
    await transSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(id)
    )
  );
  expect(submitted.status).toBe(200);
  actAs("reviewer");
  const approved = await readJson(
    await transApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(id)
    )
  );
  expect(approved.status).toBe(200);
  return id;
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Authentication (1-6)                              */
/* ------------------------------------------------------------------ */

describe("13.5E authentication (1-6)", () => {
  it("1-2. anonymous queue + detail blocked at the server gate", async () => {
    setActorResolver(() => null);
    expect(await getAdminCapabilities()).toMatchObject({
      ok: false,
      reason: "unauthenticated",
    });
    // Both pages share the identical gate (detail never trusts the queue).
    for (const page of [
      "src/app/admin/review/page.tsx",
      "src/app/admin/review/[id]/page.tsx",
    ]) {
      const code = readFileSync(page, "utf8");
      expect(code).toContain("getAdminCapabilities()");
      expect(code).toContain("<GateCard");
    }
  });

  it("3. anonymous API blocked", async () => {
    setActorResolver(() => null);
    const res = await readJson(await dictListGET(new Request("http://localhost/x")));
    expect(res.status).toBe(401);
  });

  it("4. authenticated learner blocked", async () => {
    actAs("learner");
    expect(await getAdminCapabilities()).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    const res = await readJson(await dictListGET(new Request("http://localhost/x")));
    expect(res.status).toBe(403);
  });

  it("5-6. reviewer + admin allowed", async () => {
    for (const role of ["reviewer", "admin"] as const) {
      actAs(role);
      expect((await getAdminCapabilities()).ok).toBe(true);
      const res = await readJson(await dictListGET(new Request("http://localhost/x")));
      expect(res.status).toBe(200);
    }
  });
});

/* ------------------------------------------------------------------ */
/* identity chain unit proofs (§4)                                     */
/* ------------------------------------------------------------------ */

describe("13.5E auth chain units", () => {
  it("claims normalize fail-closed; unknown roles degrade to learner", async () => {
    expect(normalizeSupabaseIdentity({ sub: "s1", email: "a@b.c" })).toMatchObject({
      provider: "supabase",
      subject: "s1",
    });
    expect(normalizeSupabaseIdentity({})).toBeNull();
    expect(normalizeSupabaseIdentity({ sub: "" })).toBeNull();
    expect(normalizeSupabaseIdentity(null)).toBeNull();
    setSupabaseClientFactory(() => ({
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: "s9" } },
          error: null,
        }),
      },
    }));
    expect(await getAuthenticatedIdentity()).toMatchObject({ subject: "s9" });
    setSupabaseClientFactory(() => ({
      auth: { getClaims: async () => ({ data: null, error: true }) },
    }));
    expect(await getAuthenticatedIdentity()).toBeNull();
  });

  it("application users provision as learner; existing rows returned as-is", async () => {
    const rows = new Map<string, ApplicationUserRecord>();
    const memStore: ApplicationUserStore = {
      findByProviderIdentity: async (provider, subject) =>
        rows.get(`${provider}:${subject}`) ?? null,
      insertUserIfAbsent: async (row) => {
        const key = `${row.authProvider}:${row.authSubject}`;
        if (rows.has(key)) return null;
        const record = { id: row.id, name: row.name, role: row.role };
        rows.set(key, record);
        return record;
      },
    };
    const fresh = await resolveApplicationUser(
      { provider: "supabase", subject: "new-sub" },
      memStore
    );
    expect(fresh?.role).toBe("learner");
    rows.set("supabase:vip", { id: "u-vip", name: "Vip", role: "admin" });
    const existing = await resolveApplicationUser(
      { provider: "supabase", subject: "vip" },
      memStore
    );
    expect(existing).toMatchObject({ id: "u-vip", role: "admin" });
    expect(await resolveApplicationUser({} as never, memStore)).toBeNull();
  });

  it("permission checks fail closed on unknown roles/permissions/actors", async () => {
    expect(rolePermissions("superadmin")).toEqual([]);
    expect(actorHasPermission(null, "cms.read")).toBe(false);
    expect(actorHasPermission({ id: "", role: "admin" }, "cms.read")).toBe(false);
    expect(actorHasPermission({ id: "a", role: "admin" }, "cms.nonsense")).toBe(false);
    setActorResolver(() => ({ id: "x", role: "superadmin" as CmsRole }));
    const degraded = await getCurrentActor();
    expect(degraded?.role).toBe("learner");
    await expect(requirePermission("cms.read")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requirePermission("cms.nonsense" as never)
    ).rejects.toThrow("Unknown CMS permission");
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Identity spoofing (7-10)                          */
/* ------------------------------------------------------------------ */

describe("13.5E identity spoofing (7-10)", () => {
  it("7. forged userId/body authorId ignored; seam actor authoritative", async () => {
    actAs("editor");
    const res = await readJson(
      await dictCreatePOST(
        jsonRequest("http://localhost/x?userId=admin-1&role=admin&actorId=admin-1", "POST", {
          ...DICT_DRAFT,
          authorId: "admin-1",
          actorId: "admin-1",
          role: "admin",
        })
      )
    );
    expect(res.status).toBe(201);
    const item = res.json.data as { id: string; authorId: string };
    expect(item.authorId).toBe("editor-1");
    const audits = await store.listAuditEvents(item.id);
    expect(audits[0]?.actorId).toBe("editor-1");
  });

  it("8. forged actorId cannot reassign audit/review actors", async () => {
    const id = await seedReviewDictId();
    actAs("reviewer");
    const res = await readJson(
      await dictApprovePOST(
        jsonRequest("http://localhost/x?actorId=editor-1", "POST", {
          expectedVersion: 2,
          actorId: "editor-1",
        }),
        ctx(id)
      )
    );
    expect(res.status).toBe(200);
    expect((res.json.data as { reviewerId: string }).reviewerId).toBe("reviewer-1");
    const audits = await store.listAuditEvents(id);
    expect(audits[audits.length - 1]).toMatchObject({
      actorId: "reviewer-1",
      action: "approve",
    });
  });

  it("9. forged role never escalates (Cases A + B)", async () => {
    const id = await seedApprovedDictId();
    // Case A: editor + role=admin still cannot publish.
    actAs("editor");
    const editorTry = await readJson(
      await dictPublishPOST(
        jsonRequest("http://localhost/x?role=admin", "POST", {
          expectedVersion: 3,
          role: "admin",
        }),
        ctx(id)
      )
    );
    expect(editorTry.status).toBe(403);
    // Case B: learner + role=admin stays blocked.
    actAs("learner");
    const learnerTry = await readJson(
      await dictListGET(new Request("http://localhost/x?role=admin"))
    );
    expect(learnerTry.status).toBe(403);
  });

  it("10. forged admin headers ignored; no secret bypass exists", async () => {
    setActorResolver(() => null);
    const anon = await readJson(
      await dictListGET(
        new Request("http://localhost/x", {
          headers: { "x-admin-key": "yes", "x-role": "admin" },
        })
      )
    );
    expect(anon.status).toBe(401);
    actAs("learner");
    const learner = await readJson(
      await dictCreatePOST(
        jsonRequest("http://localhost/x", "POST", DICT_DRAFT, {
          "x-admin-key": "yes",
          "x-actor-id": "admin-1",
        })
      )
    );
    expect(learner.status).toBe(403);
    for (const file of collectFiles("src")) {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(code).not.toContain("ADMIN_API_SECRET");
      expect(code).not.toContain("x-admin-key");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Permissions (11-17)                               */
/* ------------------------------------------------------------------ */

describe("13.5E permissions (11-17)", () => {
  it("11. editor cannot approve; author self-approval forbidden", async () => {
    const id = await seedReviewDictId();
    actAs("editor");
    const editorTry = await readJson(
      await dictApprovePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(editorTry.status).toBe(403);
    // Admin authored this one: self-approval rejected with policy code.
    actAs("admin", "admin-author");
    const created = await readJson(
      await dictCreatePOST(jsonRequest("http://localhost/x", "POST", DICT_DRAFT))
    );
    const ownId = (created.json.data as { id: string }).id;
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(ownId)
    );
    const selfTry = await readJson(
      await dictApprovePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
        ctx(ownId)
      )
    );
    expect(selfTry.status).toBe(403);
    expect(selfTry.json).toMatchObject({
      error: { code: "SELF_APPROVAL_FORBIDDEN" },
    });
  });

  it("12. reviewer approves where authorized", async () => {
    const id = await seedReviewDictId();
    actAs("reviewer");
    const res = await readJson(
      await dictApprovePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ status: "approved", currentVersion: 3 });
  });

  it("13-16. reviewer denied publish/schedule/archive/rollback", async () => {
    const id = await seedApprovedDictId();
    actAs("reviewer");
    const attempts = [
      dictPublishPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
        ctx(id)
      ),
      dictSchedulePOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 3,
          scheduledAt: "2030-01-01T00:00:00.000Z",
        }),
        ctx(id)
      ),
    ];
    for (const attempt of attempts) {
      expect((await readJson(await attempt)).status).toBe(403);
    }
    // Publish as admin, then reviewer tries archive/rollback on it.
    actAs("admin");
    await dictPublishPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    actAs("reviewer");
    for (const attempt of [
      dictArchivePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 4 }),
        ctx(id)
      ),
      dictRollbackPOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 4,
          targetVersion: 1,
        }),
        ctx(id)
      ),
    ]) {
      expect((await readJson(await attempt)).status).toBe(403);
    }
  });

  it("17. admin override: gated, reasoned, version-checked, audited", async () => {
    const id = await seedReviewDictId();
    // Reviewer cannot take the override path.
    actAs("reviewer");
    const reviewerTry = await readJson(
      await dictOverridePOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 2,
          reason: "nope",
        }),
        ctx(id)
      )
    );
    expect(reviewerTry.status).toBe(403);
    // Admin without reason → 400, nothing changes.
    actAs("admin");
    const noReason = await readJson(
      await dictOverridePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(noReason.status).toBe(400);
    // Stale override attempt cannot approve (rejected, state intact).
    actAs("reviewer");
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(id)
    );
    actAs("admin");
    const stale = await readJson(
      await dictOverridePOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 2,
          reason: "too late",
        }),
        ctx(id)
      )
    );
    expect(stale.status).not.toBe(200);
    const item = await store.getContentItem(id);
    expect(item?.status).toBe("approved");
    expect(item?.currentVersion).toBe(3);
    // Fresh override with reason succeeds and audits the flag.
    const id2 = await seedReviewDictId();
    actAs("admin");
    const ok = await readJson(
      await dictOverridePOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 2,
          reason: "emergency fix",
        }),
        ctx(id2)
      )
    );
    expect(ok.status).toBe(200);
    const audits = await store.listAuditEvents(id2);
    const last = audits[audits.length - 1];
    expect(last).toMatchObject({ action: "approve", actorId: "admin-1" });
    expect(last?.details).toMatchObject({
      adminOverride: true,
      reason: "emergency fix",
    });
    expect(JSON.stringify(last?.details)).not.toMatch(/secret|password|token|key/i);
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: State machine (18-22)                             */
/* ------------------------------------------------------------------ */

describe("13.5E state machine (18-22)", () => {
  it("18. invalid dictionary transitions rejected with machine code", async () => {
    const draftId = await createDictId();
    actAs("admin"); // publish permission held: the machine itself must reject
    const draftPublish = await readJson(
      await dictPublishPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
        ctx(draftId)
      )
    );
    expect(draftPublish.status).toBe(400);
    expect(draftPublish.json).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    const reviewId = await seedReviewDictId();
    actAs("admin");
    const reviewPublish = await readJson(
      await dictPublishPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
        ctx(reviewId)
      )
    );
    expect(reviewPublish.json).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    const approvedId = await seedApprovedDictId();
    actAs("admin"); // seed helper leaves a reviewer actor behind
    const approvedArchive = await readJson(
      await dictArchivePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
        ctx(approvedId)
      )
    );
    expect(approvedArchive.json).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });
    // Pure machine edges match the lifecycle contract.
    expect(canTransition("draft", "review")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("review", "published")).toBe(false);
    expect(canTransition("approved", "archived")).toBe(false);
    expect(canTransition("published", "review")).toBe(false);
    expect(canTransition("archived", "review")).toBe(false);
  });

  it("19. translation verify rejected outside approved", async () => {
    actAs("editor");
    const created = await readJson(
      await transCreatePOST(jsonRequest("http://localhost/x", "POST", TRANS_DRAFT))
    );
    const id = (created.json.data as { id: string }).id;
    actAs("reviewer");
    const draftVerify = await readJson(
      await transVerifyPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
        ctx(id)
      )
    );
    expect(draftVerify.status).toBe(400);
    expect((await store.getContentItem(id))?.status).toBe("draft");
    expect(store.listTranslations()).toHaveLength(0);
  });

  it("20-21. generic publish/schedule rejected for translations", async () => {
    const id = await seedApprovedTransId();
    actAs("admin");
    const service = getCmsService();
    await expect(service.publish(id, { expectedVersion: 3 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    await expect(
      service.schedule(id, {
        expectedVersion: 3,
        scheduledAt: "2030-01-01T00:00:00.000Z",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    // No generic endpoints exist on the translation slice either.
    for (const file of collectFiles("src/app/api/cms/translations")) {
      expect(file).not.toMatch(/publish|schedule/);
    }
    expect((await store.getContentItem(id))?.status).toBe("approved");
  });

  it("22. authorized verification publishes atomically", async () => {
    const id = await seedApprovedTransId();
    actAs("reviewer");
    const res = await readJson(
      await transVerifyPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ status: "published", currentVersion: 4 });
    const rows = store.listTranslations();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityType: "dictionary",
      entityId: "dict-1",
      language: "ta",
      sourceType: "verified_human",
      isVerified: true,
    });
    // Established contract: archive stays a generic status operation at
    // service level (it never writes translations); the dictionary
    // archive route still 404s translation ids by slice scope.
    const archived = await readJson(
      await dictArchivePOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 4 }),
        ctx(id)
      )
    );
    expect(archived.status).toBe(404);
    actAs("admin");
    const serviceArchived = await getCmsService().archive(id, {
      expectedVersion: 4,
    });
    expect(serviceArchived.status).toBe("archived");
    expect(store.listTranslations()).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Concurrency (23-26)                               */
/* ------------------------------------------------------------------ */

describe("13.5E concurrency (23-26)", () => {
  it("23-25. stale mutation → 409, exact copy, no overwrite", async () => {
    // Two editors race on one draft: the loser's write must 409, not merge.
    const id = await createDictId();
    actAs("editor");
    const winner = await readJson(
      await dictPATCH(
        jsonRequest("http://localhost/x", "PATCH", {
          expectedVersion: 1,
          title: "water v2",
        }),
        ctx(id)
      )
    );
    expect(winner.status).toBe(200);
    const before = {
      versions: (await store.listContentVersions(id)).length,
      audits: (await store.listAuditEvents(id)).length,
      item: await store.getContentItem(id),
    };
    const stale = await readJson(
      await dictPATCH(
        jsonRequest("http://localhost/x", "PATCH", {
          expectedVersion: 1,
          title: "stale overwrite attempt",
        }),
        ctx(id)
      )
    );
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const mapped = interpretApiResponse(409, {
      success: false,
      error: { code: "VERSION_CONFLICT", message: "x" },
    });
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.failure.message).toBe(VERSION_CONFLICT_MESSAGE);
    expect(VERSION_CONFLICT_MESSAGE).toBe(
      "This content was changed by another user. Reload before saving."
    );
    expect((await store.listContentVersions(id)).length).toBe(before.versions);
    expect((await store.listAuditEvents(id)).length).toBe(before.audits);
    expect(await store.getContentItem(id)).toEqual(before.item);
    // Stale verify retries 409 too (version check precedes idempotency).
    const transId = await seedApprovedTransId();
    actAs("reviewer");
    const verified = await readJson(
      await transVerifyPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
        ctx(transId)
      )
    );
    expect(verified.status).toBe(200);
    const staleVerify = await readJson(
      await transVerifyPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
        ctx(transId)
      )
    );
    expect(staleVerify.status).toBe(409);
    expect(store.listTranslations()).toHaveLength(1);
  });

  it("26. repeated stale attempts never merge or retry silently", async () => {
    const id = await createDictId();
    actAs("editor");
    await dictPATCH(
      jsonRequest("http://localhost/x", "PATCH", {
        expectedVersion: 1,
        title: "water v2",
      }),
      ctx(id)
    );
    for (let i = 0; i < 3; i += 1) {
      const res = await readJson(
        await dictPATCH(
          jsonRequest("http://localhost/x", "PATCH", {
            expectedVersion: 1,
            title: `stale attempt ${i}`,
          }),
          ctx(id)
        )
      );
      expect(res.status).toBe(409);
    }
    expect((await store.getContentItem(id))?.currentVersion).toBe(2);
    expect((await store.getContentItem(id))?.title).toBe("water v2");
    expect((await store.listContentVersions(id)).length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Audit (27-31) + atomicity/immutability            */
/* ------------------------------------------------------------------ */

describe("13.5E audit + atomicity (27-31)", () => {
  it("27. full lifecycle audited in order; rollback appends", async () => {
    const id = await createDictId();
    actAs("editor");
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    actAs("reviewer");
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(id)
    );
    actAs("admin");
    await dictSchedulePOST(
      jsonRequest("http://localhost/x", "POST", {
        expectedVersion: 3,
        scheduledAt: "2030-01-01T00:00:00.000Z",
      }),
      ctx(id)
    );
    await dictPublishPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 4 }),
      ctx(id)
    );
    await dictArchivePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 5 }),
      ctx(id)
    );
    const rolledBack = await readJson(
      await dictRollbackPOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 6,
          targetVersion: 1,
        }),
        ctx(id)
      )
    );
    expect(rolledBack.status).toBe(200);
    expect(rolledBack.json.data).toMatchObject({ status: "published", currentVersion: 7 });
    const audits = await store.listAuditEvents(id);
    expect(audits.map((a) => a.action)).toEqual([
      "create_draft",
      "submit_review",
      "approve",
      "schedule",
      "publish",
      "archive",
      "rollback",
    ]);
    expect(audits[audits.length - 1]?.details).toMatchObject({ targetVersion: 1 });
    const versions = await store.listContentVersions(id);
    expect(versions).toHaveLength(7);
    // Rollback copies the target snapshot into a NEW version.
    expect(versions[6]?.snapshotPayload).toEqual(versions[0]?.snapshotPayload);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("28. every audit actor is the server-resolved actor", async () => {
    const id = await createDictId();
    actAs("editor");
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1, actorId: "ghost" }),
      ctx(id)
    );
    actAs("reviewer");
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2, actorId: "ghost" }),
      ctx(id)
    );
    const audits = await store.listAuditEvents(id);
    expect(audits.map((a) => a.actorId)).toEqual([
      "editor-1",
      "editor-1",
      "reviewer-1",
    ]);
  });

  it("29-30. override + verification audits carry structured details", async () => {
    const id = await seedReviewDictId();
    actAs("admin");
    await dictOverridePOST(
      jsonRequest("http://localhost/x", "POST", {
        expectedVersion: 2,
        reason: "emergency",
      }),
      ctx(id)
    );
    const overrideAudits = await store.listAuditEvents(id);
    expect(overrideAudits[overrideAudits.length - 1]?.details).toMatchObject({
      fromStatus: "review",
      toStatus: "approved",
      versionNumber: 3,
      adminOverride: true,
      reason: "emergency",
    });
    const transId = await seedApprovedTransId();
    actAs("reviewer");
    await transVerifyPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
      ctx(transId)
    );
    const verifyAudits = await store.listAuditEvents(transId);
    const last = verifyAudits[verifyAudits.length - 1];
    expect(last).toMatchObject({ action: "verify_translation", actorId: "reviewer-1" });
    expect(last?.details).toMatchObject({
      fromStatus: "approved",
      toStatus: "published",
      entityType: "dictionary",
      language: "ta",
    });
    expect(typeof last?.details.translationId).toBe("string");
  });

  it("31. IP never leaves the API boundary", async () => {
    actAs("editor");
    const service = getCmsService();
    const item = await service.createDraft({
      contentType: "dictionary",
      entityId: null,
      title: "ip probe",
      stagedPayload: { headword: "x" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
      context: { ipAddress: "10.0.0.1" },
    });
    actAs("reviewer");
    for (const get of [dictAuditGET, dictVersionsGET]) {
      const res = await readJson(
        await get(new Request("http://localhost/x"), ctx(item.id))
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.json)).not.toContain("10.0.0.1");
      expect(JSON.stringify(res.json)).not.toContain("ipAddress");
    }
  });

  it("atomicity: audit fault rolls back the whole mutation", async () => {
    setCmsDatabaseOverride(new FailingCmsStore(store, "insertAuditEvent"));
    actAs("editor");
    await expect(
      getCmsService().createDraft({
        contentType: "dictionary",
        entityId: null,
        title: "doomed",
        stagedPayload: { headword: "x" },
        sourceRef: "first-party:test:v1",
        provenanceType: "editorial_curated",
      })
    ).rejects.toThrow();
    const items = await store.listContentItems({ limit: 50, offset: 0 });
    expect(items).toHaveLength(0);
  });

  it("atomicity: translation fault never half-publishes", async () => {
    const id = await seedApprovedTransId();
    const failing = new FailingCmsStore(store, "upsertVerifiedTranslation");
    setCmsDatabaseOverride(failing);
    actAs("reviewer");
    await expect(
      getCmsService().verifyTranslationProposal(id, { expectedVersion: 3 })
    ).rejects.toThrow();
    setCmsDatabaseOverride(store);
    expect((await store.getContentItem(id))?.status).toBe("approved");
    expect((await store.getContentItem(id))?.currentVersion).toBe(3);
    expect(store.listTranslations()).toHaveLength(0);
    expect((await store.listContentVersions(id)).length).toBe(3);
    expect((await store.listAuditEvents(id)).length).toBe(3);
  });

  it("versions are immutable across the lifecycle", async () => {
    const id = await createDictId();
    const v1 = JSON.stringify((await store.listContentVersions(id))[0]);
    actAs("editor");
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    actAs("reviewer");
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(id)
    );
    actAs("admin");
    await dictPublishPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    expect(JSON.stringify((await store.listContentVersions(id))[0])).toBe(v1);
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Slice isolation (32-33)                           */
/* ------------------------------------------------------------------ */

describe("13.5E slice isolation (32-33)", () => {
  it("32-33. cross-slice probes 404 with zero disclosure", async () => {
    const dictId = await seedApprovedDictId();
    const transId = await seedApprovedTransId();
    actAs("reviewer");
    const probes: Array<[string, Promise<Response>]> = [
      ["trans item route", transGET(new Request("http://localhost/x"), ctx(dictId))],
      ["trans versions", transVersionsGET(new Request("http://localhost/x"), ctx(dictId))],
      ["trans audit", transAuditGET(new Request("http://localhost/x"), ctx(dictId))],
      ["dict item route", dictGET(new Request("http://localhost/x"), ctx(transId))],
      ["dict versions", dictVersionsGET(new Request("http://localhost/x"), ctx(transId))],
      ["dict audit", dictAuditGET(new Request("http://localhost/x"), ctx(transId))],
    ];
    for (const [name, response] of probes) {
      const res = await readJson(await response);
      expect(`${name}: ${res.status}`).toBe(`${name}: 404`);
      expect(res.json).toMatchObject({ error: { code: "NOT_FOUND" } });
      const leaked = JSON.stringify(res.json);
      for (const secret of ["water", "Tamil gloss", "editor-1", "reviewer-1", "dict-1"]) {
        expect(leaked).not.toContain(secret);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Canonical protection (34-35)                      */
/* ------------------------------------------------------------------ */

describe("13.5E canonical protection (34-35)", () => {
  it("34. CMS lifecycle never touches canonical tables", async () => {
    const dictId = await createDictId();
    actAs("editor");
    await dictSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(dictId)
    );
    actAs("reviewer");
    await dictApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(dictId)
    );
    actAs("admin");
    await dictPublishPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
      ctx(dictId)
    );
    const transId = await seedApprovedTransId();
    actAs("reviewer");
    await transVerifyPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 3 }),
      ctx(transId)
    );
    // Canonical fixture intact; only the seeded key exists.
    expect(await store.canonicalEntityExists("dictionary", "dict-1")).toBe(true);
    expect(await store.canonicalEntityExists("dictionary", "dict-2")).toBe(false);
    expect(store.listTranslations()).toHaveLength(1);
    // The Drizzle CMS adapter writes ONLY to CMS tables; canonical
    // tables appear solely as read-only existence-check targets.
    const adapter = stripComments(
      readFileSync("src/services/cms/drizzleStore.ts", "utf8")
    );
    const writeTargets = [
      ...adapter.matchAll(/\.(?:insert|update|delete)\(\s*(\w+)/g),
    ].map((m) => m[1]);
    expect(writeTargets.length).toBeGreaterThan(0);
    for (const target of writeTargets) {
      expect(["cmsContentItems", "cmsContentVersions", "cmsAuditLog"]).toContain(
        target
      );
    }
    expect(adapter).toContain("existsById");
  });

  it("35. translation writes delegate to the established service path", () => {
    const cmsService = stripComments(
      readFileSync("src/services/cms/cmsService.ts", "utf8")
    );
    expect(cmsService).toContain("tx.upsertVerifiedTranslation");
    expect(cmsService).not.toContain("TranslationService");
    const storePort = stripComments(
      readFileSync("src/services/cms/drizzleStore.ts", "utf8")
    );
    expect(storePort).toContain("TranslationService.addTranslation");
    expect(storePort).not.toContain("verifyTranslation(");
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Learner boundary (36-39)                          */
/* ------------------------------------------------------------------ */

describe("13.5E learner boundary (36-39)", () => {
  it("36-39. learner services are CMS-unaware (no overlay reads exist)", () => {
    const learnerDirs = [
      "src/services/ai",
      "src/services/analytics",
      "src/services/dictionary",
      "src/services/gamification",
      "src/services/grammar",
      "src/services/jlpt",
      "src/services/knowledge",
      "src/services/quiz",
      "src/services/search",
      "src/services/srs",
      "src/services/translation",
    ];
    for (const dir of learnerDirs) {
      for (const file of collectFiles(dir)) {
        const code = stripComments(readFileSync(file, "utf8"));
        expect(`${file}: ${code}`).not.toContain("cms_content_items");
        expect(`${file}: ${code}`).not.toContain("cms_content_versions");
        expect(`${file}: ${code}`).not.toContain("cms_audit_log");
        expect(`${file}: ${code}`).not.toContain("CmsService");
        expect(`${file}: ${code}`).not.toContain("services/cms");
      }
    }
    // Translation reads carry no CMS-status parameter surface.
    const translationService = stripComments(
      readFileSync("src/services/translation/translationService.ts", "utf8")
    );
    expect(translationService).not.toContain("cms_");
  });

  it("draft/review/approved/scheduled CMS rows never surface as translations", async () => {
    // Four translation proposals parked at each pre-published status.
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      actAs("editor");
      const created = await readJson(
        await transCreatePOST(jsonRequest("http://localhost/x", "POST", TRANS_DRAFT))
      );
      ids.push((created.json.data as { id: string }).id);
    }
    actAs("editor");
    await transSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(ids[1]!)
    );
    await transSubmitPOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 1 }),
      ctx(ids[2]!)
    );
    actAs("reviewer");
    await transApprovePOST(
      jsonRequest("http://localhost/x", "POST", { expectedVersion: 2 }),
      ctx(ids[2]!)
    );
    const statuses = await Promise.all(
      ids.map(async (id) => (await store.getContentItem(id))?.status)
    );
    expect(statuses).toEqual(["draft", "review", "approved"]);
    expect(store.listTranslations()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 13.5E §43 matrix: Static security (40-45) + error/request safety    */
/* ------------------------------------------------------------------ */

describe("13.5E static security (40-45)", () => {
  it("40-44. client surfaces carry no auth/data/privacy channels", () => {
    const clientFiles = [
      ...collectFiles("src/components/admin"),
      ...collectFiles("src/components/cms-review"),
      ...collectFiles("src/app/admin"),
    ];
    expect(clientFiles.length).toBeGreaterThan(0);
    const forbidden = [
      "server-only",
      "@/db",
      "drizzle-orm",
      "CmsStore",
      "TranslationService",
      "CmsService",
      "service-role",
      "service_role",
      "getSession(",
      "localStorage",
      "sessionStorage",
      "ADMIN_API_SECRET",
      "x-admin-key",
      "dangerouslySetInnerHTML",
      "ipAddress",
      ".insert(",
      ".update(",
      ".delete(",
      ".execute(",
      "verifyTranslation(",
      "verifyTranslationProposal(",
    ];
    for (const file of clientFiles) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of forbidden) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
  });

  it("42b. entity_translations named only in the verify warning sentence", () => {
    const sentence =
      "This will promote the approved translation into\n                  entity_translations.";
    for (const file of [
      ...collectFiles("src/components/cms-review"),
      ...collectFiles("src/components/admin"),
      ...collectFiles("src/app/admin"),
    ]) {
      expect(readFileSync(file, "utf8").replace(sentence, "")).not.toContain(
        "entity_translations"
      );
    }
  });

  it("41b. routes never read client identity fields", () => {
    for (const file of collectFiles("src/app/api/cms")) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of [
        "body.userId",
        "body.role",
        "body.actorId",
        "body.authorId",
        "body.reviewerId",
        "query.userId",
        "headers.get(",
      ]) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
  });

  it("CmsService stays provider-independent", () => {
    for (const file of collectFiles("src/services/cms")) {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(`${file}: ${code}`).not.toContain("supabase");
      expect(`${file}: ${code}`).not.toContain("next/headers");
    }
    const cmsService = stripComments(
      readFileSync("src/services/cms/cmsService.ts", "utf8")
    );
    expect(cmsService).not.toContain("@/db");
  });

  it("raw verifyTranslation stays unexposed (no bypass route)", () => {
    for (const file of collectFiles("src/app/api")) {
      expect(stripComments(readFileSync(file, "utf8"))).not.toContain(
        "verifyTranslation("
      );
    }
    expect(
      stripComments(readFileSync("src/services/cms/cmsService.ts", "utf8"))
    ).not.toContain("verifyTranslation(");
  });

  it("error safety: faults become opaque 500s", async () => {
    setCmsDatabaseOverride(new FailingCmsStore(store, "insertAuditEvent"));
    actAs("editor");
    const res = await readJson(
      await dictCreatePOST(jsonRequest("http://localhost/x", "POST", DICT_DRAFT))
    );
    expect(res.status).toBe(500);
    expect(res.json).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
  });

  it("request validation: malformed bodies and fields fail safe", async () => {
    actAs("editor");
    const malformed = await readJson(
      await dictCreatePOST(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{{{",
        })
      )
    );
    expect(malformed.status).toBe(400);
    const nonObject = await readJson(
      await dictCreatePOST(jsonRequest("http://localhost/x", "POST", "123"))
    );
    expect(nonObject.status).toBe(400);
    const badSource = await readJson(
      await dictCreatePOST(
        jsonRequest("http://localhost/x", "POST", { ...DICT_DRAFT, sourceRef: "" })
      )
    );
    expect(badSource.status).toBe(400);
    const badProvenance = await readJson(
      await dictCreatePOST(
        jsonRequest("http://localhost/x", "POST", {
          ...DICT_DRAFT,
          provenanceType: "bogus",
        })
      )
    );
    expect(badProvenance.status).toBe(400);
    // Provenance/author fields are not patchable.
    const id = await createDictId();
    const patched = await readJson(
      await dictPATCH(
        jsonRequest("http://localhost/x", "PATCH", {
          expectedVersion: 1,
          title: "water v2",
          sourceRef: "evil:spoof:v9",
          provenanceType: "bogus",
          authorId: "ghost",
        }),
        ctx(id)
      )
    );
    expect(patched.status).toBe(200);
    const item = await store.getContentItem(id);
    expect(item).toMatchObject({
      title: "water v2",
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
      authorId: "editor-1",
    });
    // Non-integer expectedVersion + past schedule rejected.
    const badVersion = await readJson(
      await dictSubmitPOST(
        jsonRequest("http://localhost/x", "POST", { expectedVersion: "2" }),
        ctx(id)
      )
    );
    expect(badVersion.status).toBe(400);
    const approvedId = await seedApprovedDictId();
    actAs("admin");
    const pastSchedule = await readJson(
      await dictSchedulePOST(
        jsonRequest("http://localhost/x", "POST", {
          expectedVersion: 3,
          scheduledAt: "2000-01-01T00:00:00.000Z",
        }),
        ctx(approvedId)
      )
    );
    expect(pastSchedule.status).toBe(400);
  });
});
