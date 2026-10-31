import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KanjiMindTreeCatalog } from "@/components/kanji/KanjiMindTreeCatalog";
import type { MindTreeCatalogItem } from "@/lib/kanji/kanjiMindtreeCatalog";
import {
  filterMindTreeCatalogItems,
  MINDTREE_CATALOG_PAGE_SIZE,
  pageMindTreeCatalogItems,
} from "@/lib/kanji/mindtreeCatalogSearch";

// This test must stay database-free, even if future imports drift.
vi.mock("pg", () => { throw new Error("Pagination tests must not import PostgreSQL"); });

// Synthetic UI records, not an additional curriculum or source corpus.
const ITEMS: MindTreeCatalogItem[] = Array.from({ length: 100 }, (_, index) => ({
  character: String.fromCodePoint(0x4e00 + index),
  meaning: `synthetic ${index}`,
  readingsKun: ["test-kun"],
  readingsOn: ["test-on"],
  jlptLevel: index % 2 ? "N4" : "N5",
  gradeLevel: index % 3 ? 2 : 1,
  strokeCount: 1,
  meaningSourceRef: "test:synthetic",
  hasFirstPartyMnemonic: false,
}));

function markup(items = ITEMS) {
  return renderToStaticMarkup(createElement(KanjiMindTreeCatalog, { items }));
}

describe("bounded MindTree catalog pagination", () => {
  it("shows 36 records by default without changing total coverage", () => {
    const page = pageMindTreeCatalogItems(ITEMS);
    expect(page.items).toEqual(ITEMS.slice(0, 36));
    expect(page).toMatchObject({ total: 100, catalogTotal: 100, page: 1, pageSize: 36, pageCount: 3 });
  });

  it("visits every record in stable order without omissions or duplicates", () => {
    const pages = [1, 2, 3].map((page) => pageMindTreeCatalogItems(ITEMS, "", "all", page));
    expect(pages.map((page) => page.items.length)).toEqual([36, 36, 28]);
    expect(pages.flatMap((page) => page.items)).toEqual(ITEMS);
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.character))).size).toBe(100);
  });

  it("filters the full catalog before paginating", () => {
    const matches = filterMindTreeCatalogItems(ITEMS, "synthetic", "N5");
    const first = pageMindTreeCatalogItems(ITEMS, "synthetic", "N5");
    const last = pageMindTreeCatalogItems(ITEMS, "synthetic", "N5", 2);
    expect(first.total).toBe(50);
    expect([...first.items, ...last.items]).toEqual(matches);
    expect(last.catalogTotal).toBe(100);
  });

  it("finds an item outside the initial page and clamps a stale page", () => {
    const page = pageMindTreeCatalogItems(ITEMS, ITEMS[90].character, "all", 3);
    expect(page.items).toEqual([ITEMS[90]]);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(1);
  });

  it("keeps Grade 1 filtering independent of JLPT", () => {
    const page = pageMindTreeCatalogItems(ITEMS, "", "Grade 1");
    expect(page.items).toEqual(ITEMS.filter((item) => item.gradeLevel === 1));
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("normalizes invalid page %s", (page) => {
    expect(pageMindTreeCatalogItems(ITEMS, "", "all", page).page).toBe(1);
  });

  it("clamps a valid out-of-range page to the last page", () => {
    expect(pageMindTreeCatalogItems(ITEMS, "", "all", 999).page).toBe(3);
  });

  it.each([0, -1, 1.5, NaN, Infinity])("normalizes invalid page size %s", (size) => {
    expect(pageMindTreeCatalogItems(ITEMS, "", "all", 1, size).pageSize).toBe(MINDTREE_CATALOG_PAGE_SIZE);
  });

  it("caps page size and does not mutate the input", () => {
    const original = [...ITEMS];
    expect(pageMindTreeCatalogItems(Object.freeze([...ITEMS]), "", "all", 1, 10000).pageSize).toBe(100);
    expect(ITEMS).toEqual(original);
  });

  it.each([{ items: [] }, { items: ITEMS }])("represents empty results as an empty first page", ({ items }) => {
    expect(pageMindTreeCatalogItems(items, "no-match", "all", 999)).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1 });
  });

  it("renders bounded cards, matching counts and labelled pagination", () => {
    const html = markup();
    expect((html.match(/href="\/mindtree\//g) ?? []).length).toBe(36);
    expect(html).toContain("36 on this page · 100 matches of 100 characters.");
    expect(html).toContain('aria-label="Catalog pagination"');
    expect(html).toContain("Page 1 of 3");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(html).toMatch(/<button(?![^>]* disabled=)[^>]*>Next<\/button>/);
  });

  it("does not render unnecessary navigation for a single page", () => {
    expect(markup(ITEMS.slice(0, 12))).not.toContain('aria-label="Catalog pagination"');
  });

  it("preserves the empty-state recovery button", () => {
    const html = markup([]);
    expect(html).toContain("No supported character matches that search.");
    expect(html).toContain("Clear search and filters");
    expect(html).not.toContain('aria-label="Catalog pagination"');
  });
});
