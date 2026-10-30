/**
 * M9A element-filter contract — pure, deterministic, dependency-free.
 *
 * This module is the single source of truth for how the Kanji Mind Tree
 * catalog (`/kanji`) filters and counts characters. It is imported by:
 *   - `KnowledgeService` (server) for every catalog query,
 *   - `src/app/kanji/page.tsx` (client) for request building and empty-state
 *     wording, and
 *   - unit tests, directly, with no database.
 *
 * ## The counting contract (M9A)
 *
 * Three numbers exist for every element, and they are never interchangeable:
 *
 *   1. `relationshipCount` — how many composition relationships (graph edges)
 *      reference this element, counting every row in the relationship table.
 *      This is a *graph* statistic. It counts repeated components (林 uses 木
 *      twice) and it does not verify that the referenced kanji row exists.
 *
 *   2. `catalogKanjiCount` — how many *distinct supported catalog characters*
 *      contain this element (integrity-filtered: an edge only counts when its
 *      kanji row exists in the catalog). This is the canonical "which
 *      characters use this element" number.
 *
 *   3. `visibleKanjiCount` — how many of those characters also match the
 *      other active filters (level + keyword). **This is the number the
 *      palette badge displays, and it always equals the length of the result
 *      set that clicking the element produces** — by construction, because
 *      both come from this same function.
 *
 * When `visibleKanjiCount < catalogKanjiCount`, the UI must explain which
 * filter is hiding the missing characters (`excluded` breakdown below), and
 * when an element genuinely has no supported matches, `zeroKind` states so
 * explicitly with an accurate zero count. Nothing here invents relationships,
 * glyphs, or matches.
 *
 * ## Facets
 *
 * `level`, `elementId` and `keyword` are independent facets, AND-composed.
 * Selecting or clearing one facet never silently mutates another; conflicts
 * are reported instead of dropped (`describeKanjiFilterEmptyState`).
 *
 * ## Determinism
 *
 * Result order: `jlptLevel` ascending (lexicographic, matching the historic
 * SQL ordering), then `strokeCount` ascending, then Unicode code point of the
 * character as the tie-break (added in M9A so equal keys can no longer float
 * between runs). Keyword matching is case-insensitive substring over
 * character + meaning; the `%`/`_` characters are literal (the previous
 * SQL `LIKE` implementation treated them as wildcards — that divergence is
 * closed by making this module the only filter implementation).
 */

export const KANJI_FILTER_LEVELS = ["all", "N5", "N4", "N3", "N2", "N1"] as const;
export type KanjiFilterLevel = (typeof KANJI_FILTER_LEVELS)[number];

export interface ElementFilterState {
  /** JLPT level facet; "all" disables it. */
  level: KanjiFilterLevel;
  /** Canonical element id (e.g. "el-chou"), or null when the facet is off. */
  elementId: string | null;
  /** Free-text keyword facet (character or meaning substring), trimmed. */
  keyword: string;
}

export const EMPTY_ELEMENT_FILTER_STATE: ElementFilterState = Object.freeze({
  level: "all" as KanjiFilterLevel,
  elementId: null,
  keyword: "",
});

/** Minimal catalog row the filter needs. Enrichment happens outside. */
export interface ElementFilterKanjiRecord {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  gradeLevel?: number | null;
}

/** Minimal composition edge. Only these two columns are required. */
export interface ElementFilterCompositionEdge {
  kanjiId: string;
  elementId: string;
}

/** Minimal element registry row. `id` is the canonical element identifier. */
export interface ElementFilterElementRecord {
  id: string;
  character?: string;
}

export interface ElementUsageSummary {
  elementId: string;
  /** All composition relationships referencing the element (graph statistic). */
  relationshipCount: number;
  /** Relationships whose kanji row is missing from the catalog (integrity). */
  danglingRelationshipCount: number;
  /** Distinct catalog characters containing the element, deterministic order. */
  catalogKanjiIds: string[];
  catalogKanjiCount: number;
  /** Those that also match the level + keyword facets (badge number). */
  visibleKanjiCount: number;
}

export type ElementZeroKind =
  /** The id is not in the canonical element registry. */
  | "element-unknown"
  /** Registry element with no composition relationships at all. */
  | "element-no-relationships"
  /**
   * Relationships exist but none resolve to a catalog row. The UI must show
   * an accurate zero *and* disclose the integrity gap; matches are never
   * invented to fill it.
   */
  | "element-no-catalog-kanji"
  | "element-excluded-by-level"
  | "element-excluded-by-keyword"
  | "element-excluded-by-level-and-keyword";

export interface SelectedElementAnalysis {
  elementId: string;
  /** Character for the element when the registry knows it, else null. */
  elementCharacter: string | null;
  known: boolean;
  relationshipCount: number;
  danglingRelationshipCount: number;
  catalogKanjiCount: number;
  visibleKanjiCount: number;
  /**
   * Catalog characters for this element hidden by other facets, partitioned
   * so the UI can name the exact filter responsible. The three parts sum to
   * `catalogKanjiCount - visibleKanjiCount`.
   */
  excluded: {
    total: number;
    byLevelOnly: number;
    byKeywordOnly: number;
    byBoth: number;
  };
  /** Non-null exactly when visibleKanjiCount === 0 (the zero-result reason). */
  zeroKind: ElementZeroKind | null;
}

export type KanjiFilterEmptyKind =
  | "results-present"
  /** No element facet; at least one other facet filtered everything out. */
  | "filters-no-match"
  /** No facets at all and the catalog itself is empty. */
  | "catalog-empty";

export interface KanjiCatalogFilterResult<K extends ElementFilterKanjiRecord> {
  /** Matching rows in deterministic order (apply limit/offset afterwards). */
  matches: K[];
  matchingIds: string[];
  /** Characters in the catalog before any facet is applied. */
  catalogTotal: number;
  /** Characters after all facets are applied. */
  filteredTotal: number;
  /** One summary per registered element (palette data). */
  elementUsage: ElementUsageSummary[];
  /** Analysis of the active element facet, or null when it is off. */
  selectedElement: SelectedElementAnalysis | null;
  /** Present when filteredTotal === 0 and no element facet is active. */
  emptyKind: KanjiFilterEmptyKind | null;
}

export interface FilterKanjiCatalogInput<K extends ElementFilterKanjiRecord> {
  kanji: readonly K[];
  composition: readonly ElementFilterCompositionEdge[];
  /** Canonical element registry; required to validate the element facet. */
  elements: readonly ElementFilterElementRecord[];
  state: ElementFilterState;
}

/* ------------------------------------------------------------------ */
/* State normalization                                                 */
/* ------------------------------------------------------------------ */

/** Coerce arbitrary incoming filter input into the canonical state shape. */
export function normalizeKanjiFilterState(input: {
  level?: string | null;
  elementId?: string | null;
  keyword?: string | null;
}): ElementFilterState {
  const rawLevel = (input.level ?? "").trim();
  const level = (KANJI_FILTER_LEVELS as readonly string[]).includes(rawLevel)
    ? (rawLevel as KanjiFilterLevel)
    : "all";
  const elementId = (input.elementId ?? "").trim();
  const keyword = (input.keyword ?? "").trim();
  return {
    level,
    elementId: elementId.length > 0 ? elementId : null,
    keyword,
  };
}

/** Facet transitions used by the page. Each touches exactly one facet. */
export function withLevel(state: ElementFilterState, level: string): ElementFilterState {
  const normalized = normalizeKanjiFilterState({ ...state, level });
  return { ...state, level: normalized.level };
}

export function toggleElement(
  state: ElementFilterState,
  elementId: string,
): ElementFilterState {
  return { ...state, elementId: state.elementId === elementId ? null : elementId };
}

export function withKeyword(state: ElementFilterState, keyword: string): ElementFilterState {
  return { ...state, keyword: keyword.trim() };
}

export function resetKanjiFilters(): ElementFilterState {
  return { ...EMPTY_ELEMENT_FILTER_STATE };
}

export function hasActiveKanjiFilters(state: ElementFilterState): boolean {
  return state.level !== "all" || state.elementId !== null || state.keyword !== "";
}

/**
 * The exact query parameters `/api/kanji` receives for a filter state.
 * Exported so request construction is unit-testable and cannot drift from
 * the facets the UI displays.
 */
export function buildKanjiListSearchParams(state: ElementFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.level !== "all") params.set("level", state.level);
  if (state.elementId) params.set("elementId", state.elementId);
  if (state.keyword) params.set("q", state.keyword);
  params.set("includeElements", "1");
  return params;
}

/**
 * Sequences async catalog loads so a slow, older response can never
 * overwrite a newer one (the M9A "stale state when switching elements"
 * regression). Token-based, framework-agnostic, unit-tested.
 */
export function createRequestSequencer() {
  let current = 0;
  return {
    begin(): number {
      current += 1;
      return current;
    },
    isCurrent(token: number): boolean {
      return token === current;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

function matchesKeyword(kanji: ElementFilterKanjiRecord, keyword: string): boolean {
  if (!keyword) return true;
  const needle = keyword.toLowerCase();
  return (
    kanji.character.toLowerCase().includes(needle) ||
    kanji.meaning.toLowerCase().includes(needle)
  );
}

function matchesLevel(kanji: ElementFilterKanjiRecord, level: KanjiFilterLevel): boolean {
  if (level === "all") return true;
  return kanji.jlptLevel === level;
}

/** Deterministic catalog ordering — see module header. */
export function compareKanjiForFilter(
  left: ElementFilterKanjiRecord,
  right: ElementFilterKanjiRecord,
): number {
  if (left.jlptLevel !== right.jlptLevel) return left.jlptLevel < right.jlptLevel ? -1 : 1;
  if (left.strokeCount !== right.strokeCount) return left.strokeCount - right.strokeCount;
  const l = left.character.codePointAt(0) ?? 0;
  const r = right.character.codePointAt(0) ?? 0;
  return l - r;
}

/**
 * Apply the canonical filter contract to a catalog snapshot.
 *
 * Pure: the same inputs always produce the same result, and no input is
 * mutated. Both the server query path and the client empty-state wording
 * derive from this one function's output.
 */
export function filterKanjiCatalog<K extends ElementFilterKanjiRecord>(
  input: FilterKanjiCatalogInput<K>,
): KanjiCatalogFilterResult<K> {
  const { kanji, composition, elements, state } = input;

  const kanjiById = new Map(kanji.map((row) => [row.id, row]));
  const elementById = new Map(elements.map((element) => [element.id, element]));

  // Facet evaluation over the full catalog (element facet handled separately
  // so the per-element preview counts ignore it by design).
  const levelAndKeywordMatch = kanji.filter(
    (row) => matchesLevel(row, state.level) && matchesKeyword(row, state.keyword),
  );
  const levelAndKeywordIds = new Set(levelAndKeywordMatch.map((row) => row.id));

  // Reverse element → kanji index (distinct), plus relationship totals.
  const usageById = new Map<string, { relationship: number; dangling: number; ids: Set<string> }>();
  for (const element of elements) {
    usageById.set(element.id, { relationship: 0, dangling: 0, ids: new Set() });
  }
  for (const edge of composition) {
    let usage = usageById.get(edge.elementId);
    if (!usage) {
      // Edges referencing an unregistered element id are surfaced under a
      // synthetic bucket so counts stay truthful without inventing a palette
      // entry for an id the registry does not own.
      usage = { relationship: 0, dangling: 0, ids: new Set() };
      usageById.set(edge.elementId, usage);
    }
    usage.relationship += 1;
    if (!kanjiById.has(edge.kanjiId)) {
      usage.dangling += 1;
      continue;
    }
    usage.ids.add(edge.kanjiId);
  }

  const elementUsage: ElementUsageSummary[] = elements.map((element) => {
    const usage = usageById.get(element.id)!;
    const catalogKanjiIds = [...usage.ids]
      .map((id) => kanjiById.get(id)!)
      .sort(compareKanjiForFilter)
      .map((row) => row.id);
    return {
      elementId: element.id,
      relationshipCount: usage.relationship,
      danglingRelationshipCount: usage.dangling,
      catalogKanjiIds,
      catalogKanjiCount: catalogKanjiIds.length,
      visibleKanjiCount: catalogKanjiIds.filter((id) => levelAndKeywordIds.has(id)).length,
    };
  });

  // Compose the final result set: level ∩ keyword (∩ element when active).
  let matches: K[];
  let selectedElement: SelectedElementAnalysis | null = null;

  if (state.elementId) {
    const element = elementById.get(state.elementId) ?? null;
    const usage = usageById.get(state.elementId) ?? {
      relationship: 0,
      dangling: 0,
      ids: new Set<string>(),
    };
    const catalogRows = [...usage.ids]
      .map((id) => kanjiById.get(id)!)
      .filter(Boolean)
      .sort(compareKanjiForFilter);
    matches = levelAndKeywordMatch.filter((row) => usage.ids.has(row.id)).sort(compareKanjiForFilter);

    let byLevelOnly = 0;
    let byKeywordOnly = 0;
    let byBoth = 0;
    for (const row of catalogRows) {
      const levelOk = matchesLevel(row, state.level);
      const keywordOk = matchesKeyword(row, state.keyword);
      if (levelOk && keywordOk) continue;
      if (!levelOk && !keywordOk) byBoth += 1;
      else if (!levelOk) byLevelOnly += 1;
      else byKeywordOnly += 1;
    }

    const zeroKind: ElementZeroKind | null =
      matches.length > 0
        ? null
        : !element
          ? "element-unknown"
          : usage.relationship === 0
            ? "element-no-relationships"
            : catalogRows.length === 0
              ? "element-no-catalog-kanji"
              : state.level !== "all" && state.keyword
                ? "element-excluded-by-level-and-keyword"
                : state.level !== "all"
                  ? "element-excluded-by-level"
                  : "element-excluded-by-keyword";

    selectedElement = {
      elementId: state.elementId,
      elementCharacter: element && typeof element.character === "string" ? element.character : null,
      known: element !== null,
      relationshipCount: usage.relationship,
      danglingRelationshipCount: usage.dangling,
      catalogKanjiCount: catalogRows.length,
      visibleKanjiCount: matches.length,
      excluded: {
        total: catalogRows.length - matches.length,
        byLevelOnly,
        byKeywordOnly,
        byBoth,
      },
      zeroKind,
    };
  } else {
    matches = [...levelAndKeywordMatch].sort(compareKanjiForFilter);
  }

  const emptyKind: KanjiFilterEmptyKind | null =
    matches.length > 0
      ? null
      : state.elementId
        ? null // selectedElement.zeroKind carries the element-specific reason
        : hasActiveKanjiFilters(state)
          ? "filters-no-match"
          : "catalog-empty";

  return {
    matches,
    matchingIds: matches.map((row) => row.id),
    catalogTotal: kanji.length,
    filteredTotal: matches.length,
    elementUsage,
    selectedElement,
    emptyKind,
  };
}

/* ------------------------------------------------------------------ */
/* Empty-state wording                                                 */
/* ------------------------------------------------------------------ */

export type KanjiFilterResetAction = "level" | "keyword" | "element" | "all";

export interface KanjiFilterEmptyDescription {
  kind:
    | "element-unknown"
    | "element-no-relationships"
    | "element-no-catalog-kanji"
    | "element-excluded"
    | "filters-no-match"
    | "catalog-empty";
  title: string;
  detail: string;
  /** The most direct single action that shows results again (or null). */
  resetAction: KanjiFilterResetAction | null;
}

/**
 * Turn a zero-result filter result into explicit, actionable UI copy.
 * The wording names the exact facet responsible so the displayed count and
 * the (empty) result set are always explained by one contract.
 */
export function describeKanjiFilterEmptyState(
  result: Pick<
    KanjiCatalogFilterResult<ElementFilterKanjiRecord>,
    "selectedElement" | "emptyKind" | "filteredTotal" | "catalogTotal"
  >,
  state: ElementFilterState,
): KanjiFilterEmptyDescription | null {
  if (result.filteredTotal > 0) return null;

  const selected = result.selectedElement;
  if (selected) {
    if (selected.zeroKind === "element-unknown") {
      return {
        kind: "element-unknown",
        title: "Unknown element filter",
        detail: `“${selected.elementId}” is not a canonical element id in this catalog. The filter matched nothing because the registry does not own it.`,
        resetAction: "element",
      };
    }
    if (selected.zeroKind === "element-no-relationships") {
      return {
        kind: "element-no-relationships",
        title: "No catalog kanji uses this element",
        detail: `${selected.elementCharacter ?? selected.elementId} has 0 composition relationships in the supported catalog, so 0 characters match — an accurate zero, not a filtering error.`,
        resetAction: "element",
      };
    }
    if (selected.zeroKind === "element-no-catalog-kanji") {
      return {
        kind: "element-no-catalog-kanji",
        title: "No catalog row backs these relationships",
        detail: `${selected.relationshipCount} composition relationship${selected.relationshipCount === 1 ? "" : "s"} reference ${selected.elementCharacter ?? selected.elementId}, but ${selected.danglingRelationshipCount} of them point at characters missing from the catalog. 0 matches are shown and no character is invented to fill the gap. This is a data-integrity report, not a search miss.`,
        resetAction: "element",
      };
    }
    const excludedParts: string[] = [];
    if (selected.excluded.byLevelOnly > 0) {
      excludedParts.push(
        `${selected.excluded.byLevelOnly} by the level filter ${state.level}`,
      );
    }
    if (selected.excluded.byKeywordOnly > 0) {
      excludedParts.push(
        `${selected.excluded.byKeywordOnly} by the search “${state.keyword}”`,
      );
    }
    if (selected.excluded.byBoth > 0) {
      excludedParts.push(
        `${selected.excluded.byBoth} by both the level filter ${state.level} and the search “${state.keyword}”`,
      );
    }
    const exclusionSentence =
      excludedParts.length > 0 ? ` Hidden: ${excludedParts.join("; ")}.` : "";
    const resetAction: KanjiFilterResetAction =
      state.level !== "all" && state.keyword
        ? "all"
        : state.level !== "all"
          ? "level"
          : state.keyword
            ? "keyword"
            : "element";
    return {
      kind: "element-excluded",
      title: `${selected.catalogKanjiCount} catalog kanji ${selected.catalogKanjiCount === 1 ? "uses" : "use"} ${selected.elementCharacter ?? selected.elementId}, 0 shown`,
      detail: `The element itself matches ${selected.catalogKanjiCount} supported character${selected.catalogKanjiCount === 1 ? "" : "s"}, so the zero result is caused by another active filter, not by the element.${exclusionSentence}`,
      resetAction,
    };
  }

  if (result.emptyKind === "catalog-empty") {
    return {
      kind: "catalog-empty",
      title: "The catalog is empty",
      detail: "No kanji rows are seeded in this catalog yet.",
      resetAction: null,
    };
  }
  const parts: string[] = [];
  if (state.level !== "all") parts.push(`the level filter ${state.level}`);
  if (state.keyword) parts.push(`the search “${state.keyword}”`);
  return {
    kind: "filters-no-match",
    title: "No kanji match this filter",
    detail: `Nothing in the ${result.catalogTotal}-character catalog matches ${
      parts.length ? parts.join(" and ") : "the active filters"
    }.`,
    resetAction: state.level !== "all" && state.keyword ? "all" : state.level !== "all" ? "level" : "keyword",
  };
}
