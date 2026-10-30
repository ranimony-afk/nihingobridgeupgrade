/**
 * M9A regression tests — element-filter contract through the database-backed
 * service and the /api/kanji route (the exact data flow behind the owner's
 * “丁 count 1 / No kanji match this filter” screenshot).
 *
 * Requires DATABASE_URL like the rest of the retrieval suite; seeding is the
 * standard KnowledgeService.ensureSeeded() path. Read-only: no writes beyond
 * first-run seeding.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { GET as kanjiListGET } from "@/app/api/kanji/route";
import { db } from "@/db";
import { COMPOSITION, ELEMENTS, EXTRA_ELEMENTS, KANJI } from "@/data/kanji";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

function request(path: string): NextRequest {
  const nextUrl = new URL(path, "http://localhost");
  return { nextUrl, url: nextUrl.toString(), method: "GET" } as NextRequest;
}

/**
 * Independent SQL expectations — these re-state the documented contract in
 * SQL instead of importing the implementation, so the assertions hold in any
 * database state (fresh seed or after idempotent ETL tests ran in the same
 * suite) while still catching pipeline regressions.
 */
async function dbRelationshipCount(elementId: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM kanji_composition WHERE element_id = ${elementId}`,
  );
  return (r.rows as Array<{ n: number }>)[0].n;
}

async function dbDistinctKanjiCount(elementId: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(DISTINCT c.kanji_id)::int AS n
        FROM kanji_composition c
        JOIN kanji_entries k ON k.id = c.kanji_id
        WHERE c.element_id = ${elementId}`,
  );
  return (r.rows as Array<{ n: number }>)[0].n;
}

async function dbDistinctCharacters(elementId: string): Promise<string[]> {
  const r = await db.execute(
    sql`SELECT DISTINCT k.character AS ch
        FROM kanji_composition c
        JOIN kanji_entries k ON k.id = c.kanji_id
        WHERE c.element_id = ${elementId}
        ORDER BY k.character`,
  );
  return (r.rows as Array<{ ch: string }>).map((row) => row.ch);
}

async function dbVisibleCount(elementId: string, level: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(DISTINCT c.kanji_id)::int AS n
        FROM kanji_composition c
        JOIN kanji_entries k ON k.id = c.kanji_id
        WHERE c.element_id = ${elementId} AND k.jlpt_level = ${level}`,
  );
  return (r.rows as Array<{ n: number }>)[0].n;
}

/** True when the database is still exactly the first-party seed snapshot. */
async function isPristineSeed(): Promise<boolean> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM kanji_entries`);
  return (r.rows as Array<{ n: number }>)[0].n === KANJI.length;
}

describe("M9A · KnowledgeService element-filter contract (DB)", () => {
  beforeAll(async () => {
    await KnowledgeService.ensureSeeded();
  });

  it("element 丁 without other facets returns exactly its catalog kanji", async () => {
    const result = await KnowledgeService.listKanji({ elementId: "el-chou", limit: 500 });
    expect(result.total).toBe(1);
    expect(result.kanji.map((k) => k.character)).toEqual(["灯"]);
    expect(result.catalogTotal).toBeGreaterThanOrEqual(KANJI.length);
    expect(result.elementFilter).toMatchObject({
      elementId: "el-chou",
      relationshipCount: 1,
      catalogKanjiCount: 1,
      visibleKanjiCount: 1,
      zeroKind: null,
    });
    expect(result.emptyKind).toBeNull();
  });

  it("element 丁 + incompatible level returns 0 with a named exclusion, not a bare empty", async () => {
    const result = await KnowledgeService.listKanji({ elementId: "el-chou", level: "N5", limit: 500 });
    expect(result.total).toBe(0);
    expect(result.kanji).toEqual([]);
    expect(result.elementFilter).toMatchObject({
      catalogKanjiCount: 1,
      visibleKanjiCount: 0,
      zeroKind: "element-excluded-by-level",
      excluded: { total: 1, byLevelOnly: 1, byKeywordOnly: 0, byBoth: 0 },
    });
  });

  it("木 distinguishes graph relationships from distinct catalog kanji through the service", async () => {
    const [result, dbRelationships, dbDistinct] = await Promise.all([
      KnowledgeService.listKanji({ elementId: "el-ki", limit: 500 }),
      dbRelationshipCount("el-ki"),
      dbDistinctKanjiCount("el-ki"),
    ]);
    expect(result.elementFilter!.relationshipCount).toBe(dbRelationships);
    expect(result.elementFilter!.catalogKanjiCount).toBe(dbDistinct);
    expect(result.total).toBe(dbDistinct);
    // Distinct-kanji units can never exceed graph-edge units.
    expect(dbDistinct).toBeLessThanOrEqual(dbRelationships);
    // Documented pristine-seed units (8 relationships / 5 distinct kanji).
    if (result.catalogTotal === KANJI.length && dbRelationships === 8) {
      expect(dbDistinct).toBe(5);
    }
  });

  it("日 and 月 return exactly their catalog membership sets", async () => {
    const [hi, hiChars, tsuki, tsukiChars] = await Promise.all([
      KnowledgeService.listKanji({ elementId: "el-hi2", limit: 500 }),
      dbDistinctCharacters("el-hi2"),
      KnowledgeService.listKanji({ elementId: "el-tsuki", limit: 500 }),
      dbDistinctCharacters("el-tsuki"),
    ]);
    expect(hi.total).toBe(hiChars.length);
    expect(hi.kanji.map((k) => k.character).sort()).toEqual([...hiChars].sort());
    expect(tsuki.total).toBe(tsukiChars.length);
    expect(tsuki.kanji.map((k) => k.character).sort()).toEqual([...tsukiChars].sort());
    // Documented pristine-seed sets.
    if (await isPristineSeed()) {
      expect([...hiChars].sort()).toEqual(["時", "明", "間"].sort());
      expect(tsukiChars).toEqual(["明"]);
    }
  });

  it("zero-graph-edge element returns an accurate zero with reason code", async () => {
    // Pick a zero-edge element straight from the database so the assertion
    // stays honest in any catalog state (金 is the pristine-seed example).
    const zeroRows = await db.execute(
      sql`SELECT id FROM kanji_radicals r
          WHERE NOT EXISTS (
            SELECT 1 FROM kanji_composition c WHERE c.element_id = r.id
          )
          ORDER BY id LIMIT 1`,
    );
    const zeroId = (zeroRows.rows as Array<{ id: string }>)[0].id;
    expect(await dbRelationshipCount(zeroId)).toBe(0);

    const result = await KnowledgeService.listKanji({ elementId: zeroId, limit: 500 });
    expect(result.total).toBe(0);
    expect(result.elementFilter).toMatchObject({
      relationshipCount: 0,
      catalogKanjiCount: 0,
      visibleKanjiCount: 0,
      zeroKind: "element-no-relationships",
    });
    if (await isPristineSeed()) {
      expect(await dbRelationshipCount("el-kane")).toBe(0);
    }
  });

  it("unknown element ids do not crash and match nothing", async () => {
    const result = await KnowledgeService.listKanji({ elementId: "el-does-not-exist", limit: 500 });
    expect(result.total).toBe(0);
    expect(result.elementFilter!.zeroKind).toBe("element-unknown");
  });

  it("listElements reports the three-number contract per element (SQL-verified)", async () => {
    const elements = await KnowledgeService.listElements();
    const [relRows, distinctRows] = await Promise.all([
      db.execute(
        sql`SELECT element_id, count(*)::int AS n FROM kanji_composition GROUP BY element_id`,
      ),
      db.execute(
        sql`SELECT c.element_id, count(DISTINCT c.kanji_id)::int AS n
            FROM kanji_composition c
            JOIN kanji_entries k ON k.id = c.kanji_id
            GROUP BY c.element_id`,
      ),
    ]);
    const relByElement = new Map(
      (relRows.rows as Array<{ element_id: string; n: number }>).map((r) => [r.element_id, r.n]),
    );
    const distinctByElement = new Map(
      (distinctRows.rows as Array<{ element_id: string; n: number }>).map((r) => [r.element_id, r.n]),
    );

    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      const rel = relByElement.get(element.id) ?? 0;
      const distinct = distinctByElement.get(element.id) ?? 0;
      expect(element.relationshipCount, element.id).toBe(rel);
      expect(element.usedInCount, element.id).toBe(distinct);
      // No facets requested → the badge must equal the full distinct count.
      expect(element.visibleKanjiCount, element.id).toBe(distinct);
      expect(element.relationshipCount, element.id).toBeGreaterThanOrEqual(
        element.usedInCount,
      );
    }

    // Documented pristine-seed triple for 木: 8 relationships / 5 kanji / badge 5.
    if (await isPristineSeed()) {
      const ki = elements.find((e) => e.id === "el-ki")!;
      expect(ki.relationshipCount).toBe(8);
      expect(ki.usedInCount).toBe(5);
      expect(ki.visibleKanjiCount).toBe(5);
      const kane = elements.find((e) => e.id === "el-kane")!;
      expect(kane.usedInCount).toBe(0);
      expect(kane.relationshipCount).toBe(0);
      expect(kane.visibleKanjiCount).toBe(0);
    }
  });

  it("listElements previews visibility under level/keyword facets (badge == click result)", async () => {
    const n5 = await KnowledgeService.listElements(undefined, { level: "N5" });
    for (const elementId of ["el-ki", "el-chou", "el-hi2"]) {
      const badge = n5.find((e) => e.id === elementId)!.visibleKanjiCount;
      const [sqlExpected, click] = await Promise.all([
        dbVisibleCount(elementId, "N5"),
        KnowledgeService.listKanji({ elementId, level: "N5", limit: 500 }),
      ]);
      expect(badge, `${elementId} badge == SQL`).toBe(sqlExpected);
      expect(badge, `${elementId} badge == click`).toBe(click.total);
    }
    if (await isPristineSeed()) {
      expect(n5.find((e) => e.id === "el-ki")!.visibleKanjiCount).toBe(3); // 休 林 森; 茶 N4 箱 N3 hidden
      expect(n5.find((e) => e.id === "el-chou")!.visibleKanjiCount).toBe(0); // 灯 is N2
      expect(n5.find((e) => e.id === "el-hi2")!.visibleKanjiCount).toBe(3);
    }

    const searched = await KnowledgeService.listElements(undefined, { keyword: "lamp" });
    const lampClick = await KnowledgeService.listKanji({
      elementId: "el-chou",
      keyword: "lamp",
      limit: 500,
    });
    const lampBadge = searched.find((e) => e.id === "el-chou")!.visibleKanjiCount;
    expect(lampBadge).toBe(lampClick.total);
    if (await isPristineSeed()) {
      expect(lampBadge).toBe(1);
    }
  });

  it("pagination keeps total stable and the page deterministic", async () => {
    const all = await KnowledgeService.listKanji({ limit: 1000 });
    const firstPage = await KnowledgeService.listKanji({ limit: 5, offset: 0 });
    const secondPage = await KnowledgeService.listKanji({ limit: 5, offset: 5 });
    expect(firstPage.total).toBe(all.total);
    expect(secondPage.total).toBe(all.total);
    expect(firstPage.kanji).toHaveLength(Math.min(5, all.total));
    const overlap = firstPage.kanji.filter((k) => secondPage.kanji.some((j) => j.id === k.id));
    expect(overlap).toEqual([]);
    // Deterministic order: repeated query, identical id sequence.
    const again = await KnowledgeService.listKanji({ limit: 5, offset: 0 });
    expect(again.kanji.map((k) => k.id)).toEqual(firstPage.kanji.map((k) => k.id));
  });
});

describe("M9A · GET /api/kanji route contract", () => {
  it("returns total, catalogTotal, elementFilter and palette counts from one contract", async () => {
    const res = await kanjiListGET(
      request("/api/kanji?elementId=el-chou&level=N5&includeElements=1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.total).toBe(0);
    expect(json.catalogTotal).toBeGreaterThanOrEqual(KANJI.length);
    expect(json.emptyKind).toBeNull(); // element facet owns the zero reason
    expect(json.elementFilter).toMatchObject({
      elementId: "el-chou",
      catalogKanjiCount: 1,
      visibleKanjiCount: 0,
      zeroKind: "element-excluded-by-level",
    });

    const palette = json.elements.find((e: { id: string }) => e.id === "el-chou");
    expect(palette).toMatchObject({
      usedInCount: 1, // distinct catalog characters
      relationshipCount: 1, // graph edges
      visibleKanjiCount: 0, // badge: what clicking shows under N5
    });
    // Badge ↔ result-set consistency: the number the palette promises for
    // this exact request equals the result set the same request returns.
    expect(palette.visibleKanjiCount).toBe(json.total);
  });

  it("without the element facet the palette badge equals total per element preview", async () => {
    const res = await kanjiListGET(request("/api/kanji?includeElements=1"));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.total).toBe(json.catalogTotal);
    expect(json.elementFilter).toBeNull();
    expect(json.emptyKind).toBeNull();
    const chou = json.elements.find((e: { id: string }) => e.id === "el-chou");
    expect(chou.visibleKanjiCount).toBe(chou.usedInCount);
  });

  it("keyword facet behaves literally (no LIKE wildcard escape)", async () => {
    const res = await kanjiListGET(request("/api/kanji?q=%25&includeElements=1"));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.total).toBe(0);
    expect(json.emptyKind).toBe("filters-no-match");
  });

  it("all facet combinations for 丁 keep badge == result", async () => {
    for (const level of ["all", "N5", "N4", "N3", "N2", "N1"]) {
      const query = level === "all" ? "el-chou" : `el-chou&level=${level}`;
      const res = await kanjiListGET(request(`/api/kanji?elementId=${query}&includeElements=1`));
      const json = await res.json();
      const palette = json.elements.find((e: { id: string }) => e.id === "el-chou");
      expect(palette.visibleKanjiCount, level).toBe(json.total);
    }
  });
});

describe("M9A · element definitions are canonical", () => {
  it("every COMPOSITION edge references a registered element and a seeded kanji", () => {
    const elementIds = new Set([...ELEMENTS, ...EXTRA_ELEMENTS].map((e) => e.id));
    const kanjiIds = new Set(KANJI.map((k) => k.id));
    for (const edge of COMPOSITION) {
      expect(elementIds.has(edge.elementId), edge.elementId).toBe(true);
      expect(kanjiIds.has(edge.kanjiId), edge.kanjiId).toBe(true);
    }
  });
});
