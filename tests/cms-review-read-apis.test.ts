/**
 * Phase 13.5D-1 — review read APIs (versions + audit × 2 slices).
 *
 * Route handlers run over FakeCmsStore via setCmsDatabaseOverride.
 * Proves: cms.read gating per the actual matrix, slice isolation,
 * IP-stripped audit shape, spoof rejection, and read-only behavior.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import type { CmsRole } from "@/lib/auth";
import { resetActorResolver, setActorResolver } from "@/lib/auth";
import {
  getCmsService,
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import { FakeCmsStore } from "./cms-fake-store";

import { GET as dictVersionsGET } from "@/app/api/cms/dictionary/[id]/versions/route";
import { GET as dictAuditGET } from "@/app/api/cms/dictionary/[id]/audit/route";
import { GET as transVersionsGET } from "@/app/api/cms/translations/[id]/versions/route";
import { GET as transAuditGET } from "@/app/api/cms/translations/[id]/audit/route";

let store: FakeCmsStore;
let dictId: string;
let transId: string;

beforeEach(async () => {
  resetActorResolver();
  resetCmsDatabaseOverride();
  store = new FakeCmsStore();
  setCmsDatabaseOverride(store);
  store.seedCanonicalEntity("dictionary", "dict-1");

  // Dictionary item with 3 versions/audits; first audit carries an IP.
  actAs("editor");
  const service = getCmsService();
  const dict = await service.createDraft({
    contentType: "dictionary",
    entityId: null,
    title: "water",
    stagedPayload: { headword: "水", reading: "みず" },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    context: { ipAddress: "9.9.9.9" },
  });
  dictId = dict.id;
  await service.updateDraft(dictId, { expectedVersion: 1, title: "water!" });
  await service.submitForReview(dictId, { expectedVersion: 2 });

  // Translation proposal with 3 versions/audits.
  const trans = await service.createDraft({
    contentType: "translation",
    entityId: "dict-1",
    title: "Tamil gloss",
    stagedPayload: {
      entityType: "dictionary",
      language: "ta",
      translatedText: "தண்ணீர்",
      sourceRef: "test:tamil-lexicon:v1",
    },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
  });
  transId = trans.id;
  await service.updateDraft(transId, {
    expectedVersion: 1,
    editorialNotes: "check gloss",
  });
  await service.submitForReview(transId, { expectedVersion: 2 });
});

function actAs(role: CmsRole, id = `${role}-1`) {
  setActorResolver(() => ({ id, role }));
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

const ROUTES = [
  { name: "dictionary versions", run: dictVersionsGET, id: () => dictId },
  { name: "dictionary audit", run: dictAuditGET, id: () => dictId },
  { name: "translation versions", run: transVersionsGET, id: () => transId },
  { name: "translation audit", run: transAuditGET, id: () => transId },
] as const;

describe("13.5D-1: authorization per the actual matrix", () => {
  it("anonymous → 401 on all four routes", async () => {
    setActorResolver(() => null);
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request("http://localhost/x"), ctx(route.id()))
      );
      expect(`${route.name}: ${res.status}`).toBe(`${route.name}: 401`);
    }
  });

  it("learner → 403 on all four routes", async () => {
    actAs("learner");
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request("http://localhost/x"), ctx(route.id()))
      );
      expect(`${route.name}: ${res.status}`).toBe(`${route.name}: 403`);
    }
  });

  it("editor/reviewer/admin → 200 (all hold cms.read in the real matrix)", async () => {
    for (const role of ["editor", "reviewer", "admin"] as const) {
      actAs(role);
      for (const route of ROUTES) {
        const res = await readJson(
          await route.run(new Request("http://localhost/x"), ctx(route.id()))
        );
        expect(`${role} ${route.name}: ${res.status}`).toBe(
          `${role} ${route.name}: 200`
        );
      }
    }
  });
});

describe("13.5D-1: slice isolation and missing ids", () => {
  it("same-slice reads succeed", async () => {
    actAs("reviewer");
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request("http://localhost/x"), ctx(route.id()))
      );
      expect(res.status).toBe(200);
    }
  });

  it("cross-slice reads 404 without revealing the other slice", async () => {
    actAs("reviewer");
    const cases = [
      { run: transVersionsGET, id: dictId },
      { run: transAuditGET, id: dictId },
      { run: dictVersionsGET, id: transId },
      { run: dictAuditGET, id: transId },
    ] as const;
    for (const c of cases) {
      const res = await readJson(
        await c.run(new Request("http://localhost/x"), ctx(c.id))
      );
      expect(res.status).toBe(404);
      expect(res.json).toMatchObject({ error: { code: "NOT_FOUND" } });
    }
  });

  it("missing ids 404 on all four routes", async () => {
    actAs("reviewer");
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request("http://localhost/x"), ctx("missing-id"))
      );
      expect(`${route.name}: ${res.status}`).toBe(`${route.name}: 404`);
    }
  });
});

describe("13.5D-1: response shape and IP stripping", () => {
  it("versions preserve the service shape", async () => {
    actAs("reviewer");
    const res = await readJson(
      await dictVersionsGET(new Request("http://localhost/x"), ctx(dictId))
    );
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    const versions = (res.json.data as { versions: Record<string, unknown>[] })
      .versions;
    expect(versions.length).toBe(3);
    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2, 3]);
    expect(versions[0]).toMatchObject({
      contentItemId: dictId,
      statusAtSnapshot: "draft",
      createdById: "editor-1",
    });
    expect(versions[0]?.snapshotPayload).toMatchObject({ headword: "水" });
    expect(typeof versions[0]?.changeSummary).toBe("string");
  });

  it("audit exposes history but never ipAddress", async () => {
    // Prove the stored row really carries an IP (else stripping is vacuous).
    const stored = await store.listAuditEvents(dictId);
    expect(stored.some((e) => e.ipAddress === "9.9.9.9")).toBe(true);

    actAs("reviewer");
    const res = await readJson(
      await dictAuditGET(new Request("http://localhost/x"), ctx(dictId))
    );
    expect(res.status).toBe(200);
    const audit = (res.json.data as { audit: Record<string, unknown>[] }).audit;
    expect(audit.length).toBe(3);
    expect(audit.map((e) => e.action)).toEqual([
      "create_draft",
      "edit",
      "submit_review",
    ]);
    for (const event of audit) {
      expect(event).not.toHaveProperty("ipAddress");
      expect(Object.keys(event).sort()).toEqual([
        "action",
        "actorId",
        "contentItemId",
        "details",
        "id",
        "occurredAt",
      ]);
    }
    expect(JSON.stringify(res.json)).not.toContain("9.9.9.9");
    expect(JSON.stringify(res.json)).not.toContain("ipAddress");
  });

  it("translation audit is likewise IP-free with structured details", async () => {
    actAs("reviewer");
    const res = await readJson(
      await transAuditGET(new Request("http://localhost/x"), ctx(transId))
    );
    expect(res.status).toBe(200);
    const audit = (res.json.data as { audit: Record<string, unknown>[] }).audit;
    expect(audit.length).toBe(3);
    expect(JSON.stringify(res.json)).not.toContain("ipAddress");
  });
});

describe("13.5D-1: spoofing and read-only guarantee", () => {
  it("query/body identity spoofing has no effect", async () => {
    const spoofed =
      "http://localhost/x?userId=admin-1&role=admin&actorId=admin-1";
    setActorResolver(() => null);
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request(spoofed), ctx(route.id()))
      );
      expect(`${route.name}: ${res.status}`).toBe(`${route.name}: 401`);
    }
    actAs("learner");
    for (const route of ROUTES) {
      const res = await readJson(
        await route.run(new Request(spoofed), ctx(route.id()))
      );
      expect(`${route.name}: ${res.status}`).toBe(`${route.name}: 403`);
    }
  });

  it("the four reads mutate nothing", async () => {
    actAs("reviewer");
    const before = {
      dictVersions: (await store.listContentVersions(dictId)).length,
      dictAudits: (await store.listAuditEvents(dictId)).length,
      transVersions: (await store.listContentVersions(transId)).length,
      transAudits: (await store.listAuditEvents(transId)).length,
      translations: store.listTranslations().length,
      dictStatus: (await store.getContentItem(dictId))?.status,
      transStatus: (await store.getContentItem(transId))?.status,
    };
    await dictVersionsGET(new Request("http://localhost/x"), ctx(dictId));
    await dictAuditGET(new Request("http://localhost/x"), ctx(dictId));
    await transVersionsGET(new Request("http://localhost/x"), ctx(transId));
    await transAuditGET(new Request("http://localhost/x"), ctx(transId));
    const after = {
      dictVersions: (await store.listContentVersions(dictId)).length,
      dictAudits: (await store.listAuditEvents(dictId)).length,
      transVersions: (await store.listContentVersions(transId)).length,
      transAudits: (await store.listAuditEvents(transId)).length,
      translations: store.listTranslations().length,
      dictStatus: (await store.getContentItem(dictId))?.status,
      transStatus: (await store.getContentItem(transId))?.status,
    };
    expect(after).toEqual(before);
  });
});

describe("13.5D-1: static guards", () => {
  const routeFiles = [
    "src/app/api/cms/dictionary/[id]/versions/route.ts",
    "src/app/api/cms/dictionary/[id]/audit/route.ts",
    "src/app/api/cms/translations/[id]/versions/route.ts",
    "src/app/api/cms/translations/[id]/audit/route.ts",
  ];

  it("routes delegate to the service and carry no SQL, secrets, or identity reads", async () => {
    for (const file of routeFiles) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(`${file}: ${code}`).toMatch(/getVersions|getAuditTrail/);
      expect(`${file}: ${code}`).not.toMatch(
        /drizzle-orm|from "@\/db"|@\/db\/schema|\.insert\(|\.update\(|\.delete\(|ADMIN_API_SECRET|x-admin-key|ipAddress|userId|actorId|getSession\(/
      );
    }
  });

  it("audit routes sanitize through the shared whitelist", async () => {
    for (const file of [
      "src/app/api/cms/dictionary/[id]/audit/route.ts",
      "src/app/api/cms/translations/[id]/audit/route.ts",
    ]) {
      expect(readFileSync(file, "utf8")).toMatch(/sanitizeAuditEvents/);
    }
  });
});
