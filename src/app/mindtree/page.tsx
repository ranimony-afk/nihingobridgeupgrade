import { KanjiMindTreeCatalog } from "@/components/kanji/KanjiMindTreeCatalog";
import { listMindTreeCatalog } from "@/lib/kanji/kanjiMindtreeCatalog";

export default function KanjiMindTreeCatalogPage() {
  return <KanjiMindTreeCatalog items={listMindTreeCatalog()} showStudio={process.env.NODE_ENV === "development"} />;
}
