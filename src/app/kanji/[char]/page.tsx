import Link from "next/link";
import { notFound } from "next/navigation";
import { SpeakLink } from "@/components/SpeakLink";
import { PinSrs } from "@/components/PinSrs";
import { kanjiDetail } from "@/lib/kg/search";

export const dynamic = "force-dynamic";

export default async function KanjiDetailPage({ params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  const data = await kanjiDetail(decodeURIComponent(char));
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/kanji" className="text-sm font-bold text-[#1cb0f6]">
        ← All kanji
      </Link>
      <h1 className="ja mt-3 text-7xl font-black">{data.kanji.character}</h1>
      <p className="mt-2 text-[#777]">
        {data.kanji.strokes} strokes · JLPT {data.kanji.jlpt} · freq #{data.kanji.freq} · radical {data.kanji.radical}
      </p>
      <div className="mt-3 flex gap-2">
        <SpeakLink text={data.kanji.character} />
        <PinSrs targetType="kanji" targetId={data.kanji.id} />
      </div>
      <section className="card mt-6 p-5">
        <h2 className="font-black">Readings</h2>
        <p className="mt-2">
          on: {data.readings.filter((row) => row.kind === "on").map((row) => row.reading).join(" · ") || "—"}
        </p>
        <p>
          kun: {data.readings.filter((row) => row.kind === "kun").map((row) => row.reading).join(" · ") || "—"}
        </p>
        <p className="mt-2">Heisig: {data.kanji.heisig}</p>
      </section>
      <section className="card mt-4 p-5">
        <h2 className="font-black">Stroke order ({data.strokes.length})</h2>
        <ol className="mt-2 grid grid-cols-4 gap-2 text-sm">
          {data.strokes.map((stroke) => (
            <li key={stroke.id} className="rounded-xl bg-[#f7f7f7] p-2">
              {stroke.strokeNo}. <span className="font-mono text-xs">{stroke.path}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
