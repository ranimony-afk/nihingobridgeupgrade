/**
 * M9A regression tests — source-backed MindTree catalog filters
 * (/mindtree), including the Grade 1 filter path named in the M9A brief.
 *
 * The catalog already computes its visible count from the same array it
 * renders ("Showing X of Y"), so its count/result contract is consistent by
 * construction; these tests lock that behaviour, the Grade 1 filter, the
 * 100-character slice boundary, and the 丁 coverage gap (丁 is an element in
 * the legacy /kanji palette but is NOT part of the source-backed slice).
 */
import { describe, expect, it } from "vitest";
import {
  MINDTREE_CATALOG_FILTERS,
  filterMindTreeCatalogItems,
} from "../src/lib/kanji/mindtreeCatalogSearch";
import { listMindTreeCatalog } from "../src/lib/kanji/kanjiMindtreeCatalog";

const CATALOG = listMindTreeCatalog();

function manualFilter(query: string, filter: (typeof MINDTREE_CATALOG_FILTERS)[number]) {
  const needle = query.trim().toLowerCase();
  return CATALOG.filter((item) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "Grade 1"
          ? item.gradeLevel === 1
          : item.jlptLevel === filter;
    if (!matchesFilter) return false;
    if (!needle) return true;
    return [item.character, item.meaning, ...item.readingsKun, ...item.readingsOn]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

describe("M9A · MindTree catalog filter contract", () => {
  it("locks the 100-character source-backed slice", () => {
    expect(CATALOG).toHaveLength(100);
  });

  it("filter list exposes the Grade 1 facet exactly once", () => {
    expect(MINDTREE_CATALOG_FILTERS.filter((f) => f === "Grade 1")).toHaveLength(1);
    expect([...MINDTREE_CATALOG_FILTERS]).toEqual(
      [...new Set(MINDTREE_CATALOG_FILTERS)],
    );
  });

  it("displayed count always equals the rendered result set (pure filter == manual predicate)", () => {
    for (const filter of MINDTREE_CATALOG_FILTERS) {
      for (const query of ["", "tree", "水", "zzz-no-match"]) {
        const shown = filterMindTreeCatalogItems(CATALOG, query, filter);
        expect(shown, `${filter}/${query}`).toEqual(manualFilter(query, filter));
        // The component renders `shown.length` of `CATALOG.length` from this
        // exact array — the count and the list are the same value.
        expect(shown.length).toBe(manualFilter(query, filter).length);
      }
    }
  });

  it("Grade 1 returns only gradeLevel === 1 characters", () => {
    const shown = filterMindTreeCatalogItems(CATALOG, "", "Grade 1");
    expect(shown.length).toBeGreaterThan(0);
    for (const item of shown) expect(item.gradeLevel).toBe(1);
    expect(shown.length).toBe(CATALOG.filter((i) => i.gradeLevel === 1).length);
  });

  it("JLPT levels and Grade 1 are distinct facets, never conflated", () => {
    const gradeOne = filterMindTreeCatalogItems(CATALOG, "", "Grade 1");
    const n5 = filterMindTreeCatalogItems(CATALOG, "", "N5");
    for (const item of n5) expect(item.jlptLevel).toBe("N5");
    // 木/日/月 are grade 1 with no JLPT level in the slice: present under
    // Grade 1 and "all", absent under every JLPT facet.
    for (const character of ["木", "日", "月"]) {
      const inCatalog = CATALOG.find((i) => i.character === character);
      expect(inCatalog, character).toBeDefined();
      expect(gradeOne.some((i) => i.character === character), `${character} grade1`).toBe(true);
      for (const level of ["N5", "N4", "N3", "N2", "N1"] as const) {
        expect(
          filterMindTreeCatalogItems(CATALOG, "", level).some((i) => i.character === character),
          `${character} ${level}`,
        ).toBe(false);
      }
    }
  });

  it("丁 is not in the source-backed slice — the catalog shows an honest empty set", () => {
    // 丁 exists only as a first-party element (el-chou) in the legacy /kanji
    // palette; no KanjiVG/KANJIDIC2 slice record was selected for it.
    expect(CATALOG.some((i) => i.character === "丁")).toBe(false);
    for (const filter of MINDTREE_CATALOG_FILTERS) {
      expect(filterMindTreeCatalogItems(CATALOG, "丁", filter)).toEqual([]);
    }
    expect(filterMindTreeCatalogItems(CATALOG, "丁", "all")).toEqual([]);
  });

  it("query + Grade 1 combine deterministically (tree → 木)", () => {
    const shown = filterMindTreeCatalogItems(CATALOG, "tree", "Grade 1");
    expect(shown.map((i) => i.character)).toContain("木");
    expect(shown).toEqual(manualFilter("tree", "Grade 1"));
    const again = filterMindTreeCatalogItems(CATALOG, "tree", "Grade 1");
    expect(again.map((i) => i.character)).toEqual(shown.map((i) => i.character));
  });

  it("zero results are explicit empty arrays, never undefined/null", () => {
    const shown = filterMindTreeCatalogItems(CATALOG, "xyzzy", "N1");
    expect(Array.isArray(shown)).toBe(true);
    expect(shown).toHaveLength(0);
  });

  it("does not mutate the input catalog", () => {
    const before = CATALOG.map((i) => i.character);
    filterMindTreeCatalogItems(CATALOG, "水", "N5");
    filterMindTreeCatalogItems(CATALOG, "", "Grade 1");
    expect(CATALOG.map((i) => i.character)).toEqual(before);
  });
});
