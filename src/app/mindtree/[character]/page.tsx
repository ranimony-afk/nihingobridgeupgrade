import Link from "next/link";
import { KanjiMindTreeExplorer } from "@/components/kanji/KanjiMindTreeExplorer";
import { getMindTreeEntry, listMindTreeCatalog } from "@/lib/kanji/kanjiMindtreeCatalog";

export const dynamicParams = true;

export function generateStaticParams() {
  return listMindTreeCatalog().map((item) => ({ character: item.character }));
}

export default async function KanjiMindTreeCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ character: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { character: routeCharacter } = await params;
  let character = routeCharacter;
  try {
    character = decodeURIComponent(routeCharacter);
  } catch {
    // Keep the raw path value and show the unsupported-character state.
  }
  const entry = getMindTreeEntry(character);
  const query = searchParams ? await searchParams : {};
  const singleValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const from = singleValue(query.from);
  const via = singleValue(query.via);
  const context = {
    from: from && Array.from(from).length === 1 ? from : undefined,
    via: via?.slice(0, 120),
  };
  if (entry) return <KanjiMindTreeExplorer key={entry.character} entry={entry} context={context} />;

  const isSingleCharacter = Array.from(character).length === 1;
  return (
    <main className="min-h-[70vh] bg-[#f6f7f8] px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700">Kanji MindTree · coverage notice</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">This character is not in the current source-backed slice.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isSingleCharacter ? (
            <>The route for <span className="font-japanese text-lg font-bold text-slate-900" lang="ja">{character}</span> loaded safely, but no matching MindTree record is available yet.</>
          ) : "MindTree currently accepts one exact Unicode character per route. No decomposition or meaning was inferred."}
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-600">The current source-backed learning slice contains 100 characters. This route will not invent a meaning, decomposition, or mnemonic for unsupported characters.</p>
        <Link href="/mindtree" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">
          Browse supported characters
        </Link>
      </section>
    </main>
  );
}
