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
