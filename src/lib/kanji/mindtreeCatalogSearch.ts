import type { MindTreeCatalogItem } from "@/lib/kanji/kanjiMindtreeCatalog";

export const MINDTREE_CATALOG_FILTERS = ["all", "N5", "N4", "N3", "N2", "N1", "Grade 1"] as const;
export type MindTreeCatalogFilter = (typeof MINDTREE_CATALOG_FILTERS)[number];

/** Stable client-side search over the canonical supported-character catalog. */
export function filterMindTreeCatalogItems(
  items: readonly MindTreeCatalogItem[],
  query: string,
  filter: MindTreeCatalogFilter,
): MindTreeCatalogItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesFilter = filter === "all"
      || (filter === "Grade 1" ? item.gradeLevel === 1 : item.jlptLevel === filter);
    if (!matchesFilter) return false;
    if (!needle) return true;
    const searchable = [item.character, item.meaning, ...item.readingsKun, ...item.readingsOn]
      .join(" ")
      .toLowerCase();
    return searchable.includes(needle);
  });
}

export const MINDTREE_CATALOG_PAGE_SIZE = 36;
export const MINDTREE_CATALOG_MAX_PAGE_SIZE = 100;

/** Bounded view over compact identity/fact summaries, never glyphs or enriched graphs.
 * Stable source order is preserved; an out-of-range page clamps to the last page.
 */
export function pageMindTreeCatalogItems(
  items: readonly MindTreeCatalogItem[],
  query = "",
  filter: MindTreeCatalogFilter = "all",
  requestedPage = 1,
  requestedSize = MINDTREE_CATALOG_PAGE_SIZE,
) {
  const size = Number.isSafeInteger(requestedSize) && requestedSize > 0
    ? Math.min(requestedSize, MINDTREE_CATALOG_MAX_PAGE_SIZE) : MINDTREE_CATALOG_PAGE_SIZE;
  const matches = filterMindTreeCatalogItems(items, query, filter);
  const pageCount = Math.max(1, Math.ceil(matches.length / size));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  return {
    items: matches.slice((page - 1) * size, page * size),
    total: matches.length,
    catalogTotal: items.length,
    page,
    pageSize: size,
    pageCount,
  };
}
