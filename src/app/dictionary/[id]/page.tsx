import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/BookmarkButton";
import { PinSrs } from "@/components/PinSrs";
import { SpeakLink } from "@/components/SpeakLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { dictionaryCard } from "@/lib/dict/enrich";
import { breadcrumbLd, definedTermLd } from "@/lib/seo/jsonld";
import { linksForLexeme } from "@/lib/seo/links";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await dictionaryCard(id);
  if (!data) {
    return buildMetadata({
      title: "Entry not found",
      description: "This dictionary entry is not available.",
      path: `/dictionary/${id}`,
      noindex: true,
    });
  }
  const meanings = data.glosses.filter((g) => g.lang === "en").map((g) => g.text);
  return buildMetadata({
    title: `${data.lexeme.lemma}（${data.lexeme.reading}）— ${meanings[0] ?? "Japanese word"}`,
    description: `${data.lexeme.lemma} means ${meanings.join(", ") || "see entry"}. Reading ${data.lexeme.reading}, ${data.lexeme.pos}${data.lexeme.jlpt ? `, JLPT ${data.lexeme.jlpt}` : ""}. Pitch accent, audio, conjugations, and examples.`,
    path: `/dictionary/${id}`,
    tags: ["Japanese dictionary", data.lexeme.lemma, data.lexeme.reading],
  });
}

export default async function LexemePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await dictionaryCard(id);
  if (!data) notFound();
  const langs = ["ja", "en", "hi", "ta", "ml"] as const;
  const related = await linksForLexeme(data.lexeme.id);
  const englishGlosses = data.glosses.filter((row) => row.lang === "en").map((row) => row.text);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd
        data={[
          definedTermLd({
            term: data.lexeme.lemma,
            reading: data.lexeme.reading,
            definitions: englishGlosses,
            path: `/dictionary/${data.lexeme.id}`,
            partOfSpeech: data.lexeme.pos,
            jlpt: data.lexeme.jlpt,
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Dictionary", path: "/dictionary" },
            { name: data.lexeme.lemma, path: `/dictionary/${data.lexeme.id}` },
          ]),
        ]}
      />
      <Link href="/dictionary" className="text-sm font-bold text-[#1cb0f6]">
        ← Dictionary
      </Link>
      <h1 className="ja mt-3 text-5xl font-black">{data.lexeme.lemma}</h1>
      <p className="mt-2 text-xl text-[#1cb0f6]">
        {data.lexeme.reading} · {data.lexeme.pos} · JLPT {data.lexeme.jlpt}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SpeakLink text={data.lexeme.lemma} />
        <PinSrs targetType="lexeme" targetId={data.lexeme.id} />
        <BookmarkButton targetType="lexeme" targetId={data.lexeme.id} />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-black">Definitions</h2>
        {langs.map((lang) => {
          const rows = data.glosses.filter((gloss) => gloss.lang === lang || (lang === "en" && gloss.lang === "en"));
          if (!rows.length && lang !== "en") return null;
          return (
            <p key={lang} className="mt-2">
              <span className="text-xs font-extrabold uppercase text-[#777]">{lang}</span>{" "}
              {rows.map((row) => row.text).join(" · ") || "—"}
            </p>
          );
        })}
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Pitch accent</p>
          <p className="text-2xl font-black">{data.pitch?.pattern ?? "—"}</p>
          <p className="text-sm">{data.pitch?.mora}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Frequency</p>
          <p className="text-2xl font-black">#{data.freq?.rank ?? "—"}</p>
        </article>
        <article className="card p-4">
          <p className="text-xs font-extrabold uppercase text-[#777]">Audio</p>
          <SpeakLink text={data.audio?.value ?? data.lexeme.lemma} />
        </article>
      </div>

      {data.forms.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Keigo / casual / variants</h2>
          <ul className="mt-2 space-y-1">
            {data.forms.map((form) => (
              <li key={form.id}>
                <span className="text-xs uppercase text-[#777]">{form.style}</span> {form.surface}（{form.reading}）
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.conjugations.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Conjugations</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {data.conjugations.map((row) => (
              <p key={row.id}>
                <span className="text-[#777]">{row.form}</span> {row.surface}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {data.related.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Synonyms, antonyms, related</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.related.map((row) => (
              <Link key={`${row.id}-${row.kind}`} href={`/dictionary/${row.id}`} className="rounded-full bg-[#ddf4ff] px-3 py-1 text-sm font-bold text-[#1cb0f6]">
                {row.kind}: {row.lemma}
              </Link>
            ))}
          </ul>
        </section>
      ) : null}

      {data.grammar.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Grammar lookup</h2>
          {data.grammar.map((row) => (
            <p key={row.id}>
              <Link href="/grammar" className="font-black text-[#58cc02]">
                {row.title}
              </Link>{" "}
              {row.structure} — {row.explanation}
            </p>
          ))}
        </section>
      ) : null}

      {data.collocations.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Collocations</h2>
          <ul>
            {data.collocations.map((row) => (
              <li key={row.id}>
                {row.leftJa} {row.rightJa} — {row.en}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.examples.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Examples</h2>
          <ul className="space-y-2">
            {data.examples.map((row) => (
              <li key={row.id}>
                <SpeakLink text={row.ja} />
                <p className="text-sm text-[#777]">{row.en}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <RelatedLinks title="Related words and kanji" links={related} />
    </main>
  );
}
