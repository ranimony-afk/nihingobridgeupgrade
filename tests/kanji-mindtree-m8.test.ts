import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listMindTreeCatalog } from "../src/lib/kanji/kanjiMindtreeCatalog";
import { filterMindTreeCatalogItems } from "../src/lib/kanji/mindtreeCatalogSearch";
import {
  INITIAL_MINDTREE_JOURNEY_STATE,
  mindTreeExploreHref,
  mindTreeJourneyReducer,
} from "../src/lib/kanji/mindtreeLearningJourney";

describe("M8 catalog search and level/grade filters", () => {
  const catalog = listMindTreeCatalog();

  it("keeps blank search broad, trims and case-normalizes queries, and matches supported kanji/meanings/readings", () => {
    expect(filterMindTreeCatalogItems(catalog, "   ", "all")).toHaveLength(100);
    expect(filterMindTreeCatalogItems(catalog, "  明 ", "all").map((item) => item.character)).toContain("明");
    expect(filterMindTreeCatalogItems(catalog, "BRIGHT", "all").map((item) => item.character)).toContain("明");
    expect(filterMindTreeCatalogItems(catalog, "やす", "all").map((item) => item.character)).toContain("休");
  });

  it("returns no invented result for an unsupported query and respects JLPT and school-grade filters", () => {
    expect(filterMindTreeCatalogItems(catalog, "龍", "all")).toEqual([]);
    const n5 = filterMindTreeCatalogItems(catalog, "", "N5");
    expect(n5.length).toBeGreaterThan(0);
    expect(n5.every((item) => item.jlptLevel === "N5")).toBe(true);
    const gradeOne = filterMindTreeCatalogItems(catalog, "", "Grade 1");
    expect(gradeOne.length).toBeGreaterThan(0);
    expect(gradeOne.every((item) => item.gradeLevel === 1)).toBe(true);
    expect(gradeOne.map((item) => item.character)).toContain("一");
  });
});

describe("M8 recall reversibility and exploration context", () => {
  it("lets learners reveal and cover an answer without changing the ephemeral self-check", () => {
    const revealed = mindTreeJourneyReducer(INITIAL_MINDTREE_JOURNEY_STATE, { type: "reveal-answer" });
    expect(revealed.answerVisible).toBe(true);
    const rated = mindTreeJourneyReducer(revealed, { type: "self-check", result: "recalled" });
    const covered = mindTreeJourneyReducer(rated, { type: "hide-answer" });
    expect(covered).toMatchObject({ answerVisible: false, selfCheck: "recalled" });
  });

  it("encodes direct detail links while preserving the source character and relation label", () => {
    const href = mindTreeExploreHref("明", "休", "component left · 亻");
    const parsed = new URL(href, "https://mindtree.example");
    expect(parsed.pathname).toBe("/mindtree/%E4%BC%91");
    expect(parsed.searchParams.get("from")).toBe("明");
    expect(parsed.searchParams.get("via")).toBe("component left · 亻");
  });
});

describe("M8 responsive and route-state contracts", () => {
  it("exposes mobile MindTree navigation, keyboard-visible focus, and the school-grade filter", () => {
    const navigation = readFileSync("src/components/layout/Navbar.tsx", "utf8");
    const catalog = readFileSync("src/components/kanji/KanjiMindTreeCatalog.tsx", "utf8");
    const search = readFileSync("src/lib/kanji/mindtreeCatalogSearch.ts", "utf8");
    expect(navigation).toContain('aria-label="Primary navigation"');
    expect(navigation).toContain('mobileNavHrefs.has(item.href)');
    expect(navigation).toContain('"/mindtree"');
    expect(navigation).toContain('focus-visible:ring-2');
    expect(catalog).toContain("MINDTREE_CATALOG_FILTERS");
    expect(search).toContain('"Grade 1"');
    expect(catalog).toContain('Filter by JLPT level or school grade');
  });

  it("preserves the character-specific client journey across route changes and passes context from Explore links", () => {
    const route = readFileSync("src/app/mindtree/[character]/page.tsx", "utf8");
    const journey = readFileSync("src/components/kanji/KanjiMindTreeLearningJourney.tsx", "utf8");
    expect(route).toContain('key={entry.character}');
    expect(journey).toContain('mindTreeExploreHref(entry.character, item.character, `shared learning relation');
    expect(journey).toContain('mindTreeExploreHref(entry.character, item.character, `shared On-reading relation');
    expect(journey).toContain('"Cover answer" : "Reveal answer"');
  });
});
