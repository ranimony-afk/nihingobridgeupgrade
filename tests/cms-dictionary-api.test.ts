/**
 * Phase 13.5A — CMS Dictionary API vertical-slice tests.
 *
 * Route handlers are invoked directly (no HTTP server, no production DB):
 * CmsService runs over FakeCmsStore via setCmsDatabaseOverride, and actors
 * come from setActorResolver or the full identity→user→actor pipeline.
 * Proves: auth gating, role matrix, lifecycle, spoof rejection, 409s,
 * dictionary-only scope, canonical read-only, and audit attribution.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import type { CmsRole } from "@/lib/auth";
import {
  resetActorResolver,
  resetApplicationUserStore,
  resetSupabaseClientFactory,
  setActorResolver,
  setApplicationUserStore,
  setSupabaseClientFactory,
} from "@/lib/auth";
import type {
  ApplicationUserRecord,
  ApplicationUserStore,
} from "@/lib/auth/applicationUser";
import {
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import { FakeCmsStore } from "./cms-fake-store";

import {
  GET as collectionGET,
  POST as collectionPOST,
} from "@/app/api/cms/dictionary/route";
import {
  GET as itemGET,
  PATCH as itemPATCH,
} from "@/app/api/cms/dictionary/[id]/route";
import { POST as submitPOST } from "@/app/api/cms/dictionary/[id]/submit/route";
import { POST as requestChangesPOST } from "@/app/api/cms/dictionary/[id]/request-changes/route";
import { POST as approvePOST } from "@/app/api/cms/dictionary/[id]/approve/route";
import { POST as overridePOST } from "@/app/api/cms/dictionary/[id]/approve-override/route";
import { POST as schedulePOST } from "@/app/api/cms/dictionary/[id]/schedule/route";
import { POST as publishPOST } from "@/app/api/cms/dictionary/[id]/publish/route";
import { POST as archivePOST } from "@/app/api/cms/dictionary/[id]/archive/route";
import { POST as rollbackPOST } from "@/app/api/cms/dictionary/[id]/rollback/route";

const BASE = "http://localhost/api/cms/dictionary";

let store: FakeCmsStore;
let users: FakeUserStore;

beforeEach(() => {
  resetActorResolver();
  resetSupabaseClientFactory();
  resetApplicationUserStore();
  resetCmsDatabaseOverride();
  store = new FakeCmsStore();
  setCmsDatabaseOverride(store);
  users = new FakeUserStore();
  setApplicationUserStore(users);
});

function actAs(role: CmsRole, id = `${role}-1`) {
  setActorResolver(() => ({ id, role }));
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body) }),
  });
}

async function readJson(response: Response): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "water",
    stagedPayload: { headword: "水", reading: "みず" },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    ...overrides,
  };
}

/** Minimal in-memory application-user store for pipeline tests. */
class FakeUserStore implements ApplicationUserStore {
  private rows = new Map<string, ApplicationUserRecord>();
  seed(provider: string, subject: string, row: ApplicationUserRecord) {
    this.rows.set(`${provider}:${subject}`, row);
  }
  async findByProviderIdentity(provider: string, subject: string) {
    return this.rows.get(`${provider}:${subject}`) ?? null;
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

describe("13.5A: authentication and role gating", () => {
  it("anonymous → 401 on read and write", async () => {
    setActorResolver(() => null);
    const getRes = await readJson(await collectionGET(new Request(BASE)));
    expect(getRes.status).toBe(401);
    expect(getRes.json).toMatchObject({
      success: false,
      error: { code: "UNAUTHENTICATED" },
    });
    const postRes = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    expect(postRes.status).toBe(401);
  });

  it("learner → 403", async () => {
    actAs("learner");
    const res = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("editor → create (201), edit, submit", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    expect(created.status).toBe(201);
    const id = (created.json.data as { id: string }).id;
    expect((created.json.data as { status: string }).status).toBe("draft");

    const edited = await readJson(
      await itemPATCH(
        jsonRequest(`${BASE}/${id}`, "PATCH", {
          expectedVersion: 1,
          title: "water (revised)",
        }),
        ctx(id)
      )
    );
    expect(edited.status).toBe(200);
    expect(edited.json.data).toMatchObject({
      title: "water (revised)",
      currentVersion: 2,
    });

    const submitted = await readJson(
      await submitPOST(
        jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(submitted.status).toBe(200);
    expect(submitted.json.data).toMatchObject({ status: "review" });
  });

  it("reviewer → request-changes and approve", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );

    actAs("reviewer");
    const returned = await readJson(
      await requestChangesPOST(
        jsonRequest(`${BASE}/${id}/request-changes`, "POST", {
          expectedVersion: 2,
          reason: "needs a gloss",
        }),
        ctx(id)
      )
    );
    expect(returned.status).toBe(200);
    expect(returned.json.data).toMatchObject({ status: "draft" });

    actAs("editor");
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    actAs("reviewer");
    const approved = await readJson(
      await approvePOST(
        jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 4 }),
        ctx(id)
      )
    );
    expect(approved.status).toBe(200);
    expect(approved.json.data).toMatchObject({ status: "approved" });
  });

  it("admin → full lifecycle to archive, plus rollback", async () => {
    actAs("admin");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    // Admin cannot self-approve on the standard path: use the override.
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    const overridden = await readJson(
      await overridePOST(
        jsonRequest(`${BASE}/${id}/approve-override`, "POST", {
          expectedVersion: 2,
          reason: "emergency fix",
        }),
        ctx(id)
      )
    );
    expect(overridden.status).toBe(200);

    const scheduled = await readJson(
      await schedulePOST(
        jsonRequest(`${BASE}/${id}/schedule`, "POST", {
          expectedVersion: 3,
          scheduledAt: "2030-01-01T00:00:00.000Z",
        }),
        ctx(id)
      )
    );
    expect(scheduled.status).toBe(200);

    const published = await readJson(
      await publishPOST(
        jsonRequest(`${BASE}/${id}/publish`, "POST", { expectedVersion: 4 }),
        ctx(id)
      )
    );
    expect(published.status).toBe(200);
    expect(published.json.data).toMatchObject({ status: "published" });

    const archived = await readJson(
      await archivePOST(
        jsonRequest(`${BASE}/${id}/archive`, "POST", { expectedVersion: 5 }),
        ctx(id)
      )
    );
    expect(archived.status).toBe(200);
    expect(archived.json.data).toMatchObject({ status: "archived" });

    const rolled = await readJson(
      await rollbackPOST(
        jsonRequest(`${BASE}/${id}/rollback`, "POST", {
          expectedVersion: 6,
          targetVersion: 1,
        }),
        ctx(id)
      )
    );
    expect(rolled.status).toBe(200);
    expect(rolled.json.data).toMatchObject({ currentVersion: 7 });
  });

  it("editor cannot approve; reviewer cannot publish", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    const denied = await readJson(
      await approvePOST(
        jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(denied.status).toBe(403);

    actAs("reviewer");
    await approvePOST(
      jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
      ctx(id)
    );
    const deniedPublish = await readJson(
      await publishPOST(
        jsonRequest(`${BASE}/${id}/publish`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(deniedPublish.status).toBe(403);
  });

  it("self-approval is blocked with SELF_APPROVAL_FORBIDDEN", async () => {
    actAs("admin", "user-admin-author");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    const res = await readJson(
      await approvePOST(
        jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({
      error: { code: "SELF_APPROVAL_FORBIDDEN" },
    });
  });
});

describe("13.5A: spoofing, versions, and validation", () => {
  it("client userId spoof is ignored; attribution is the verified actor", async () => {
    actAs("editor", "user-real-editor");
    const created = await readJson(
      await collectionPOST(
        jsonRequest(
          BASE,
          "POST",
          validDraft({ authorId: "user-victim", actorId: "user-victim", userId: "user-victim" })
        )
      )
    );
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({
      authorId: "user-real-editor",
      reviewerId: null,
    });
  });

  it("client role spoof confers nothing", async () => {
    actAs("reviewer", "user-sneaky");
    const res = await readJson(
      await collectionPOST(
        jsonRequest(BASE, "POST", validDraft({ role: "admin" }))
      )
    );
    // Reviewers hold no cms.create: the smuggled role changes nothing.
    expect(res.status).toBe(403);
  });

  it("version mismatch → 409 and nothing changes", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    const res = await readJson(
      await itemPATCH(
        jsonRequest(`${BASE}/${id}`, "PATCH", {
          expectedVersion: 999,
          title: "stale",
        }),
        ctx(id)
      )
    );
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const current = await readJson(
      await itemGET(new Request(`${BASE}/${id}`), ctx(id))
    );
    expect(current.json.data).toMatchObject({ title: "water", currentVersion: 1 });
  });

  it("missing title / sourceRef / provenance are 400 (never invented)", async () => {
    actAs("editor");
    for (const body of [
      validDraft({ title: undefined }),
      validDraft({ sourceRef: undefined }),
      validDraft({ provenanceType: undefined }),
      validDraft({ provenanceType: "wikipedia-scrape" }),
      validDraft({ stagedPayload: ["not-an-object"] }),
    ]) {
      const res = await readJson(
        await collectionPOST(jsonRequest(BASE, "POST", body))
      );
      expect(res.status).toBe(400);
      expect(res.json).toMatchObject({
        success: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("malformed JSON and non-integer expectedVersion are 400", async () => {
    actAs("editor");
    const badJson = await readJson(
      await collectionPOST(new Request(BASE, { method: "POST", body: "{oops" }))
    );
    expect(badJson.status).toBe(400);

    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    const id = (created.json.data as { id: string }).id;
    const badVersion = await readJson(
      await itemPATCH(
        jsonRequest(`${BASE}/${id}`, "PATCH", {
          expectedVersion: "1",
          title: "x",
        }),
        ctx(id)
      )
    );
    expect(badVersion.status).toBe(400);
  });

  it("unexpected failures are generic 500s with no leaked internals", async () => {
    const exploding = new FakeCmsStore();
    exploding.transaction = async () => {
      throw new Error("injected boom: SECRET_SQL_CONN=postgres://x");
    };
    setCmsDatabaseOverride(exploding);
    actAs("editor");
    const res = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    expect(res.status).toBe(500);
    expect(res.json).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
    expect(JSON.stringify(res.json)).not.toContain("SECRET_SQL_CONN");
  });
});

describe("13.5A: dictionary-only scope", () => {
  it("forced contentType: caller contentType is ignored", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(
        jsonRequest(BASE, "POST", validDraft({ contentType: "kanji" }))
      )
    );
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ contentType: "dictionary" });
  });

  it("non-dictionary items 404 on read and are never mutated", async () => {
    // A kanji item exists in the CMS (created outside this slice).
    actAs("admin");
    const { getCmsService } = await import("@/services/cms");
    const kanji = await getCmsService().createDraft({
      contentType: "kanji",
      entityId: null,
      title: "kanji item",
      stagedPayload: { character: "水" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
    });

    actAs("editor");
    const getRes = await readJson(
      await itemGET(new Request(`${BASE}/${kanji.id}`), ctx(kanji.id))
    );
    expect(getRes.status).toBe(404);

    // The mutation is blocked BEFORE any write: version is untouched.
    const patchRes = await readJson(
      await itemPATCH(
        jsonRequest(`${BASE}/${kanji.id}`, "PATCH", {
          expectedVersion: 1,
          title: "hijacked",
        }),
        ctx(kanji.id)
      )
    );
    expect(patchRes.status).toBe(404);
    const stored = await store.getContentItem(kanji.id);
    expect(stored).toMatchObject({ title: "kanji item", currentVersion: 1 });
  });

  it("collection lists dictionary items only, with status filter", async () => {
    actAs("admin");
    const { getCmsService } = await import("@/services/cms");
    await getCmsService().createDraft({
      contentType: "kanji",
      entityId: null,
      title: "kanji item",
      stagedPayload: { character: "水" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
    });
    actAs("editor");
    await collectionPOST(jsonRequest(BASE, "POST", validDraft({ title: "one" })));
    await collectionPOST(jsonRequest(BASE, "POST", validDraft({ title: "two" })));

    const all = await readJson(await collectionGET(new Request(BASE)));
    expect(all.status).toBe(200);
    const items = (all.json.data as { items: { title: string }[] }).items;
    expect(items.map((i) => i.title).sort()).toEqual(["one", "two"]);

    const drafts = await readJson(
      await collectionGET(new Request(`${BASE}?status=draft`))
    );
    expect(
      (drafts.json.data as { items: unknown[] }).items.length
    ).toBe(2);

    const bad = await readJson(
      await collectionGET(new Request(`${BASE}?status=nope`))
    );
    expect(bad.status).toBe(400);
  });
});

describe("13.5A: canonical read-only and audit attribution", () => {
  it("canonical dictionary row remains unchanged; published content lives in CMS", async () => {
    store.seedCanonicalEntity("dictionary", "dict-1");
    actAs("editor");
    const created = await readJson(
      await collectionPOST(
        jsonRequest(BASE, "POST", validDraft({ entityId: "dict-1" }))
      )
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    actAs("reviewer");
    await approvePOST(
      jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
      ctx(id)
    );
    actAs("admin");
    const published = await readJson(
      await publishPOST(
        jsonRequest(`${BASE}/${id}/publish`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(published.status).toBe(200);

    // Canonical guard still sees the same entity; CMS holds the overlay.
    expect(await store.canonicalEntityExists("dictionary", "dict-1")).toBe(true);
    const item = await store.getContentItem(id);
    expect(item).toMatchObject({
      status: "published",
      entityId: "dict-1",
      contentType: "dictionary",
    });
    expect((await store.listContentVersions(id)).length).toBe(4);
    expect((await store.listAuditEvents(id)).length).toBe(4);
  });

  it("audit actor equals the authenticated application user (full pipeline)", async () => {
    users.seed("supabase", "sub-pipeline", {
      id: "user-pipeline-1",
      name: "Pipeline",
      role: "editor",
    });
    authenticateAs({ sub: "sub-pipeline" });
    // No actor override: identity → user → actor → permission → service.
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validDraft()))
    );
    expect(created.status).toBe(201);
    const id = (created.json.data as { id: string }).id;
    expect(created.json.data).toMatchObject({ authorId: "user-pipeline-1" });
    const trail = await store.listAuditEvents(id);
    expect(trail.map((e) => e.actorId)).toEqual(["user-pipeline-1"]);
  });

  it("routes touch no canonical tables and read no client identity", async () => {
    const routeFiles = [
      "src/app/api/cms/dictionary/_lib.ts",
      "src/app/api/cms/dictionary/route.ts",
      "src/app/api/cms/dictionary/[id]/route.ts",
      "src/app/api/cms/dictionary/[id]/submit/route.ts",
      "src/app/api/cms/dictionary/[id]/request-changes/route.ts",
      "src/app/api/cms/dictionary/[id]/approve/route.ts",
      "src/app/api/cms/dictionary/[id]/approve-override/route.ts",
      "src/app/api/cms/dictionary/[id]/schedule/route.ts",
      "src/app/api/cms/dictionary/[id]/publish/route.ts",
      "src/app/api/cms/dictionary/[id]/archive/route.ts",
      "src/app/api/cms/dictionary/[id]/rollback/route.ts",
    ];
    const forbidden =
      /dictionaryEntries|kanjiEntries|kanjiRadicals|grammarPatterns|exampleSentences|jlptTests|body\.(userId|actorId|authorId|reviewerId|role)\b|query\.(userId|role)\b|x-user-id|x-admin-key|ADMIN_API_SECRET|getSession\(/;
    for (const file of routeFiles) {
      expect(`${file}: ${readFileSync(file, "utf8")}`).not.toMatch(forbidden);
    }
    // Production adapter: canonical tables appear ONLY in the
    // read-only existence check — never as an insert/update/delete target.
    const adapter = readFileSync("src/services/cms/drizzleStore.ts", "utf8");
    expect(adapter).toMatch(/canonicalEntityExists/);
    expect(adapter).not.toMatch(
      /\.(insert|update|delete)\(\s*(dictionaryEntries|kanjiEntries|kanjiRadicals|grammarPatterns|exampleSentences|jlptTests|questions)\b/
    );
  });
});
