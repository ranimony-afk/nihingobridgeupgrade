/**
 * Phase 13.5C — CMS translation workflow tests (A–AF + canonical proof).
 *
 * Route handlers run over FakeCmsStore via setCmsDatabaseOverride; the
 * fake's translation map mirrors TranslationService.addTranslation
 * semantics (same NFC + deterministic-id helpers, same conflict upgrade).
 * No production DB, no migration, no UI.
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
  getCmsService,
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import {
  generateTranslationId,
  normalizeTranslatedText,
} from "@/services/translation/translationService";
import { FakeCmsStore, FailingCmsStore } from "./cms-fake-store";
import type { FakeTranslationRow } from "./cms-fake-store";

import {
  GET as collectionGET,
  POST as collectionPOST,
} from "@/app/api/cms/translations/route";
import { PATCH as itemPATCH } from "@/app/api/cms/translations/[id]/route";
import { POST as submitPOST } from "@/app/api/cms/translations/[id]/submit/route";
import { POST as approvePOST } from "@/app/api/cms/translations/[id]/approve/route";
import { POST as overridePOST } from "@/app/api/cms/translations/[id]/approve-override/route";
import { POST as verifyPOST } from "@/app/api/cms/translations/[id]/verify/route";

const BASE = "http://localhost/api/cms/translations";

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
  store.seedCanonicalEntity("dictionary", "dict-1");
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
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readJson(response: Response): Promise<{
  status: number;
  json: Record<string, unknown>;
}> {
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

function validProposal(overrides: Record<string, unknown> = {}) {
  return {
    entityId: "dict-1",
    title: "Tamil gloss for water",
    stagedPayload: {
      entityType: "dictionary",
      language: "ta",
      translatedText: "தண்ணீர்",
      secondaryText: "Thanneer",
      contextNotes: "Common word for fresh water",
      sourceRef: "test:tamil-lexicon:v1",
    },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    ...overrides,
  };
}

/** Editor creates + submits; reviewer approves. Returns approved v3 id. */
async function driveToApproved(
  proposal: Record<string, unknown> = validProposal()
): Promise<string> {
  actAs("editor");
  const created = await readJson(
    await collectionPOST(jsonRequest(BASE, "POST", proposal))
  );
  expect(created.status).toBe(201);
  const id = (created.json.data as { id: string }).id;
  const submitted = await readJson(
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    )
  );
  expect(submitted.status).toBe(200);
  actAs("reviewer");
  const approved = await readJson(
    await approvePOST(
      jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
      ctx(id)
    )
  );
  expect(approved.status).toBe(200);
  return id;
}

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

describe("13.5C: proposal creation and validation (A–H, J, M–O)", () => {
  it("A/B/F. editor creates a translation draft with contentType translation", async () => {
    actAs("editor");
    const res = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      contentType: "translation",
      entityId: "dict-1",
      status: "draft",
      currentVersion: 1,
      authorId: "editor-1",
    });
  });

  it("C. invalid language rejected", async () => {
    actAs("editor");
    const res = await readJson(
      await collectionPOST(
        jsonRequest(
          BASE,
          "POST",
          validProposal({
            stagedPayload: {
              entityType: "dictionary",
              language: "fr",
              translatedText: "eau",
              sourceRef: "test:x:v1",
            },
          })
        )
      )
    );
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("D. invalid entity type rejected", async () => {
    actAs("editor");
    const res = await readJson(
      await collectionPOST(
        jsonRequest(
          BASE,
          "POST",
          validProposal({
            stagedPayload: {
              entityType: "bogus",
              language: "ta",
              translatedText: "x",
              sourceRef: "test:x:v1",
            },
          })
        )
      )
    );
    expect(res.status).toBe(400);
  });

  it("E. missing/blank translatedText and missing entityId rejected", async () => {
    actAs("editor");
    for (const proposal of [
      validProposal({
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          sourceRef: "test:x:v1",
        },
      }),
      validProposal({
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          translatedText: "   ",
          sourceRef: "test:x:v1",
        },
      }),
      validProposal({ entityId: null }),
      validProposal({
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          translatedText: "x",
        },
      }),
    ]) {
      const res = await readJson(
        await collectionPOST(jsonRequest(BASE, "POST", proposal))
      );
      expect(res.status).toBe(400);
    }
  });

  it("G/H. editor submits, reviewer approves", async () => {
    const id = await driveToApproved();
    const item = await store.getContentItem(id);
    expect(item).toMatchObject({
      status: "approved",
      currentVersion: 3,
      reviewerId: "reviewer-1",
    });
  });

  it("J. learner cannot create CMS translations", async () => {
    actAs("learner");
    const res = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    expect(res.status).toBe(403);
  });

  it("M. unauthenticated requests rejected", async () => {
    setActorResolver(() => null);
    const res = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    expect(res.status).toBe(401);
    const getRes = await readJson(await collectionGET(new Request(BASE)));
    expect(getRes.status).toBe(401);
  });

  it("N/O. client userId and role spoofing ignored", async () => {
    actAs("editor", "user-real-editor");
    const res = await readJson(
      await collectionPOST(
        jsonRequest(
          BASE,
          "POST",
          validProposal({ authorId: "user-victim", userId: "user-victim" })
        )
      )
    );
    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({ authorId: "user-real-editor" });

    actAs("reviewer", "user-sneaky");
    const denied = await readJson(
      await collectionPOST(
        jsonRequest(BASE, "POST", validProposal({ role: "admin" }))
      )
    );
    expect(denied.status).toBe(403);
  });
});

describe("13.5C: verification authorization (I, K, L, P–T, AE)", () => {
  it("I. reviewer verifies an approved translation → published", async () => {
    const id = await driveToApproved();
    actAs("reviewer");
    const res = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({
      status: "published",
      currentVersion: 4,
    });
    expect((res.json.data as { publishedAt: unknown }).publishedAt).not.toBeNull();
  });

  it("K/L. learner and editor cannot verify", async () => {
    const id = await driveToApproved();
    for (const role of ["learner", "editor"] as const) {
      actAs(role);
      const res = await readJson(
        await verifyPOST(
          jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
          ctx(id)
        )
      );
      expect(res.status).toBe(403);
    }
  });

  it("P. author cannot self-approve a translation", async () => {
    actAs("editor", "user-author");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    // An approver who is also the author is rejected even with permission.
    actAs("reviewer", "user-author");
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

  it("Q. admin override requires an explicit reason", async () => {
    actAs("admin", "user-admin-author");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    const missing = await readJson(
      await overridePOST(
        jsonRequest(`${BASE}/${id}/approve-override`, "POST", {
          expectedVersion: 2,
          reason: "",
        }),
        ctx(id)
      )
    );
    expect(missing.status).toBe(400);
    const ok = await readJson(
      await overridePOST(
        jsonRequest(`${BASE}/${id}/approve-override`, "POST", {
          expectedVersion: 2,
          reason: "emergency",
        }),
        ctx(id)
      )
    );
    expect(ok.status).toBe(200);
  });

  it("R/S/T. draft and review proposals cannot be verified", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    const id = (created.json.data as { id: string }).id;
    actAs("reviewer");
    const draftAttempt = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 1 }),
        ctx(id)
      )
    );
    expect(draftAttempt.status).toBe(400);
    expect(draftAttempt.json).toMatchObject({
      error: { code: "INVALID_TRANSITION" },
    });

    actAs("editor");
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    actAs("reviewer");
    const reviewAttempt = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(reviewAttempt.status).toBe(400);
  });

  it("AE. reviewer publish is 403; admin publish of translations is 400-guarded", async () => {
    const id = await driveToApproved();
    actAs("reviewer");
    await expect(
      getCmsService().publish(id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 403 });
    actAs("admin");
    await expect(
      getCmsService().publish(id, { expectedVersion: 3 })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      getCmsService().schedule(id, {
        expectedVersion: 3,
        scheduledAt: "2030-01-01T00:00:00.000Z",
      })
    ).rejects.toMatchObject({ status: 400 });
    // The item is untouched by the bypass attempts.
    const item = await store.getContentItem(id);
    expect(item).toMatchObject({ status: "approved", currentVersion: 3 });
  });

  it("translation slice rejects non-translation items before any write", async () => {
    actAs("admin");
    const kanji = await getCmsService().createDraft({
      contentType: "kanji",
      entityId: null,
      title: "kanji item",
      stagedPayload: { character: "水" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
    });
    actAs("editor");
    const res = await readJson(
      await itemPATCH(
        jsonRequest(`${BASE}/${kanji.id}`, "PATCH", {
          expectedVersion: 1,
          title: "hijacked",
        }),
        ctx(kanji.id)
      )
    );
    expect(res.status).toBe(404);
    const stored = await store.getContentItem(kanji.id);
    expect(stored).toMatchObject({ title: "kanji item", currentVersion: 1 });
  });
});

describe("13.5C: canonical write semantics (U–Y)", () => {
  it("U. verification writes the canonical translation row", async () => {
    const id = await driveToApproved();
    actAs("reviewer");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    const expectedId = generateTranslationId(
      "dictionary",
      "dict-1",
      "ta",
      normalizeTranslatedText("தண்ணீர்")
    );
    const row = store.getTranslation(expectedId);
    expect(row).toMatchObject({
      id: expectedId,
      entityType: "dictionary",
      entityId: "dict-1",
      language: "ta",
      translatedText: "தண்ணீர்",
      secondaryText: "Thanneer",
      contextNotes: "Common word for fresh water",
      sourceType: "verified_human",
      sourceRef: "test:tamil-lexicon:v1",
      isVerified: true,
    });
  });

  it("V/W. machine row is upgraded in place; its text is never overwritten", async () => {
    const machineId = generateTranslationId(
      "dictionary",
      "dict-1",
      "ta",
      normalizeTranslatedText("தண்ணீர்")
    );
    store.seedTranslationDirect({
      id: machineId,
      entityType: "dictionary",
      entityId: "dict-1",
      language: "ta",
      translatedText: normalizeTranslatedText("தண்ணீர்"),
      secondaryText: "MachineRoman",
      contextNotes: null,
      sourceType: "machine",
      sourceRef: "model:test-nmt:v1",
      isVerified: false,
    });
    // Proposal carries no secondary text: the stored value must survive.
    const id = await driveToApproved(
      validProposal({
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          translatedText: "தண்ணீர்",
          sourceRef: "test:tamil-lexicon:v1",
        },
      })
    );
    actAs("reviewer");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    expect(store.listTranslations().length).toBe(1);
    const row = store.getTranslation(machineId);
    expect(row).toMatchObject({
      translatedText: normalizeTranslatedText("தண்ணீர்"),
      secondaryText: "MachineRoman",
      sourceType: "verified_human",
      isVerified: true,
    });
  });

  it("X. corrected text creates a separate deterministic identity", async () => {
    const firstId = generateTranslationId(
      "dictionary",
      "dict-1",
      "ta",
      normalizeTranslatedText("தண்ணீர்")
    );
    store.seedTranslationDirect({
      id: firstId,
      entityType: "dictionary",
      entityId: "dict-1",
      language: "ta",
      translatedText: normalizeTranslatedText("தண்ணீர்"),
      secondaryText: null,
      contextNotes: null,
      sourceType: "verified_human",
      sourceRef: "test:tamil-lexicon:v1",
      isVerified: true,
    });
    const id = await driveToApproved(
      validProposal({
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          translatedText: "தண்ணீர் (corrected)",
          sourceRef: "test:tamil-lexicon:v2",
        },
      })
    );
    actAs("reviewer");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    const rows = store.listTranslations();
    expect(rows.length).toBe(2);
    const correctedId = generateTranslationId(
      "dictionary",
      "dict-1",
      "ta",
      normalizeTranslatedText("தண்ணீர் (corrected)")
    );
    expect(correctedId).not.toBe(firstId);
    expect(store.getTranslation(correctedId)).toMatchObject({
      sourceType: "verified_human",
      isVerified: true,
    });
    // The original row is byte-identical: nothing was moved or rewritten.
    expect(store.getTranslation(firstId)).toMatchObject({
      translatedText: normalizeTranslatedText("தண்ணீர்"),
      sourceType: "verified_human",
    });
  });

  it("Y. CMS item becomes published only after the canonical write", async () => {
    const id = await driveToApproved();
    // Before verification: no canonical row, item approved without timestamp.
    expect(store.listTranslations().length).toBe(0);
    const before = await store.getContentItem(id);
    expect(before).toMatchObject({ status: "approved", publishedAt: null });
    actAs("reviewer");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    expect(store.listTranslations().length).toBe(1);
    const after = await store.getContentItem(id);
    expect(after?.status).toBe("published");
    expect(after?.publishedAt).not.toBeNull();
  });
});

describe("13.5C: atomicity, audit, idempotency, concurrency (Z–AB, AC, AD)", () => {
  it("Z. failed canonical write neither publishes nor audits", async () => {
    const id = await driveToApproved();
    const failing = new FailingCmsStore(store, "upsertVerifiedTranslation");
    setCmsDatabaseOverride(failing);
    actAs("reviewer");
    const res = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(res.status).toBe(500);
    expect(res.json).toMatchObject({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
    expect(JSON.stringify(res.json)).not.toContain("injected");
    // Rollback: CMS state and canonical translations both untouched.
    const item = await store.getContentItem(id);
    expect(item).toMatchObject({ status: "approved", currentVersion: 3 });
    expect((await store.listContentVersions(id)).length).toBe(3);
    expect((await store.listAuditEvents(id)).length).toBe(3);
    expect(store.listTranslations().length).toBe(0);
  });

  it("AA. verification records a structured verify_translation audit", async () => {
    const id = await driveToApproved();
    actAs("reviewer", "user-verifier");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    const trail = await store.listAuditEvents(id);
    const event = trail[trail.length - 1]!;
    expect(event.action).toBe("verify_translation");
    expect(event.actorId).toBe("user-verifier");
    expect(event.details).toMatchObject({
      entityType: "dictionary",
      entityId: "dict-1",
      language: "ta",
      fromStatus: "approved",
      toStatus: "published",
      actorId: "user-verifier",
      versionNumber: 4,
    });
    expect(typeof (event.details as { translationId: unknown }).translationId)
      .toBe("string");
  });

  it("AB. audit actor is the authenticated application user", async () => {
    actAs("editor");
    const created = await readJson(
      await collectionPOST(jsonRequest(BASE, "POST", validProposal()))
    );
    const id = (created.json.data as { id: string }).id;
    await submitPOST(
      jsonRequest(`${BASE}/${id}/submit`, "POST", { expectedVersion: 1 }),
      ctx(id)
    );
    // Reviewer acts through the full identity → user → actor pipeline.
    users.seed("supabase", "sub-reviewer", {
      id: "user-reviewer-9",
      name: "Reviewer",
      role: "reviewer",
    });
    resetActorResolver();
    authenticateAs({ sub: "sub-reviewer" });
    const approved = await readJson(
      await approvePOST(
        jsonRequest(`${BASE}/${id}/approve`, "POST", { expectedVersion: 2 }),
        ctx(id)
      )
    );
    expect(approved.status).toBe(200);
    const verified = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(verified.status).toBe(200);
    const trail = await store.listAuditEvents(id);
    const event = trail[trail.length - 1]!;
    expect(event.actorId).toBe("user-reviewer-9");
    expect(event.details).toMatchObject({ actorId: "user-reviewer-9" });
  });

  it("AC. duplicate verification with the current version is a safe no-op", async () => {
    const id = await driveToApproved();
    actAs("reviewer");
    const first = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(first.status).toBe(200);
    const second = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 4 }),
        ctx(id)
      )
    );
    expect(second.status).toBe(200);
    expect(second.json.data).toMatchObject({
      status: "published",
      currentVersion: 4,
    });
    expect((await store.listContentVersions(id)).length).toBe(4);
    expect((await store.listAuditEvents(id)).length).toBe(4);
    expect(store.listTranslations().length).toBe(1);
  });

  it("AD. stale expectedVersion fails with 409 (reviewer A/B race)", async () => {
    const id = await driveToApproved();
    actAs("reviewer", "reviewer-A");
    const first = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(first.status).toBe(200);
    // Reviewer B retries with the now-stale version 3.
    actAs("reviewer", "reviewer-B");
    const stale = await readJson(
      await verifyPOST(
        jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
        ctx(id)
      )
    );
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  });
});

describe("13.5C: canonical preservation (Step 20) and no-bypass proofs (AF)", () => {
  it("canonical knowledge rows are untouched; only translations change", async () => {
    store.seedCanonicalEntity("dictionary", "dict-1");
    store.seedCanonicalEntity("kanji", "kanji-1");
    const id = await driveToApproved();
    actAs("reviewer");
    await verifyPOST(
      jsonRequest(`${BASE}/${id}/verify`, "POST", { expectedVersion: 3 }),
      ctx(id)
    );
    expect(await store.canonicalEntityExists("dictionary", "dict-1")).toBe(true);
    expect(await store.canonicalEntityExists("kanji", "kanji-1")).toBe(true);
    // The fake exposes no canonical-write operation at all: the only
    // mutation surface exercised is translations + CMS tables.
    expect(store.listTranslations().length).toBe(1);
  });

  it("TranslationService writes target entity_translations only", async () => {
    const source = readFileSync(
      "src/services/translation/translationService.ts",
      "utf8"
    );
    const targets = [
      ...source.matchAll(/\.(insert|update|delete)\(\s*(\w+)/g),
    ].map((m) => `${m[1]}(${m[2]})`);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toMatch(/^(insert|update)\(entityTranslations\)$/);
    }
  });

  it("AF. raw verification cannot bypass CMS authorization", async () => {
    // 1. No translations route touches TranslationService or the table.
    const routeFiles = [
      "src/app/api/cms/translations/_lib.ts",
      "src/app/api/cms/translations/route.ts",
      "src/app/api/cms/translations/[id]/route.ts",
      "src/app/api/cms/translations/[id]/submit/route.ts",
      "src/app/api/cms/translations/[id]/request-changes/route.ts",
      "src/app/api/cms/translations/[id]/approve/route.ts",
      "src/app/api/cms/translations/[id]/approve-override/route.ts",
      "src/app/api/cms/translations/[id]/verify/route.ts",
    ];
    for (const file of routeFiles) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(`${file}: ${code}`).not.toMatch(
        /TranslationService|entityTranslations|verifyTranslation\(/
      );
    }
    // 2. The verify endpoint delegates to the authorized service method.
    expect(
      readFileSync(
        "src/app/api/cms/translations/[id]/verify/route.ts",
        "utf8"
      )
    ).toMatch(/verifyTranslationProposal/);
    // 3. CmsService names neither the table nor the raw primitive: the
    // port method is its only translation channel.
    const service = readFileSync("src/services/cms/cmsService.ts", "utf8");
    expect(service).not.toMatch(/entityTranslations|TranslationService/);
    expect(service).toMatch(/upsertVerifiedTranslation/);
    // 4. The production adapter delegates to the single storage writer.
    expect(
      readFileSync("src/services/cms/drizzleStore.ts", "utf8")
    ).toMatch(/TranslationService\.addTranslation\(/);
  });
});
