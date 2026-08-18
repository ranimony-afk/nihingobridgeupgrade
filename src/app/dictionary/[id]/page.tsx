import Link from "next/link";
import { notFound } from "next/navigation";
import { SpeakLink } from "@/components/SpeakLink";
import { PinSrs } from "@/components/PinSrs";
import { lexemeDetail } from "@/lib/kg/search";

export const dynamic = "force-dynamic";

export default async function LexemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await lexemeDetail(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/dictionary" className="text-sm font-bold text-[#1cb0f6]">
        ← Dictionary
      </Link>
      <h1 className="ja mt-3 text-5xl font-black">{data.lexeme.lemma}</h1>
      <p className="mt-2 text-xl text-[#1cb0f6]">{data.lexeme.reading}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SpeakLink text={data.lexeme.lemma} />
        <PinSrs targetType="lexeme" targetId={data.lexeme.id} />
      </div>
      <ul className="card mt-6 space-y-2 p-5">
        {data.glosses.map((gloss) => (
          <li key={gloss.id}>
            <span className="text-xs uppercase text-[#777]">{gloss.lang}</span> {gloss.text}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Pitch</p>
          <p className="text-2xl font-black">{data.pitch?.pattern ?? "—"}</p>
          <p className="text-sm">{data.pitch?.mora}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Frequency</p>
          <p className="text-2xl font-black">#{data.freq?.rank ?? "—"}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Furigana</p>
          <p className="ja text-xl font-black">{data.furi?.reading}</p>
        </article>
      </div>
      {data.ai ? (
        <p className="mt-4 text-sm text-[#777]">AI note: {String(data.ai.payload.mnemonic ?? "")}</p>
      ) : null}
    </main>
  );
}
