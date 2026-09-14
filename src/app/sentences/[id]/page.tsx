import Link from "next/link";
import { notFound } from "next/navigation";

import { getSentence } from "@/services/knowledge/content";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { id } = await params;
  const sentence = await getSentence(Number(id));
  return {
    title: sentence ? `${sentence.japanese} | NihongoBridge` : "Sentence | NihongoBridge",
    description: sentence?.english,
  };
}

export default async function SentencePage({ params }: { params: RouteParams }) {
  const { id } = await params;
  const parsed = Number(id);
  if (!Number.isInteger(parsed)) notFound();
  const sentence = await getSentence(parsed);
  if (!sentence) notFound();

  const kanji = [...new Set([...sentence.japanese].filter((char) => /[㐀-鿿豈-﫿]/u.test(char)))];

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/search?types=sentence&q=日本語" className="hover:text-slate-900">
          Sentence search
        </Link>
        <span className="px-1">/</span>
        <span>#{sentence.externalId ?? sentence.id}</span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
            Example sentence
          </span>
          {sentence.jlptLevel ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              JLPT N{sentence.jlptLevel}
            </span>
          ) : null}
          <span className="text-slate-400">{sentence.length} characters</span>
        </div>
        <h1 className="jp mt-5 text-2xl leading-relaxed text-slate-950 sm:text-3xl">
          {sentence.japanese}
        </h1>
        <p className="mt-4 border-t border-slate-100 pt-4 text-lg text-slate-700">
          {sentence.english}
        </p>
      </header>

      {sentence.grammar.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Grammar in this sentence</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sentence.grammar.map((grammar) => (
              <Link
                key={grammar.slug}
                href={`/grammar/${encodeURIComponent(grammar.slug)}`}
                className="rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-500"
              >
                <span className="jp text-lg text-slate-900">{grammar.title}</span>
                {grammar.titleEn ? (
                  <span className="mt-1 block text-sm text-slate-600">{grammar.titleEn}</span>
                ) : null}
                {grammar.matchedText ? (
                  <code className="mt-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                    matched: {grammar.matchedText}
                  </code>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {kanji.length > 0 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Inspect kanji</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {kanji.map((literal) => (
              <Link
                key={literal}
                href={`/kanji/${encodeURIComponent(literal)}`}
                className="jp-glyph rounded-xl border border-slate-200 px-3 py-2 text-2xl text-slate-800 hover:border-indigo-500"
              >
                {literal}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {sentence.source ? (
        <footer className="rounded-3xl border border-slate-200 bg-white/70 p-5 text-xs text-slate-500">
          Source: {sentence.source.name} · {sentence.source.license}
          {sentence.externalId ? ` · upstream id ${sentence.externalId}` : ""}
        </footer>
      ) : null}
    </div>
  );
}
