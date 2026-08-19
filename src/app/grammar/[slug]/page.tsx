import Link from "next/link";
import { notFound } from "next/navigation";
import { SentenceBuilder } from "@/components/SentenceBuilder";
import { SpeakLink } from "@/components/SpeakLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { grammarDetail } from "@/lib/grammar/engine";
import { breadcrumbLd, learningResourceLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { seedReady } from "@/lib/seed";

// Public reference content: identical for every visitor, so cache and
// revalidate instead of rendering per request.
export const revalidate = 3600;

/** Grammar is a small, stable set — prerender all of it. */
export async function generateStaticParams() {
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ slug: string }>(
      sql`SELECT slug FROM kg_grammar ORDER BY slug LIMIT 200`,
    );
    return rows.rows.map((row) => ({ slug: row.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await grammarDetail(slug);
  if (!data) {
    return buildMetadata({
      title: "Grammar point not found",
      description: "This grammar point is not available.",
      path: `/grammar/${slug}`,
      noindex: true,
    });
  }
  return buildMetadata({
    title: `${data.point.title} — Japanese grammar (${data.point.level})`,
    description: `${data.point.structure}. ${data.point.explanation}`,
    path: `/grammar/${slug}`,
    tags: ["Japanese grammar", data.point.title, data.point.level],
  });
}

export default async function GrammarDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await seedReady();
  const { slug } = await params;
  const data = await grammarDetail(slug);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd
        data={[
          learningResourceLd({
            name: `${data.point.title} — ${data.point.structure}`,
            description: data.point.explanation,
            path: `/grammar/${data.point.slug}`,
            level: data.point.level,
            type: "Grammar explanation",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Grammar", path: "/grammar" },
            { name: data.point.title, path: `/grammar/${data.point.slug}` },
          ]),
        ]}
      />
      <Link href="/grammar" className="text-sm font-bold text-[#1cb0f6]">
        ← Grammar
      </Link>
      <p className="mt-3 text-xs font-extrabold uppercase text-[#777]">
        {data.point.level} · difficulty {data.meta?.difficulty ?? 1}/9
      </p>
      <h1 className="text-4xl font-black">{data.point.title}</h1>
      <p className="mt-1 text-xl text-[#1cb0f6]">{data.point.structure}</p>
      <p className="mt-3">{data.point.explanation}</p>

      <section className="card mt-5 p-5">
        <h2 className="font-black">AI explanation</h2>
        <p className="mt-2 text-[#555]">{data.meta?.aiExplanation}</p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">Visual timeline</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4">
          {(data.meta?.timeline ?? []).map((step, index) => (
            <li key={step.step} className="rounded-2xl bg-[#f7f7f7] p-3">
              <p className="text-xs font-extrabold uppercase text-[#1cb0f6]">
                {index + 1}. {step.step}
              </p>
              <p className="text-sm">{step.note}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">Examples & audio</h2>
        <ul className="mt-2 space-y-2">
          {data.examples.map((row) => (
            <li key={row.id}>
              <SpeakLink text={row.ja} />
              <p className="text-sm text-[#777]">{row.en}</p>
            </li>
          ))}
        </ul>
      </section>

      {data.builder ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Sentence builder</h2>
          <div className="mt-2">
            <SentenceBuilder slug={data.point.slug} prompt={data.builder.prompt} tiles={data.builder.tiles} />
          </div>
        </section>
      ) : null}

      {data.related.length ? (
        <section className="card mt-4 p-5">
          <h2 className="font-black">Grammar graph</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.related.map((row) => (
              <Link key={`${row.id}-${row.kind}`} href={`/grammar/${row.slug}`} className="rounded-full bg-[#d7ffb8] px-3 py-1 text-sm font-bold text-[#58a700]">
                {row.kind}: {row.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
