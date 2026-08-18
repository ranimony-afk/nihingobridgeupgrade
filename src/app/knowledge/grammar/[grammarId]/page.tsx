import { notFound } from "next/navigation";
import { getGrammarDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export default async function GrammarDetailPage({ params }: { params: Promise<{ grammarId: string }> }) {
  const { grammarId } = await params;
  const grammar = await getGrammarDetail(grammarId);
  if (!grammar) notFound();

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10"><article className="mx-auto max-w-4xl rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]"><a href="/knowledge" className="text-sm font-bold text-[#277a5c] underline">← Knowledge search</a><p className="mt-5 text-xs font-extrabold tracking-[.16em] text-[#277a5c]">GRAMMAR {grammar.jlptLevel ? `· ${grammar.jlptLevel}` : ""}</p><h1 className="mt-1 font-serif text-5xl font-normal text-[#18231d]">{grammar.pattern}</h1><p className="mt-2 text-xl text-[#526157]">{grammar.title}</p><section className="mt-7 rounded-2xl bg-[#edf0e9] p-5"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Meaning and usage</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#415247]">{grammar.explanation}</p>{grammar.formation && <p className="mt-4 rounded-xl bg-white px-3 py-2 text-sm text-[#415247]"><span className="font-bold">Formation:</span> {grammar.formation}</p>}</section><section className="mt-7"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Examples</h2><div className="mt-3 space-y-3">{grammar.examples.map((example) => <div className="rounded-xl border border-[#dce3d8] p-4" key={example.id}><p className="font-serif text-xl text-[#18231d]">{example.japanese}</p>{example.english && <p className="mt-2 text-sm text-[#526157]">{example.english}</p>}{example.explanation && <p className="mt-2 text-xs leading-5 text-[#748076]">{example.explanation}</p>}</div>)}{grammar.examples.length === 0 && <p className="text-sm text-[#657166]">No examples have been imported for this grammar point yet.</p>}</div></section><p className="mt-7 text-xs text-[#748076]">Source record: {grammar.externalId}</p></article></main>
  );
}
