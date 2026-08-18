import { notFound } from "next/navigation";
import { getLexemeDetail } from "@/lib/knowledge/service";

export const dynamic = "force-dynamic";

export default async function LexemePage({ params }: { params: Promise<{ lexemeId: string }> }) {
  const { lexemeId } = await params;
  const lexeme = await getLexemeDetail(lexemeId);
  if (!lexeme) notFound();

  return (
    <main className="min-h-screen bg-[#f2f4ed] px-5 py-10"><article className="mx-auto max-w-4xl rounded-[1.5rem] border border-[#dce3d8] bg-[#fbfcf7] p-7 shadow-[0_16px_40px_rgba(40,59,43,0.08)]"><a href="/knowledge" className="text-sm font-bold text-[#277a5c] underline">← Knowledge search</a><p className="mt-5 text-xs font-extrabold tracking-[.16em] text-[#277a5c]">LEXEME {lexeme.jlptLevel ? `· ${lexeme.jlptLevel}` : ""}</p><h1 className="mt-1 font-serif text-5xl font-normal text-[#18231d]">{lexeme.primarySpelling ?? lexeme.primaryReading}</h1><p className="mt-2 text-xl text-[#526157]">{lexeme.primaryReading}</p>{lexeme.primaryGloss && <p className="mt-4 text-lg text-[#415247]">{lexeme.primaryGloss}</p>}<section className="mt-7"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Readings</h2><div className="mt-3 grid gap-3">{lexeme.readings.map((reading) => <div className="rounded-xl bg-[#edf0e9] p-4" key={reading.id}><p className="font-serif text-xl text-[#18231d]">{reading.reading}</p>{reading.romaji && <p className="mt-1 text-sm text-[#657166]">{reading.romaji}</p>}{reading.furigana.length > 0 && <p className="mt-2 text-sm text-[#415247]">Furigana: {reading.furigana.map((part) => `${part.ruby}[${part.rt}]`).join(" ")}</p>}{reading.pitchAccents.length > 0 && <p className="mt-2 text-xs text-[#657166]">Pitch patterns: {reading.pitchAccents.map((accent) => accent.pattern).join(", ")}</p>}</div>)}</div></section><section className="mt-7"><h2 className="font-serif text-2xl font-normal text-[#18231d]">Senses</h2><div className="mt-3 space-y-3">{lexeme.senses.map((sense) => <div className="rounded-xl border border-[#dce3d8] p-4" key={sense.id}><p className="text-xs font-bold uppercase tracking-[.1em] text-[#748076]">{sense.partOfSpeech.join(", ") || "General"}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#415247]">{sense.glosses.map((gloss) => <li key={gloss.id}>{gloss.gloss} <span className="text-xs text-[#748076]">{gloss.language}</span></li>)}</ul></div>)}</div></section><p className="mt-7 text-xs text-[#748076]">Source record: {lexeme.externalId}</p></article></main>
  );
}
