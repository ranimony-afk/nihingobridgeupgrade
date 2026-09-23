/**
 * Phase 13.5F — learner publication overlay tests.
 *
 * Proves: canonical fallback, published-override merge, unpublished
 * exclusion, verified-first translation ordering, search-identity
 * preservation, read-only immutability, safe failures, and the
 * learner/admin boundary. Runs over FakePublicationStore (no database);
 * the Drizzle store's predicates are proven by static contract tests.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import {
  fetchPublishedOverrides,
  mergeDictionaryOverride,
  resolveDictionaryEntries,
  resolveLearnerEntries,
  selectPublishedOverride,
  sortTranslationsVerifiedFirst,
  translationPriorityRank,
} from "@/services/publication";
import type { PublishedDictionaryOverride } from "@/services/publication";
import {
  FakePublicationStore,
  canonicalEntryFixture,
  stagedPayloadFixture,
  translationRowFixture,
} from "./fake-publication-store";

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function overrideFixture(
  entityId: string,
  stagedPayload: unknown
): PublishedDictionaryOverride {
  return {
    entityId,
    sourceRef: "first-party:cms-editorial:v1",
    provenanceType: "editorial_curated",
    stagedPayload,
  };
}

describe("13.5F canonical fallback (1-6)", () => {
  it.each([
    ["1. no CMS records", []],
    ["2. draft only", ["draft"]],
    ["3. review only", ["review"]],
    ["4. approved only", ["approved"]],
    ["5. scheduled only", ["scheduled"]],
    ["6. archived only", ["archived"]],
  ])("%s → canonical", async (_name, statuses) => {
    const store = new FakePublicationStore();
    for (const status of statuses as string[]) {
      store.seed({
        contentType: "dictionary",
        entityId: "de-water",
        status,
        stagedPayload: stagedPayloadFixture({ headword: "MUST-NOT-SHOW" }),
      });
    }
    const canonical = canonicalEntryFixture();
    const { entries, sources } = await resolveLearnerEntries(store, [canonical]);
    expect(entries).toEqual([canonical]);
    expect(sources.get("de-water")).toBe("canonical");
  });
});

describe("13.5F dictionary publication (7-17)", () => {
  let store: FakePublicationStore;
  beforeEach(() => {
    store = new FakePublicationStore();
  });

  it("7-8. published override wins; canonical storage untouched", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({
        headword: "水々",
        reading: "みずみず",
      }),
    });
    const canonical = canonicalEntryFixture();
    const before = JSON.stringify(canonical);
    const { entries, sources } = await resolveLearnerEntries(store, [canonical]);
    expect(entries[0]?.headword).toBe("水々");
    expect(entries[0]?.reading).toBe("みずみず");
    expect(entries[0]?.id).toBe("de-water");
    expect(sources.get("de-water")).toBe("cms");
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it("9. published payload validation merges field-wise", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ reading: "みず-updated" }),
    });
    const { entries } = await resolveLearnerEntries(store, [canonicalEntryFixture()]);
    // CMS reading wins; every other field stays canonical.
    expect(entries[0]).toMatchObject({ reading: "みず-updated", romaji: "mizu" });
    expect(entries[0]?.senses).toEqual([
      { glosses: ["water", "cold water"], note: "noun" },
    ]);
  });

  it("10. malformed published payload → safe canonical fallback", async () => {
    for (const bad of [null, 42, "nope", [], { headword: "  " }, { reading: "x" }]) {
      const shop = new FakePublicationStore();
      shop.seed({
        contentType: "dictionary",
        entityId: "de-water",
        status: "published",
        stagedPayload: bad,
      });
      const canonical = canonicalEntryFixture();
      const { entries, sources, diagnostics } = await resolveLearnerEntries(shop, [
        canonical,
      ]);
      expect(entries).toEqual([canonical]);
      expect(sources.get("de-water")).toBe("canonical");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.kind).toBe("malformed-published-payload");
    }
  });

  it("11-12. override matches by canonical entity id only", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-other",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "MUST-NOT-SHOW" }),
    });
    const canonical = canonicalEntryFixture({ id: "de-water" });
    const { entries, sources } = await resolveLearnerEntries(store, [canonical]);
    expect(entries).toEqual([canonical]);
    expect(sources.get("de-water")).toBe("canonical");
    expect(selectPublishedOverride([], "de-water").status).toBe("none");
  });

  it("13. unknown content type ignored", async () => {
    store.seed({
      contentType: "kanji",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "MUST-NOT-SHOW" }),
    });
    const canonical = canonicalEntryFixture();
    const { entries } = await resolveLearnerEntries(store, [canonical]);
    expect(entries).toEqual([canonical]);
  });

  it("14. orphan override never surfaces", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-ghost",
      status: "published",
      stagedPayload: stagedPayloadFixture(),
    });
    const { entries } = await resolveLearnerEntries(store, [
      canonicalEntryFixture(),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("de-water");
    // Defensive branch: a store that returns an unrequested entity is
    // ignored with an orphan diagnostic, never surfaced.
    const defensive = resolveDictionaryEntries([canonicalEntryFixture()], [
      overrideFixture("de-ghost", stagedPayloadFixture()),
    ]);
    expect(defensive.resolved).toHaveLength(1);
    expect(defensive.resolved[0]?.entry.id).toBe("de-water");
    expect(defensive.diagnostics).toContainEqual({
      kind: "orphan-published-override",
      entityId: "de-ghost",
    });
    // Overrides alone (no canonical row) resolve to nothing.
    const empty = await resolveLearnerEntries(store, []);
    expect(empty.entries).toEqual([]);
  });

  it("15. duplicate published overrides → canonical, no arbitrary pick", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "PICK-A" }),
    });
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "PICK-B" }),
    });
    const canonical = canonicalEntryFixture();
    const { entries, sources, diagnostics } = await resolveLearnerEntries(store, [
      canonical,
    ]);
    expect(entries).toEqual([canonical]);
    expect(sources.get("de-water")).toBe("canonical");
    expect(diagnostics).toContainEqual({
      kind: "duplicate-published-override",
      entityId: "de-water",
      count: 2,
    });
  });

  it("16. rollback resolves the current published payload", async () => {
    // CMS rollback publishes a new version; the resolver always reads
    // the CURRENT staged payload — no version logic in learner reads.
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "v2-headword" }),
    });
    const { entries } = await resolveLearnerEntries(store, [canonicalEntryFixture()]);
    expect(entries[0]?.headword).toBe("v2-headword");
  });

  it("17. archive restores canonical fallback", async () => {
    const shop = new FakePublicationStore();
    shop.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "archived",
      stagedPayload: stagedPayloadFixture({ headword: "MUST-NOT-SHOW" }),
    });
    const canonical = canonicalEntryFixture();
    const { entries } = await resolveLearnerEntries(shop, [canonical]);
    expect(entries).toEqual([canonical]);
  });

  it("override keys never exceed the canonical DTO shape", async () => {
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture(),
    });
    const canonical = canonicalEntryFixture();
    const { entries } = await resolveLearnerEntries(store, [canonical]);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(
      Object.keys(canonical).sort()
    );
    const leaked = JSON.stringify(entries[0]);
    for (const token of ["authorId", "reviewerId", "ipAddress", "audit", "cms_"]) {
      expect(leaked).not.toContain(token);
    }
  });
});

describe("13.5F translation resolution (18-27)", () => {
  it("18-21. verified human ranks first; machine preserved", () => {
    const machine = translationRowFixture({ id: "tr-m", translatedText: "X" });
    const verified = translationRowFixture({
      id: "tr-v",
      translatedText: "Y",
      sourceType: "verified_human",
      isVerified: true,
    });
    expect(translationPriorityRank(verified)).toBe(0);
    expect(translationPriorityRank(machine)).toBe(3);
    const ranked = sortTranslationsVerifiedFirst([machine, verified]);
    expect(ranked.map((r) => r.id)).toEqual(["tr-v", "tr-m"]);
    expect(ranked).toHaveLength(2);
  });

  it("priority ladder: verified_human > verified > canonical > machine", () => {
    const rows = [
      translationRowFixture({ id: "m", sourceType: "machine", isVerified: false }),
      translationRowFixture({ id: "c", sourceType: "canonical", isVerified: false }),
      translationRowFixture({ id: "v", sourceType: "other", isVerified: true }),
      translationRowFixture({ id: "vh", sourceType: "verified_human", isVerified: true }),
    ];
    expect(sortTranslationsVerifiedFirst(rows).map((r) => r.id)).toEqual([
      "vh",
      "v",
      "c",
      "m",
    ]);
  });

  it("22-23. ordering is per-row; languages and alternatives preserved", () => {
    const ta = translationRowFixture({ id: "ta", language: "ta" });
    const ml = translationRowFixture({ id: "ml", language: "ml" });
    const en = translationRowFixture({ id: "en", language: "en" });
    // Equal priority → stable, input order kept, nothing dropped.
    expect(sortTranslationsVerifiedFirst([ta, ml, en]).map((r) => r.id)).toEqual([
      "ta",
      "ml",
      "en",
    ]);
    const alt1 = translationRowFixture({ id: "a1", translatedText: "one" });
    const alt2 = translationRowFixture({ id: "a2", translatedText: "two" });
    expect(sortTranslationsVerifiedFirst([alt1, alt2])).toHaveLength(2);
  });

  it("24. translation ranking is side-effect free", () => {
    const rows = [
      translationRowFixture({ id: "m" }),
      translationRowFixture({
        id: "v",
        sourceType: "verified_human",
        isVerified: true,
      }),
    ];
    const before = JSON.stringify(rows);
    const ranked = sortTranslationsVerifiedFirst(Object.freeze(rows));
    expect(JSON.stringify(rows)).toBe(before);
    expect(ranked.map((r) => r.id)).toEqual(["v", "m"]);
  });

  it("25-27. only verified rows exist after CMS verify; proposals invisible", async () => {
    const { FakeCmsStore } = await import("./cms-fake-store");
    const { getCmsService, setCmsDatabaseOverride, resetCmsDatabaseOverride } =
      await import("@/services/cms");
    const { setActorResolver, resetActorResolver } = await import("@/lib/auth");
    const cms = new FakeCmsStore();
    setCmsDatabaseOverride(cms);
    cms.seedCanonicalEntity("dictionary", "dict-1");
    try {
      setActorResolver(() => ({ id: "editor-1", role: "editor" }));
      const service = getCmsService();
      const draft = await service.createDraft({
        contentType: "translation",
        entityId: "dict-1",
        title: "t",
        stagedPayload: {
          entityType: "dictionary",
          language: "ta",
          translatedText: "தண்ணீர்",
          sourceRef: "test:tamil:v1",
        },
        sourceRef: "first-party:test:v1",
        provenanceType: "editorial_curated",
      });
      // Draft proposal → zero translation rows learner-visible.
      expect(cms.listTranslations()).toHaveLength(0);
      await service.submitForReview(draft.id, { expectedVersion: 1 });
      setActorResolver(() => ({ id: "reviewer-1", role: "reviewer" }));
      await service.approve(draft.id, { expectedVersion: 2 });
      // Approved-but-unverified → still zero rows.
      expect(cms.listTranslations()).toHaveLength(0);
      await service.verifyTranslationProposal(draft.id, { expectedVersion: 3 });
      const rows = cms.listTranslations();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sourceType: "verified_human",
        isVerified: true,
      });
      // Verified row outranks a machine alternative.
      const machine = translationRowFixture({ id: "tr-m", sourceType: "machine" });
      const ranked = sortTranslationsVerifiedFirst([machine, ...(rows as never[])]);
      expect(ranked[0]).toMatchObject({ sourceType: "verified_human" });
    } finally {
      resetActorResolver();
      resetCmsDatabaseOverride();
    }
  });
});

describe("13.5F search + identity integration (28-33)", () => {
  it("28-31. batch merge preserves identity, order, and count", async () => {
    const store = new FakePublicationStore();
    store.seed({
      contentType: "dictionary",
      entityId: "de-b",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "B-CMS" }),
    });
    const rows = [
      canonicalEntryFixture({ id: "de-a", headword: "A" }),
      canonicalEntryFixture({ id: "de-b", headword: "B" }),
      canonicalEntryFixture({ id: "de-c", headword: "C" }),
    ];
    const { entries, sources } = await resolveLearnerEntries(store, rows);
    expect(entries.map((e) => e.id)).toEqual(["de-a", "de-b", "de-c"]);
    expect(entries.map((e) => e.headword)).toEqual(["A", "B-CMS", "C"]);
    expect(sources.get("de-b")).toBe("cms");
    expect(sources.get("de-a")).toBe("canonical");
    // Single bounded batch query regardless of row count (no N+1).
    expect(store.calls).toBe(1);
    expect(store.lastEntityIds).toEqual(["de-a", "de-b", "de-c"]);
  });

  it("32. empty result short-circuits without querying", async () => {
    const store = new FakePublicationStore();
    const result = await resolveLearnerEntries(store, []);
    expect(result.entries).toEqual([]);
    expect(store.calls).toBe(0);
    expect(await fetchPublishedOverrides(store, [])).toEqual([]);
  });

  it("33. overlay applies after canonical matching (never indexes CMS-only)", () => {
    for (const file of [
      "src/services/dictionary/dictionaryService.ts",
      "src/services/search/unifiedSearchService.ts",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      const dbQuery = code.indexOf("from(dictionaryEntries)");
      const overlay = code.indexOf("resolveLearnerEntries(publicationStore");
      expect(dbQuery).toBeGreaterThan(-1);
      expect(overlay).toBeGreaterThan(dbQuery);
    }
  });
});

describe("13.5F compatibility (45-50)", () => {
  it("45. empty CMS behaves like pre-CMS", async () => {
    const store = new FakePublicationStore();
    const rows = [
      canonicalEntryFixture({ id: "de-a" }),
      canonicalEntryFixture({ id: "de-b" }),
    ];
    const before = JSON.stringify(rows);
    const { entries, sources, diagnostics } = await resolveLearnerEntries(store, rows);
    expect(JSON.stringify(entries)).toBe(before);
    expect([...sources.values()]).toEqual(["canonical", "canonical"]);
    expect(diagnostics).toEqual([]);
  });

  it("46-47. canonical entity identity preserved under override", async () => {
    const store = new FakePublicationStore();
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "CMS" }),
    });
    const { entries } = await resolveLearnerEntries(store, [canonicalEntryFixture()]);
    // SRS/XP/analytics join on these identities — all stable.
    expect(entries[0]?.id).toBe("de-water");
    expect(entries[0]?.frequencyRank).toBe(42);
  });

  it("48-49. resolver takes no actor/auth input", () => {
    // Anonymous and authenticated learners share the identical path:
    // the resolver signature carries no identity, and the module
    // imports no auth system.
    expect(resolveLearnerEntries.length).toBe(2);
    expect(mergeDictionaryOverride.length).toBe(2);
    const code = stripComments(
      readFileSync("src/services/publication/dictionaryPublicationResolver.ts", "utf8")
    );
    expect(code).not.toContain("@/lib/auth");
    expect(code).not.toContain("getCurrentActor");
    expect(code).not.toContain("requirePermission");
  });

  it("50. malformed override for one entity spares its neighbors", async () => {
    const store = new FakePublicationStore();
    store.seed({
      contentType: "dictionary",
      entityId: "de-bad",
      status: "published",
      stagedPayload: "garbage",
    });
    store.seed({
      contentType: "dictionary",
      entityId: "de-good",
      status: "published",
      stagedPayload: stagedPayloadFixture({ headword: "GOOD" }),
    });
    const { entries, sources } = await resolveLearnerEntries(store, [
      canonicalEntryFixture({ id: "de-bad", headword: "BAD" }),
      canonicalEntryFixture({ id: "de-good", headword: "good" }),
    ]);
    expect(entries.map((e) => e.headword)).toEqual(["BAD", "GOOD"]);
    expect(sources.get("de-bad")).toBe("canonical");
    expect(sources.get("de-good")).toBe("cms");
  });
});

describe("13.5F failure handling", () => {
  it("CMS read failure rejects (services fall back to canonical)", async () => {
    const store = new FakePublicationStore();
    store.failOnFind = new Error("connection lost");
    await expect(
      resolveLearnerEntries(store, [canonicalEntryFixture()])
    ).rejects.toThrow("connection lost");
    // Every service call site catches and serves canonical instead.
    for (const file of [
      "src/services/dictionary/dictionaryService.ts",
      "src/services/search/unifiedSearchService.ts",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(code).toMatch(/catch[\s\S]{0,120}serving canonical/);
    }
  });

  it("unknown CMS content types never leave the store", async () => {
    // Type filtering is the store's hardcoded predicate: the resolver
    // only ever receives dictionary overrides.
    const store = new FakePublicationStore();
    for (const contentType of ["kanji", "grammar", "sentence", "article", "jlpt"]) {
      store.seed({
        contentType,
        entityId: "de-water",
        status: "published",
        stagedPayload: stagedPayloadFixture({ headword: "X" }),
      });
    }
    expect(await fetchPublishedOverrides(store, ["de-water"])).toEqual([]);
  });
});

describe("13.5F immutability", () => {
  it("learner reads mutate nothing (canonical, CMS payload, translations)", async () => {
    const store = new FakePublicationStore();
    const payload = stagedPayloadFixture({ headword: "CMS" });
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: payload,
    });
    const canonical = canonicalEntryFixture();
    const before = JSON.stringify({ canonical, payload, items: store.items });
    await resolveLearnerEntries(
      store,
      JSON.parse(JSON.stringify([canonical]))
    );
    expect(JSON.stringify({ canonical, payload, items: store.items })).toBe(before);
    // Frozen inputs survive too.
    await resolveLearnerEntries(store, Object.freeze([Object.freeze({ ...canonical })]) as never);
    const translations = Object.freeze([translationRowFixture()]);
    sortTranslationsVerifiedFirst(translations);
  });
});

describe("13.5F content safety (XSS / SQLi at the data layer)", () => {
  it("dangerous payload text stays inert data", async () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>javascript:evil()';
    const store = new FakePublicationStore();
    store.seed({
      contentType: "dictionary",
      entityId: "de-water",
      status: "published",
      stagedPayload: stagedPayloadFixture({
        headword: evil,
        senses: [{ glosses: [evil] }],
      }),
    });
    const { entries } = await resolveLearnerEntries(store, [canonicalEntryFixture()]);
    // Preserved exactly as data — React text rendering escapes it;
    // no decoding, no HTML parsing, no URL interpretation here.
    expect(entries[0]?.headword).toBe(evil);
    expect(
      (entries[0]?.senses[0] as { glosses: string[] }).glosses[0]
    ).toBe(evil);
  });

  it("SQL metacharacters in ids are opaque keys, never spliced", async () => {
    const store = new FakePublicationStore();
    const nasty = "x' OR '1'='1";
    store.seed({
      contentType: "dictionary",
      entityId: nasty,
      status: "published",
      stagedPayload: stagedPayloadFixture(),
    });
    const { entries, sources } = await resolveLearnerEntries(store, [
      canonicalEntryFixture({ id: nasty }),
    ]);
    expect(sources.get(nasty)).toBe("cms");
    const drizzleStore = stripComments(
      readFileSync("src/services/publication/drizzlePublicationStore.ts", "utf8")
    );
    expect(drizzleStore).toContain("inArray(");
    expect(drizzleStore).not.toContain("sql`");
    expect(drizzleStore).not.toMatch(/\+ entityId|entityId \+|\$\{.*entity/);
  });
});

describe("13.5F drizzle store contract (static)", () => {
  const file = "src/services/publication/drizzlePublicationStore.ts";

  it("predicates are hardcoded; projection is learner-safe", () => {
    const code = stripComments(readFileSync(file, "utf8"));
    expect(code).toContain('eq(cmsContentItems.contentType, "dictionary")');
    expect(code).toContain('eq(cmsContentItems.status, "published")');
    expect(code).toContain("inArray(cmsContentItems.entityId");
    for (const token of ["authorId", "reviewerId", "ipAddress", "Audit", "Version"]) {
      expect(code).not.toContain(token);
    }
    expect(code).not.toContain("searchParams");
    expect(code).not.toContain("request.");
  });
});

describe("13.5F wiring (static)", () => {
  it("learner services call the resolvers (and only the resolvers)", () => {
    const dict = stripComments(
      readFileSync("src/services/dictionary/dictionaryService.ts", "utf8")
    );
    expect(dict).toContain("resolveLearnerEntries(publicationStore, rows)");
    expect(dict).toContain("resolveLearnerEntries(publicationStore, [entry])");
    expect(dict).not.toContain("CmsService");
    expect(dict).not.toContain("cmsContentItems");

    const trans = stripComments(
      readFileSync("src/services/translation/translationService.ts", "utf8")
    );
    expect(trans).toContain("sortTranslationsVerifiedFirst(rows as EntityTranslation[])");
    expect(trans).not.toContain("CmsService");

    const reverse = stripComments(
      readFileSync("src/services/translation/reverseSearchService.ts", "utf8")
    );
    expect(reverse).toContain("sortTranslationsVerifiedFirst(matches)");

    const search = stripComments(
      readFileSync("src/services/search/unifiedSearchService.ts", "utf8")
    );
    expect(search).toContain("resolveLearnerEntries(publicationStore, rows)");
    expect(search).toContain("options.publicationStore ?? defaultPublicationStore");
  });

  it("learner reads perform no writes", () => {
    for (const file of [
      "src/services/publication/dictionaryPublicationResolver.ts",
      "src/services/publication/translationPriority.ts",
      "src/services/publication/types.ts",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of [".insert(", ".update(", ".delete(", "verifyTranslation("]) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
    // Read services gained no write calls either (the translation
    // file legitimately DEFINES the storage primitive; no caller may
    // invoke it from a read path).
    for (const file of [
      "src/services/dictionary/dictionaryService.ts",
      "src/services/translation/translationService.ts",
      "src/services/translation/reverseSearchService.ts",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of [
        "this.verifyTranslation(",
        "TranslationService.verifyTranslation(",
        "await verifyTranslation(",
      ]) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
  });

  it("learner surfaces never touch CMS admin internals", () => {
    const learnerFiles = [
      "src/app/dictionary/page.tsx",
      "src/app/dictionary/[id]/page.tsx",
      "src/app/api/dictionary/route.ts",
      "src/app/api/dictionary/[id]/route.ts",
      "src/app/api/search/route.ts",
      "src/services/dictionary/dictionaryService.ts",
      "src/services/search/unifiedSearchService.ts",
      "src/services/translation/translationService.ts",
      "src/services/translation/reverseSearchService.ts",
    ];
    for (const file of learnerFiles) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of [
        "services/cms",
        "/api/cms/",
        "cms_content_items",
        "cms_content_versions",
        "cms_audit_log",
        "CmsService",
        "CmsStore",
        "ipAddress",
        "dangerouslySetInnerHTML",
      ]) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
    // Learner UI performs no direct database access.
    for (const file of [
      "src/app/dictionary/page.tsx",
      "src/app/dictionary/[id]/page.tsx",
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of ['from "@/db"', "drizzle-orm", 'from "pg"']) {
        expect(`${file}: ${code}`).not.toContain(token);
      }
    }
  });
});
