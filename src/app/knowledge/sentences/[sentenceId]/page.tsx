import { notFound } from "next/navigation";
import { getSentenceDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export default async function SentenceDetailPage({ params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  const sentence = await getSentenceDetail(sentenceId);
  if (!sentence) notFound();

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10"><article className="mx-auto max-w-4xl rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]"><a href="/knowledge" className="text-sm font-bold text-[#277a5c] underline">← Knowledge search</a><p className="mt-5 text-xs font-extrabold tracking-[.16em] text-[#277a5c]">CORPUS SENTENCE {sentence.jlptLevel ? `· ${sentence.jlptLevel}` : ""}</p><h1 className="mt-2 font-serif text-4xl font-normal leading-relaxed text-[#18231d]">{sentence.text}</h1>{sentence.reading && <p className="mt-3 text-lg text-[#526157]">{sentence.reading}</p>}{sentence.romaji && <p className="mt-1 text-sm text-[#748076]">{sentence.romaji}</p>}<section className="mt-7"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Translations</h2><div className="mt-3 space-y-2">{sentence.translations.map((translation) => <p className="rounded-xl bg-[#edf0e9] px-4 py-3 text-sm text-[#415247]" key={translation.id}><span className="mr-2 text-xs font-bold uppercase text-[#748076]">{translation.language}</span>{translation.text}</p>)}{sentence.translations.length === 0 && <p className="text-sm text-[#657166]">No translations are imported for this sentence.</p>}</div></section><section className="mt-7"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Morphology</h2><div className="mt-3 flex flex-wrap gap-2">{sentence.tokens.map((token) => <span className="rounded-lg border border-[#dce3d8] px-3 py-2 text-sm text-[#415247]" key={token.id}><strong>{token.surface}</strong>{token.lemma && <span className="ml-1 text-xs text-[#748076]">{token.lemma}</span>}</span>)}{sentence.tokens.length === 0 && <p className="text-sm text-[#657166]">No UniDic tokenization has been imported for this sentence.</p>}</div></section><p className="mt-7 text-xs text-[#748076]">Source sentence: {sentence.externalId} · License: {sentence.license ?? "see dataset attribution"}</p></article></main>
  );
}
