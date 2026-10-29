import { notFound } from "next/navigation";
import { KanjiMindTreeMnemonicStudio } from "@/components/kanji/KanjiMindTreeMnemonicStudio";
import { KANJI } from "@/data/kanji";
import { MINDTREE_MNEMONIC_RECORDS } from "@/lib/kanji/mindtreeMnemonicContent";
import { listMindTreeEditorialContext } from "@/lib/kanji/kanjiMindtreeCatalog";

export const dynamic = "force-dynamic";

export default function KanjiMindTreeMnemonicStudioPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const contexts = listMindTreeEditorialContext();
  if (!contexts.length) notFound();
  return (
    <KanjiMindTreeMnemonicStudio
      contexts={contexts}
      initialRecords={[...MINDTREE_MNEMONIC_RECORDS]}
      vocabularyCoverage={KANJI.filter((item) => item.vocabulary.length > 0).length}
    />
  );
}
