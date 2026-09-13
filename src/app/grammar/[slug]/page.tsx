import Link from "next/link";
import { notFound } from "next/navigation";

import { GrammarExampleList } from "@/components/grammar/grammar-example-list";
import { getGrammarPoint } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const point = await getGrammarPoint(decodeURIComponent(slug));
  return {
    title: point ? `${point.title} — grammar | NihongoBridge` : "Grammar | NihongoBridge",
    description: point?.summary ?? undefined,
  };
}

const RELATION_LABEL: Record<string, string> = {
  prerequisite: "prerequisite",
  similar: "similar",
  contrast: "contrast",
  related: "related",
  variant: "variant",
};

export default async function GrammarPointPage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const point = await getGrammarPoint(decodeURIComponent(slug).trim());
  if (!point) notFound();

  return (
    <div className="space-y-8">
      <nav className="text-xs text-slate-500">
        <Link href="/grammar" className="hover:text-slate-900">
          Grammar
        </Link>
        <span className="px-1">/</span>
        <span className="text-slate-700">{point.title}</span>
        <span className="ml-auto flex gap-3">
          <Link href="/grammar/explorer" className="hover:text-slate-900">
            Explorer
          </Link>
          <Link href={`/grammar/map?jlpt=${point.jlptLevel ?? ""}`} className="hover:text-slate-900">
            Relation map
          </Link>
        </span>
      </nav>

      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="jp text-3xl text-slate-900">{point.title}</h1>
            {point.titleEn ? (
              <p className="mt-1 text-lg font-medium text-slate-700">{point.titleEn}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {point.jlptLevel ? (
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-700">
                JLPT N{point.jlptLevel}
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
              {point.register}
            </span>
            {point.tags.map((tag) => (
              <Link
                key={tag}
                href={`/grammar?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-slate-50 px-3 py-1 text-slate-500 hover:text-slate-900"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </div>

        {point.summary ? (
          <p className="mt-4 max-w-3xl text-sm text-slate-700">{point.summary}</p>
        ) : null}

        {point.formation ? (
          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Formation</p>
            <p className="jp mt-1 text-sm text-slate-800">{point.formation}</p>
          </div>
        ) : null}

        {point.explanation ? (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-700">
            {point.explanation}
          </p>
        ) : null}

        {point.notes ? (
          <p className="mt-3 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {point.notes}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Patterns</h2>
            <p className="mt-1 text-xs text-slate-500">
              Surface forms stored for this point. The match string is what the ETL searched for in
              the example corpus.
            </p>
            <ul className="mt-4 space-y-2">
              {point.patternDetails.map((pattern) => (
                <li
                  key={pattern.id}
                  className="flex flex-wrap items-baseline gap-3 rounded-2xl border border-slate-200 px-4 py-2"
                >
                  <span className="jp text-lg text-slate-900">{pattern.pattern}</span>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {pattern.matchText}
                  </code>
                  {pattern.isCore ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                      core
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      variant
                    </span>
                  )}
                  {pattern.note ? (
                    <span className="text-xs text-slate-500">{pattern.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Example sentences</h2>
              <p className="text-xs text-slate-500">
                {point.examples.length} sentences · match highlighted
              </p>
            </div>
            {point.examples.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No corpus evidence harvested for this point yet.
              </p>
            ) : (
              <div className="mt-4">
                <GrammarExampleList examples={point.examples} />
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {point.related.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Related points</h2>
              <ul className="mt-3 space-y-2">
                {point.related.map((related) => (
                  <li key={`${related.slug}-${related.relation}-${related.inbound}`}>
                    <Link
                      href={`/grammar/${encodeURIComponent(related.slug)}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:border-indigo-500"
                    >
                      <span>
                        <span className="jp block text-sm text-slate-800">{related.title}</span>
                        {related.titleEn ? (
                          <span className="block text-[11px] text-slate-500">
                            {related.titleEn}
                          </span>
                        ) : null}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        {RELATION_LABEL[related.relation] ?? related.relation}
                        {related.inbound ? " ←" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {point.kanji.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Kanji in examples</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {point.kanji.map((kanji) => (
                  <Link
                    key={kanji.id}
                    href={`/kanji/${encodeURIComponent(kanji.literal)}`}
                    title={kanji.meanings.slice(0, 3).join(", ")}
                    className="jp-glyph rounded-lg border border-slate-200 px-2 py-1 text-lg text-slate-800 hover:border-indigo-500 hover:text-indigo-700"
                  >
                    {kanji.literal}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {point.vocabulary.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Related vocabulary</h2>
              <ul className="mt-3 space-y-2">
                {point.vocabulary.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/dictionary?q=${encodeURIComponent(entry.kanjiText)}`}
                      className="block rounded-xl border border-slate-200 px-3 py-2 hover:border-rose-500"
                    >
                      <span className="jp block text-sm text-slate-800">{entry.kanjiText}</span>
                      <span className="jp block text-[11px] text-slate-500">{entry.kanaText}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {entry.meanings.slice(0, 2).join("; ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </section>

      <footer className="rounded-3xl border border-slate-200 bg-white/70 p-5 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">Provenance: </span>
        {point.provenance.map((source) => (
          <span key={source.code} className="mr-2 inline-block">
            {source.name} — {source.license}
          </span>
        ))}
        {point.examples.some((example) => example.externalId) ? (
          <span className="mt-1 block">
            Example ids reference the upstream Tanaka corpus (EDRDG), e.g.{" "}
            <code>{point.examples.find((example) => example.externalId)?.externalId}</code>.
          </span>
        ) : null}
      </footer>
    </div>
  );
}
