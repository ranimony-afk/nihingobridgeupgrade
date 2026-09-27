/**
 * Gate A11 — live route verification for `GET /api/v1/mobile/dictionary/search`.
 *
 * Separated from `mobile-dictionary-search-api.test.ts` on purpose: that file mocks
 * `@/services/dictionary` to pin the transport/projection contract DB-free, so it can never
 * exercise the real service. This file imports **nothing mocked** — it runs the real route, the
 * real `DictionaryService`, the real `sanitizeSearchQuery`/`detectSearchScript` and the real
 * `classifyJlptLevel` against a disposable database.
 *
 * Gate 1.5 corpus contract: the dictionary table is CUMULATIVE (the first-party seed corpus
 * from `src/data/lexicon.ts`, seeded idempotently by `KnowledgeCorpusService.ensureSeeded`,
 * coexists with JMdict and future tiers). Assertions of this suite's own contract are scoped
 * to the first-party subset via the existing `sourceRef` discriminator
 * (`first-party:dictionary-core:v1`) rather than assuming `dictionary_entries` holds nothing
 * else; assertions owned by the route/service pipeline itself (order preservation, projection,
 * pagination arithmetic) run over the cumulative result set and are derived from the
 * response's own values.
 *
 * No corpus bytes are involved: the JMdict/KANJIDIC2/KanjiVG tiers stay untouched, no row is
 * fabricated, and when no database is reachable the whole file skips with an explicit reason
 * rather than weakening its assertions.
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";

import { GET as mobileSearchGET } from "@/app/api/v1/mobile/dictionary/search/route";
import { DictionaryService } from "@/services/dictionary";
import { db } from "@/db";
import { dictionaryEntries } from "@/db/schema";
import { DICTIONARY_SOURCE_REF } from "@/data/lexicon";

const FROZEN_ITEM_KEYS = [
  "headword",
  "id",
  "isCommon",
  "jlptLevel",
  "jlptStatus",
  "kanjiCharacters",
  "primaryGlosses",
  "reading",
  "romaji",
];

function getRequest(pathWithQuery: string): NextRequest {
  const url = new URL(pathWithQuery, "http://localhost");
  return { nextUrl: url, url: url.toString(), method: "GET" } as unknown as NextRequest;
}

describe("A11 §19/§13 — live route over the seeded first-party corpus", () => {
  let unavailable: string | null = null;

  beforeAll(async () => {
    try {
      // Probe and seed in one idempotent step. Throws when no database is reachable,
      // which is the only condition this gate skips on — never on "no rows found",
      // because the assertions below are what prove the rows exist.
      await DictionaryService.ensureInitialized();
      await DictionaryService.searchEntries({ query: "a11-probe", limit: 1 });
    } catch (error) {
      unavailable = `A11 live layer: no reachable disposable database (${
        error instanceof Error ? error.message : String(error)
      })`;
    }
  });

  it("serves real seeded rows through the real service, projected to the frozen item", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.query).toBe("mizu");
    expect(data.detectedScript).toBe("romaji");
    expect(data.total).toBeGreaterThan(0);

    const mizu = data.entries.find((entry: { id: string }) => entry.id === "de-mizu");
    expect(mizu).toBeDefined();
    expect(Object.keys(mizu).sort()).toEqual(FROZEN_ITEM_KEYS);
    expect(mizu.primaryGlosses).toContain("water");
    expect(mizu.jlptStatus).toBe("known");
    expect(mizu.jlptLevel).toBe("N5");
    expect(mizu.kanjiCharacters).toContain("水");

    // Real rows carry frequencyRank/tags/partsOfSpeech/sourceRef — none may surface.
    const serialized = JSON.stringify(data);
    for (const key of ["frequencyRank", "partsOfSpeech", "tags", "sourceRef", "senses"]) {
      expect(mizu).not.toHaveProperty(key);
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  it("finds the same entry by Japanese headword and by kana reading", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    for (const [query, expectedScript] of [
      ["水", "kanji"],
      ["みず", "kana"],
    ] as const) {
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(query)}`)
      );
      const { data } = await res.json();

      expect(data.detectedScript).toBe(expectedScript);
      expect(data.entries.map((entry: { id: string }) => entry.id)).toContain("de-mizu");
    }
  });

  it("paginates real rows with an exact hasMore and no page overlap", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    // Gate 1.5 corpus scoping: `q=n` matches the whole FIRST-PARTY corpus — exactly 30
    // dictionary entries when scoped by the existing `sourceRef` discriminator — while the
    // route additionally serves every other dictionary tier (cumulative corpus model).
    const [fpScope] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.sourceRef, DICTIONARY_SOURCE_REF));
    expect(fpScope.count).toBe(30);

    // The walk paginates the first-party slice through the real route: `level=N5` confines the
    // measured subject to first-party rows (JMdict rows carry jlptLevel "NONE"), and the tier
    // assertion at the end fails loudly if a later tier ever contributes rows here. The
    // expectations below are derived from the response's own `total`, so the test measures the
    // pipeline rather than hard-coding a corpus size.
    const probe = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=n&level=N5&limit=1")
    );
    const total = (await probe.json()).data.total;
    expect(total).toBeGreaterThan(6);

    const first = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=n&level=N5&limit=5&offset=0")
    );
    const firstBody = await first.json();
    const firstIds = firstBody.data.entries.map((entry: { id: string }) => entry.id);

    expect(firstIds).toHaveLength(5);
    expect(firstBody.data.limit).toBe(5);
    expect(firstBody.data.offset).toBe(0);
    expect(firstBody.data.total).toBe(total);
    expect(firstBody.data.hasMore).toBe(0 + firstIds.length < total);

    const second = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=n&level=N5&limit=5&offset=5")
    );
    const secondBody = await second.json();
    const secondIds = secondBody.data.entries.map((entry: { id: string }) => entry.id);

    expect(secondIds).toHaveLength(5);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
    expect(secondBody.data.hasMore).toBe(5 + secondIds.length < total);

    // Final page: offset + returned === total → hasMore must be exactly false.
    const lastOffset = total - 5;
    const last = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=n&level=N5&limit=5&offset=${lastOffset}`)
    );
    const lastBody = await last.json();

    expect(lastBody.data.entries).toHaveLength(5);
    expect(lastBody.data.hasMore).toBe(lastOffset + lastBody.data.entries.length < total);
    expect(lastBody.data.hasMore).toBe(false);

    // One row beyond the end: empty page, still 200.
    const beyond = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=n&level=N5&limit=5&offset=${total + 5}`)
    );
    expect(beyond.status).toBe(200);
    expect((await beyond.json()).data.entries).toEqual([]);

    // Tier isolation of the measured subject, asserted through the existing discriminator on
    // real service rows for the same query — never assumed from tier naming alone.
    const tierProbe = await DictionaryService.searchEntries({
      query: "n",
      jlptLevel: "N5",
      limit: 100,
      offset: 0,
    });
    for (const entry of tierProbe.entries) {
      expect(entry.sourceRef).toBe(DICTIONARY_SOURCE_REF);
    }
  });

  it("applies the service ceiling to a boundary-clamped limit and echoes the applied value", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=n&limit=200")
    );
    const { data } = await res.json();

    // The route boundary permits 200; the service applies its own tighter ceiling of 100.
    expect(data.limit).toBe(100);
    expect(data.entries.length).toBeLessThanOrEqual(100);
    expect(data.hasMore).toBe(data.offset + data.entries.length < data.total);
  });

  it("filters real rows by JLPT level through the canonical pipeline", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=n&level=N5&limit=5")
    );
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.appliedJlptLevel).toBe("N5");
    expect(data.entries.length).toBeGreaterThan(0);
    for (const entry of data.entries) {
      expect(entry.jlptLevel).toBe("N5");
      expect(entry.jlptStatus).toBe("known");
    }
  });

  it("returns zero matches as a 200 empty page, not a 404", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=zzzznotaword")
    );
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(0);
    expect(data.entries).toEqual([]);
    expect(data.hasMore).toBe(false);
  });

  it("is inert with respect to targetLanguage against real data too", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    const plain = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const withLanguage = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&targetLanguage=ta")
    );

    expect(await withLanguage.json()).toEqual(await plain.json());
  });

  /*
   * A13 — ordering. The A11 live layer proved pagination *arithmetic* (hasMore, no overlap) but never
   * the order itself, because a mocked service returns a fixture in fixture order. These two tests run
   * against real seeded rows, so they pin the ranking the service actually applies.
   */

  it("promotes an exact match above a better-ranked row on real data", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    // Measured on the first-party corpus (scoped by the existing `sourceRef` discriminator):
    // `hon` matches exactly one headword/reading/romaji (`de-hon`, romaji `hon`, frequency_rank
    // 150) plus one substring match (`de-nihon`, romaji `nihon`, frequency_rank 90). Frequency
    // order alone would put `de-nihon` first, so this is the case that distinguishes the
    // exact-match rank from the frequency tie-break. Other tiers legitimately match `hon` too
    // (the cumulative corpus model); they are outside this suite's contract and are excluded
    // from the ranked expectation rather than assumed absent.
    const viaService = await DictionaryService.searchEntries({ query: "hon", limit: 10, offset: 0 });
    const fpEntries = viaService.entries.filter((entry) => entry.sourceRef === DICTIONARY_SOURCE_REF);
    const ranked = fpEntries.map((entry) => entry.id);

    expect(ranked).toEqual(["de-hon", "de-nihon"]);
    expect(fpEntries).toHaveLength(2);
    // The premise, asserted rather than asserted-in-a-comment: the winner is the worse-ranked row.
    expect(fpEntries[0].frequencyRank).toBeGreaterThan(fpEntries[1].frequencyRank as number);

    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=hon&limit=10&offset=0")
    );
    const { data } = await res.json();

    // The route must preserve the service order of the same window, not re-rank the projected
    // page — over the cumulative result set, of which the first-party rows above are the subset
    // this suite owns.
    expect(data.entries.map((entry: { id: string }) => entry.id)).toEqual(
      viaService.entries.map((entry) => entry.id)
    );
    // The route echoes the service's cumulative total exactly (never a partial restatement).
    expect(data.total).toBe(viaService.total);
  });

  it("orders a full real page by the frozen tie-break and keeps every page a slice of it", async (ctx) => {
    if (unavailable) ctx.skip(unavailable);

    // `q=a` is a pure substring class on the FIRST-PARTY corpus (scoped by the existing
    // `sourceRef` discriminator): no first-party row's headword, reading or romaji equals "a",
    // so the first-party subset is ordered by the tie-break alone — frequency ascending with
    // NULLs last, then common-first, then id — which is what makes it a test of order rather
    // than of rank. Other tiers may legitimately carry exact matches (JMdict rows with romaji
    // "a" rank above the substring class); the slice property below covers the full cumulative
    // page while the tie-break contract is asserted on the first-party subset.
    const full = await DictionaryService.searchEntries({ query: "a", limit: 100, offset: 0 });
    const serviceOrder = full.entries.map((entry) => entry.id);
    const fpPage = full.entries.filter((entry) => entry.sourceRef === DICTIONARY_SOURCE_REF);
    const ordered = fpPage.map((entry) => entry.id);
    expect(ordered.length).toBeGreaterThan(1);

    const observed = fpPage.map((entry) => ({
      frequency: entry.frequencyRank,
      isCommon: entry.isCommon,
      id: entry.id,
    }));

    // Assert the premise instead of assuming it: if a first-party row ever became an exact match
    // for "a", the exact-match rank would legitimately move it and the tie-break assertion below
    // would misreport that as an ordering defect.
    expect(
      fpPage.some(
        (entry) =>
          entry.headword === "a" ||
          entry.reading === "a" ||
          (entry.romaji ?? "").toLowerCase() === "a"
      )
    ).toBe(false);

    const sorted = [...observed].sort((left, right) => {
      if (left.frequency !== right.frequency) {
        if (left.frequency === null) return 1;
        if (right.frequency === null) return -1;
        return left.frequency - right.frequency;
      }
      if (left.isCommon !== right.isCommon) return left.isCommon ? -1 : 1;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    expect(observed).toEqual(sorted);

    // Every window must be the corresponding slice of the service's full-page order — the
    // property that makes offset pagination safe to resume, and the reason D-12 found no dedup
    // pass to preserve. Derived from the response's own totals, so it holds for the cumulative
    // result set as well.
    const total = (await (await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=a&limit=1&offset=0")
    )).json()).data.total;

    for (let offset = 0; offset < Math.min(serviceOrder.length, 12); offset += 5) {
      const page = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=a&limit=5&offset=${offset}`)
      );
      const pageBody = await page.json();

      expect(pageBody.data.entries.map((entry: { id: string }) => entry.id)).toEqual(
        serviceOrder.slice(offset, offset + 5)
      );
      expect(pageBody.data.total).toBe(total);
      expect(pageBody.data.hasMore).toBe(offset + pageBody.data.entries.length < total);
    }

    // Same request twice → same bytes, so a resumed client cannot see the order move under it.
    const again = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=a&limit=5&offset=0")
    );
    const once = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=a&limit=5&offset=0")
    );
    expect(await again.text()).toBe(await once.text());
  });
});
