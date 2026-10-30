/**
 * M9A regression tests — canonical element-filter contract.
 *
 * These tests are intentionally database-free: they exercise the single pure
 * implementation in src/lib/kanji/elementFilterContract.ts against the real
 * first-party dataset (src/data/kanji.ts) plus synthetic integrity fixtures.
 *
 * Failure modes covered (owner-reported defect: element 丁 shows count 1 but
 * the result set renders “No kanji match this filter”):
 *  1. Count/result contract divergence (badge must equal the result set).
 *  2. Relationship count mislabelled as distinct kanji (木: 8 edges / 5 kanji).
 *  3. Zero results caused by a different active facet (level/keyword) with no
 *     explanation.
 *  4. Genuine zero-count elements presented indistinguishably from exclusions.
 *  5. Dangling composition edges (kanji row missing) inflating counts.
 *  6. Unknown element ids silently matching nothing.
 *  7. Non-deterministic result ordering under equal sort keys.
 *  8. State leakage when switching facets/elements and unclear resets.
 *  9. Stale async responses overwriting newer selections.
 * 10. SQL LIKE wildcard characters (%) leaking into keyword semantics.
 */
import { describe, expect, it } from "vitest";
import { COMPOSITION, ELEMENTS, EXTRA_ELEMENTS, KANJI } from "../src/data/kanji";
import {
  EMPTY_ELEMENT_FILTER_STATE,
  KANJI_FILTER_LEVELS,
  buildKanjiListSearchParams,
  compareKanjiForFilter,
  createRequestSequencer,
  describeKanjiFilterEmptyState,
  filterKanjiCatalog,
  hasActiveKanjiFilters,
  normalizeKanjiFilterState,
  resetKanjiFilters,
  toggleElement,
  withKeyword,
  withLevel,
  type ElementFilterCompositionEdge,
  type ElementFilterElementRecord,
  type ElementFilterKanjiRecord,
  type ElementFilterState,
} from "../src/lib/kanji/elementFilterContract";

/* ------------------------------------------------------------------ */
/* Fixtures derived from the real first-party dataset                  */
/* ------------------------------------------------------------------ */

const ELEMENT_DEFS: ElementFilterElementRecord[] = [...ELEMENTS, ...EXTRA_ELEMENTS];

const KANJI_RECORDS: ElementFilterKanjiRecord[] = KANJI.map((row) => ({
  id: row.id,
  character: row.character,
  meaning: row.meaning,
  readingsKun: row.readingsKun,
  readingsOn: row.readingsOn,
  strokeCount: row.strokeCount,
  jlptLevel: row.jlptLevel,
  gradeLevel: row.gradeLevel,
}));

const COMPOSITION_EDGES: ElementFilterCompositionEdge[] = COMPOSITION.map((row) => ({
  kanjiId: row.kanjiId,
  elementId: row.elementId,
}));

function run(
  state: Partial<ElementFilterState>,
  overrides?: {
    kanji?: ElementFilterKanjiRecord[];
    composition?: ElementFilterCompositionEdge[];
    elements?: ElementFilterElementRecord[];
  },
) {
  return filterKanjiCatalog({
    kanji: overrides?.kanji ?? KANJI_RECORDS,
    composition: overrides?.composition ?? COMPOSITION_EDGES,
    elements: overrides?.elements ?? ELEMENT_DEFS,
    state: normalizeKanjiFilterState(state),
  });
}

function charactersOf(ids: string[], pool: ElementFilterKanjiRecord[] = KANJI_RECORDS): string[] {
  const byId = new Map(pool.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)!.character);
}

function usageFor(elementId: string, state: Partial<ElementFilterState> = {}) {
  const result = run(state);
  const usage = result.elementUsage.find((entry) => entry.elementId === elementId);
  expect(usage, `elementUsage missing ${elementId}`).toBeDefined();
  return usage!;
}

const chou = ELEMENT_DEFS.find((e) => e.id === "el-chou")!; // 丁
const ki = ELEMENT_DEFS.find((e) => e.id === "el-ki")!; // 木
const hi2 = ELEMENT_DEFS.find((e) => e.id === "el-hi2")!; // 日
const tsuki = ELEMENT_DEFS.find((e) => e.id === "el-tsuki")!; // 月
const kane = ELEMENT_DEFS.find((e) => e.id === "el-kane")!; // 金 — zero-count

/* ------------------------------------------------------------------ */
/* 1. Reported defect: 丁 count vs result set                          */
/* ------------------------------------------------------------------ */

describe("M9A · element 丁 (el-chou) reported defect", () => {
  it("with no other facet, the displayed catalog count equals the result set", () => {
    const result = run({ elementId: "el-chou" });
    expect(result.filteredTotal).toBe(1);
    expect(charactersOf(result.matchingIds)).toEqual(["灯"]);
    expect(result.selectedElement).toMatchObject({
      elementId: "el-chou",
      elementCharacter: "丁",
      known: true,
      relationshipCount: 1,
      catalogKanjiCount: 1,
      visibleKanjiCount: 1,
      zeroKind: null,
    });
    expect(result.emptyKind).toBeNull();
    expect(describeKanjiFilterEmptyState(result, normalizeKanjiFilterState({ elementId: "el-chou" }))).toBeNull();
  });

  it("with an incompatible level facet, returns 0 AND explains that the element has 1 hidden match", () => {
    const state = normalizeKanjiFilterState({ elementId: "el-chou", level: "N5" });
    const result = run(state);
    expect(result.filteredTotal).toBe(0);
    expect(result.selectedElement).toMatchObject({
      catalogKanjiCount: 1,
      visibleKanjiCount: 0,
      relationshipCount: 1,
      excluded: { total: 1, byLevelOnly: 1, byKeywordOnly: 0, byBoth: 0 },
      zeroKind: "element-excluded-by-level",
    });

    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.kind).toBe("element-excluded");
    expect(description.title).toContain("1 catalog kanji uses 丁");
    expect(description.detail).toContain("level filter N5");
    expect(description.detail).toContain("not by the element");
    expect(description.resetAction).toBe("level");
  });

  it("level N2 (灯's level) still returns 灯 — the element itself was never broken", () => {
    const result = run({ elementId: "el-chou", level: "N2" });
    expect(result.filteredTotal).toBe(1);
    expect(charactersOf(result.matchingIds)).toEqual(["灯"]);
  });

  it("keyword exclusion is named with the exact search term", () => {
    const state = normalizeKanjiFilterState({ elementId: "el-chou", keyword: "zzz" });
    const result = run(state);
    expect(result.filteredTotal).toBe(0);
    expect(result.selectedElement!.zeroKind).toBe("element-excluded-by-keyword");
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.detail).toContain("search “zzz”");
    expect(description.resetAction).toBe("keyword");
  });

  it("level + keyword exclusion combined resets both facets in one action", () => {
    const state = normalizeKanjiFilterState({ elementId: "el-chou", level: "N5", keyword: "lamp" });
    const result = run(state);
    // 灯 matches keyword "lamp" but not level N5 → hidden by level only.
    expect(result.selectedElement!.excluded.byLevelOnly).toBe(1);
    const stateNoMatch = normalizeKanjiFilterState({ elementId: "el-chou", level: "N5", keyword: "zzz" });
    const resultNoMatch = run(stateNoMatch);
    expect(resultNoMatch.selectedElement!.zeroKind).toBe("element-excluded-by-level-and-keyword");
    expect(resultNoMatch.selectedElement!.excluded.byBoth).toBe(1);
    const description = describeKanjiFilterEmptyState(resultNoMatch, stateNoMatch)!;
    expect(description.resetAction).toBe("all");
  });
});

/* ------------------------------------------------------------------ */
/* 2. Tested elements: 木 日 月 + zero-count element                   */
/* ------------------------------------------------------------------ */

describe("M9A · 木 / 日 / 月 / zero-count element", () => {
  it("木 separates relationship count (8 edges) from distinct catalog kanji (5)", () => {
    const usage = usageFor("el-ki");
    expect(usage.relationshipCount).toBe(8);
    expect(usage.catalogKanjiCount).toBe(5);
    expect(usage.visibleKanjiCount).toBe(5);
    expect(usage.danglingRelationshipCount).toBe(0);

    const result = run({ elementId: "el-ki" });
    expect(result.filteredTotal).toBe(5);
    expect(charactersOf(result.matchingIds).sort()).toEqual(["休", "林", "森", "茶", "箱"].sort());
  });

  it("木 badge preview equals the result set under every level facet", () => {
    for (const level of KANJI_FILTER_LEVELS) {
      const preview = usageFor("el-ki", { level });
      const applied = run({ elementId: "el-ki", level });
      expect(applied.filteredTotal, `level ${level}`).toBe(preview.visibleKanjiCount);
    }
    // N5 hides 茶 (N4) and 箱 (N3): 3 shown of 5, exactly 2 hidden by level.
    const n5 = usageFor("el-ki", { level: "N5" });
    expect(n5.visibleKanjiCount).toBe(3);
    const applied = run({ elementId: "el-ki", level: "N5" });
    expect(applied.selectedElement!.excluded.byLevelOnly).toBe(2);
  });

  it("日 returns its three kanji and reports 3 relationships / 3 distinct", () => {
    const usage = usageFor("el-hi2");
    expect(usage.relationshipCount).toBe(3);
    expect(usage.catalogKanjiCount).toBe(3);
    const result = run({ elementId: "el-hi2" });
    expect(charactersOf(result.matchingIds).sort()).toEqual(["明", "時", "間"].sort());
    // All three first-party 日 kanji are N5 → nothing hidden under N5.
    expect(usageFor("el-hi2", { level: "N5" }).visibleKanjiCount).toBe(3);
  });

  it("月 returns 明 (one relationship, one distinct kanji)", () => {
    const usage = usageFor("el-tsuki");
    expect(usage.relationshipCount).toBe(1);
    expect(usage.catalogKanjiCount).toBe(1);
    expect(charactersOf(run({ elementId: "el-tsuki" }).matchingIds)).toEqual(["明"]);
  });

  it("zero-count element 金 reports an accurate, explicitly-labelled zero", () => {
    const usage = usageFor("el-kane");
    expect(usage.relationshipCount).toBe(0);
    expect(usage.catalogKanjiCount).toBe(0);

    const state = normalizeKanjiFilterState({ elementId: "el-kane" });
    const result = run(state);
    expect(result.filteredTotal).toBe(0);
    expect(result.selectedElement!.zeroKind).toBe("element-no-relationships");
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.kind).toBe("element-no-relationships");
    expect(description.detail).toContain("0 composition relationships");
    expect(description.detail).toContain("accurate zero");
    expect(description.resetAction).toBe("element");
  });

  it("every zero-count registry element stays consistent (badge 0 ⇒ empty result)", () => {
    const zeroElements = ELEMENT_DEFS.filter(
      (def) => usageFor(def.id).relationshipCount === 0,
    );
    expect(zeroElements.length).toBeGreaterThan(0);
    for (const def of zeroElements) {
      const result = run({ elementId: def.id });
      expect(result.filteredTotal, def.id).toBe(0);
      expect(result.selectedElement!.zeroKind, def.id).toBe("element-no-relationships");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. Count contract invariants across the whole palette               */
/* ------------------------------------------------------------------ */

describe("M9A · counting contract invariants", () => {
  it("badge (visibleKanjiCount) always equals clicking the element, for every element × level", () => {
    for (const def of ELEMENT_DEFS) {
      for (const level of KANJI_FILTER_LEVELS) {
        const badge = usageFor(def.id, { level }).visibleKanjiCount;
        const applied = run({ elementId: def.id, level });
        expect(applied.filteredTotal, `${def.id} @ ${level}`).toBe(badge);
      }
    }
  });

  it("usedInCount semantics: distinct characters, never raw relationship totals", () => {
    for (const def of ELEMENT_DEFS) {
      const usage = usageFor(def.id);
      expect(usage.catalogKanjiCount).toBeLessThanOrEqual(usage.relationshipCount);
      const distinct = new Set(
        COMPOSITION_EDGES.filter((e) => e.elementId === def.id).map((e) => e.kanjiId),
      );
      expect(usage.catalogKanjiCount, def.id).toBe(distinct.size);
      expect(usage.relationshipCount, def.id).toBe(
        COMPOSITION_EDGES.filter((e) => e.elementId === def.id).length,
      );
    }
  });

  it("catalogTotal and filteredTotal coexist for pagination/labels", () => {
    const result = run({ level: "N5" });
    expect(result.catalogTotal).toBe(KANJI_RECORDS.length);
    expect(result.filteredTotal).toBeLessThan(result.catalogTotal);
    expect(result.filteredTotal).toBe(
      KANJI_RECORDS.filter((row) => row.jlptLevel === "N5").length,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 4. Integrity: dangling edges and unknown element ids                */
/* ------------------------------------------------------------------ */

describe("M9A · integrity fixtures", () => {
  const orphanElements: ElementFilterElementRecord[] = [
    { id: "el-orphan", character: "䘣" },
  ];
  const orphanComposition: ElementFilterCompositionEdge[] = [
    { kanjiId: "kj-ghost", elementId: "el-orphan" },
  ];
  const mixedComposition: ElementFilterCompositionEdge[] = [
    { kanjiId: "kj-ghost", elementId: "el-chou" }, // dangling edge to a missing kanji row
    { kanjiId: "kj-akari", elementId: "el-chou" }, // real edge
  ];

  it("a relationship pointing at a missing kanji row never invents a match", () => {
    const state = normalizeKanjiFilterState({ elementId: "el-orphan" });
    const result = run(state, { elements: orphanElements, composition: orphanComposition });
    expect(result.filteredTotal).toBe(0);
    expect(result.selectedElement).toMatchObject({
      relationshipCount: 1,
      danglingRelationshipCount: 1,
      catalogKanjiCount: 0,
      visibleKanjiCount: 0,
      zeroKind: "element-no-catalog-kanji",
    });
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.kind).toBe("element-no-catalog-kanji");
    expect(description.detail).toContain("data-integrity");
  });

  it("dangling edges are excluded from the distinct-kanji count but kept in the relationship count", () => {
    const usage = usageFor("el-chou");
    // Real dataset has no dangling edges…
    expect(usage.danglingRelationshipCount).toBe(0);

    const mixed = run(
      { elementId: "el-chou" },
      { composition: mixedComposition },
    );
    expect(mixed.selectedElement).toMatchObject({
      relationshipCount: 2, // ghost + real — graph statistic stays truthful
      danglingRelationshipCount: 1,
      catalogKanjiCount: 1, // only 灯 resolves
      visibleKanjiCount: 1,
    });
    expect(charactersOf(mixed.matchingIds)).toEqual(["灯"]);
  });

  it("unknown element ids return an explicit zero with a registry explanation", () => {
    const state = normalizeKanjiFilterState({ elementId: "el-not-in-registry" });
    const result = run(state);
    expect(result.filteredTotal).toBe(0);
    expect(result.selectedElement!.known).toBe(false);
    expect(result.selectedElement!.zeroKind).toBe("element-unknown");
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.kind).toBe("element-unknown");
    expect(description.resetAction).toBe("element");
  });
});

/* ------------------------------------------------------------------ */
/* 5. Determinism                                                      */
/* ------------------------------------------------------------------ */

describe("M9A · deterministic ordering", () => {
  it("result order does not depend on input order", () => {
    const baseline = run({ level: "N5" }).matchingIds;
    const reversedInput = run(
      { level: "N5" },
      { kanji: [...KANJI_RECORDS].reverse() },
    ).matchingIds;
    expect(reversedInput).toEqual(baseline);
  });

  it("equal jlptLevel + strokeCount ties break by code point", () => {
    const left: ElementFilterKanjiRecord = {
      id: "a", character: "日", meaning: "day", readingsKun: [], readingsOn: [],
      strokeCount: 4, jlptLevel: "N5",
    };
    const right: ElementFilterKanjiRecord = { ...left, id: "b", character: "木" };
    // 日 = U+65E5 < 木 = U+6728 → 日 sorts first.
    expect(compareKanjiForFilter(left, right)).toBeLessThan(0);
    expect(compareKanjiForFilter(right, left)).toBeGreaterThan(0);
    expect(compareKanjiForFilter(left, { ...left, id: "c" })).toBe(0);
  });

  it("repeated evaluation produces byte-identical id lists", () => {
    const first = JSON.stringify(run({ elementId: "el-ki" }).matchingIds);
    const second = JSON.stringify(run({ elementId: "el-ki" }).matchingIds);
    expect(second).toBe(first);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Keyword semantics, state transitions, reset, requests            */
/* ------------------------------------------------------------------ */

describe("M9A · keyword semantics", () => {
  it("is case-insensitive over character and meaning", () => {
    expect(run({ keyword: "lamp" }).filteredTotal).toBe(1);
    expect(run({ keyword: "LAMP" }).filteredTotal).toBe(1);
    expect(run({ keyword: "灯" }).filteredTotal).toBeGreaterThan(0);
  });

  it("SQL LIKE wildcards are literal, not operators", () => {
    // Previously `%`/`_` were passed straight into SQL LIKE and could match
    // the whole catalog; the contract now treats them as plain characters.
    expect(run({ keyword: "%" }).filteredTotal).toBe(0);
    expect(run({ keyword: "_" }).filteredTotal).toBe(0);
    expect(run({ keyword: "100%" }).filteredTotal).toBe(0);
  });

  it("empty keyword and level 'all' mean no filtering", () => {
    expect(run({ keyword: "   " }).filteredTotal).toBe(KANJI_RECORDS.length);
    expect(run({ level: "all" }).filteredTotal).toBe(KANJI_RECORDS.length);
  });
});

describe("M9A · state transitions preserve unrelated facets", () => {
  const start: ElementFilterState = { ...EMPTY_ELEMENT_FILTER_STATE };

  it("selecting an element never clears level or keyword (conflicts are surfaced, not dropped)", () => {
    const state = withKeyword(withLevel(start, "N5"), "lamp");
    const switched = toggleElement(state, "el-chou");
    expect(switched.level).toBe("N5");
    expect(switched.keyword).toBe("lamp");
    expect(switched.elementId).toBe("el-chou");
    // And the combination explains itself instead of silently emptying:
    const result = run(switched);
    expect(result.filteredTotal).toBe(0);
    const description = describeKanjiFilterEmptyState(result, switched)!;
    expect(description.kind).toBe("element-excluded");
  });

  it("switching elements replaces only the element facet", () => {
    const first = toggleElement(start, "el-chou");
    const second = toggleElement(first, "el-ki");
    expect(second.elementId).toBe("el-ki");
    expect(second.level).toBe("all");
    expect(second.keyword).toBe("");
    expect(run(second).filteredTotal).toBe(5);
  });

  it("clicking the selected element again clears it", () => {
    const selected = toggleElement(start, "el-chou");
    expect(toggleElement(selected, "el-chou").elementId).toBeNull();
  });

  it("level facet rejects unknown values (e.g. the MindTree catalog's 'Grade 1') safely", () => {
    expect(normalizeKanjiFilterState({ level: "Grade 1" }).level).toBe("all");
    expect(normalizeKanjiFilterState({ level: "n5" }).level).toBe("all");
    expect(normalizeKanjiFilterState({ level: "N5" }).level).toBe("N5");
  });

  it("reset returns the canonical empty state and hasActiveKanjiFilters flips", () => {
    let state = withLevel(withKeyword(toggleElement(start, "el-chou"), "x"), "N3");
    expect(hasActiveKanjiFilters(state)).toBe(true);
    state = resetKanjiFilters();
    expect(state).toEqual(EMPTY_ELEMENT_FILTER_STATE);
    expect(hasActiveKanjiFilters(state)).toBe(false);
  });
});

describe("M9A · request building", () => {
  it("always marks includeElements and omits inactive facets", () => {
    const params = buildKanjiListSearchParams(EMPTY_ELEMENT_FILTER_STATE);
    expect(params.get("includeElements")).toBe("1");
    expect(params.get("level")).toBeNull();
    expect(params.get("elementId")).toBeNull();
    expect(params.get("q")).toBeNull();
  });

  it("encodes active facets exactly", () => {
    const state = normalizeKanjiFilterState({ level: "N2", elementId: "el-chou", keyword: "灯" });
    const params = buildKanjiListSearchParams(state);
    expect(params.get("level")).toBe("N2");
    expect(params.get("elementId")).toBe("el-chou");
    expect(params.get("q")).toBe("灯");
  });
});

describe("M9A · stale-response sequencing", () => {
  it("drops any token that is no longer the newest request", () => {
    const sequencer = createRequestSequencer();
    const first = sequencer.begin();
    expect(sequencer.isCurrent(first)).toBe(true);
    const second = sequencer.begin(); // user switched element
    expect(sequencer.isCurrent(first)).toBe(false);
    expect(sequencer.isCurrent(second)).toBe(true);
    const third = sequencer.begin();
    expect(sequencer.isCurrent(second)).toBe(false);
    expect(sequencer.isCurrent(third)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Empty-state wording when no element facet is active              */
/* ------------------------------------------------------------------ */

describe("M9A · non-element empty states", () => {
  it("filter miss without element names the responsible facets", () => {
    const state = normalizeKanjiFilterState({ level: "N1", keyword: "zzz" });
    const result = run(state);
    expect(result.filteredTotal).toBe(0);
    expect(result.emptyKind).toBe("filters-no-match");
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.detail).toContain("level filter N1");
    expect(description.detail).toContain("zzz");
    expect(description.resetAction).toBe("all");
  });

  it("an empty catalog with no facets reports the empty catalog, not a filter miss", () => {
    const state = normalizeKanjiFilterState({});
    const result = run(state, { kanji: [] });
    expect(result.emptyKind).toBe("catalog-empty");
    const description = describeKanjiFilterEmptyState(result, state)!;
    expect(description.kind).toBe("catalog-empty");
    expect(description.resetAction).toBeNull();
  });

  it("returns no description while results exist", () => {
    const state = normalizeKanjiFilterState({ level: "N5" });
    const result = run(state);
    expect(describeKanjiFilterEmptyState(result, state)).toBeNull();
  });
});
