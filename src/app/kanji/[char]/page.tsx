import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/BookmarkButton";
import { PinSrs } from "@/components/PinSrs";
import { SpeakLink } from "@/components/SpeakLink";
import { StrokeAnimator } from "@/components/StrokeAnimator";
import { JsonLd } from "@/components/seo/JsonLd";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { explorerCard } from "@/lib/kanji/enrich";
import { breadcrumbLd, learningResourceLd } from "@/lib/seo/jsonld";
import { linksForKanji } from "@/lib/seo/links";
import { buildMetadata } from "@/lib/seo/metadata";

// Public reference content: identical for every visitor, so cache and
// revalidate instead of rendering per request.
export const revalidate = 3600;

/**
 * Prerenders the most frequent kanji at build time. The rest are rendered on
 * first request and then cached by ISR, so we get fast common paths without a
 * 13,000-page build.
 */
export async function generateStaticParams() {
  try {
    const { db } = await import("@/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{ character: string }>(
      sql`SELECT character FROM kg_kanji ORDER BY COALESCE(freq, 9999) LIMIT 100`,
    );
    return rows.rows.map((row) => ({ char: encodeURIComponent(row.character) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  const character = decodeURIComponent(char);
  const data = await explorerCard(character);
  if (!data) {
    return buildMetadata({
      title: "Kanji not found",
      description: "This kanji is not in the database.",
      path: `/kanji/${char}`,
      noindex: true,
    });
  }
  const on = data.readings.filter((r) => r.kind === "on").map((r) => r.reading).join(", ");
  const kun = data.readings.filter((r) => r.kind === "kun").map((r) => r.reading).join(", ");
  return buildMetadata({
    title: `${character} — ${data.meta?.mnemonic ?? data.kanji.heisig ?? "kanji"} · stroke order and readings`,
    description: `The kanji ${character}: ${data.kanji.strokes} strokes${data.kanji.jlpt ? `, JLPT ${data.kanji.jlpt}` : ""}. On'yomi ${on || "—"}, kun'yomi ${kun || "—"}. Stroke order animation, radicals, compounds, and mnemonics.`,
    path: `/kanji/${encodeURIComponent(character)}`,
    tags: ["kanji", character, data.kanji.jlpt ?? "Japanese"],
  });
}

export default async function KanjiDetailPage({ params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  const data = await explorerCard(decodeURIComponent(char));
  if (!data) notFound();
  const on = data.readings.filter((row) => row.kind === "on");
  const kun = data.readings.filter((row) => row.kind === "kun");
  const names = data.readings.filter((row) => row.kind === "nanori");
  const related = await linksForKanji(data.kanji.character);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <JsonLd
        data={[
          learningResourceLd({
            name: `Kanji ${data.kanji.character}`,
            description: `Stroke order, readings, radicals, and compounds for ${data.kanji.character}.`,
            path: `/kanji/${encodeURIComponent(data.kanji.character)}`,
            level: data.kanji.jlpt,
            type: "Kanji reference",
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Kanji", path: "/kanji" },
            { name: data.kanji.character, path: `/kanji/${encodeURIComponent(data.kanji.character)}` },
          ]),
        ]}
      />
      <Link href="/kanji/explore" className="text-sm font-bold text-[#1cb0f6]">
        ← Mind map
      </Link>
      <h1 className="ja mt-3 text-7xl font-black">{data.kanji.character}</h1>
      <p className="mt-2 text-[#777]">
        {data.kanji.strokes} strokes · JLPT {data.kanji.jlpt} · freq #{data.kanji.freq}
        {data.rare ? " · rare" : ""} · {data.meta?.branch ?? "unbranched"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SpeakLink text={data.kanji.character} />
        <PinSrs targetType="kanji" targetId={data.kanji.id} />
        <BookmarkButton targetType="kanji" targetId={data.kanji.id} />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-black">Readings</h2>
        <p>on: {on.map((row) => row.reading).join(" · ") || "—"}</p>
        <p>kun: {kun.map((row) => row.reading).join(" · ") || "—"}</p>
        <p>names / nanori: {names.map((row) => row.reading).join(" · ") || data.meta?.nanori || "—"}</p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">History, origin, mnemonic</h2>
        <p className="mt-2">{data.meta?.history ?? "No historical note yet."}</p>
        <p className="mt-1 text-sm text-[#777]">Origin: {data.meta?.origin ?? "—"}</p>
        <p className="mt-1 text-sm">Mnemonic: {data.meta?.mnemonic ?? data.kanji.heisig}</p>
        <p className="mt-2 text-sm font-bold">
          RTK #{data.meta?.rtkIndex ?? "—"} {data.meta?.rtkKeyword ?? data.kanji.heisig} · WaniKani lvl {data.meta?.wanikani ?? "—"}
        </p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">Radicals</h2>
        <p>{data.radicals.map((row) => `${row.character} (${row.meaning})`).join(" · ") || data.kanji.radical}</p>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">Relations</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.relations.map((row) => (
            <Link key={row.id} href={`/kanji/${encodeURIComponent(row.character)}`} className="rounded-full bg-[#ddf4ff] px-3 py-1 text-sm font-bold">
              {row.kind}: {row.character}
            </Link>
          ))}
        </div>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">Compounds</h2>
        <ul>
          {data.compounds.map((row) => (
            <li key={row.id}>
              <Link href={`/dictionary/${row.id}`} className="font-black text-[#1cb0f6]">
                {row.lemma}
              </Link>{" "}
              {row.reading}
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-black">SVG / GIF stroke animation</h2>
        <StrokeAnimator character={data.kanji.character} strokes={data.strokes} />
      </section>
      <RelatedLinks title="Words using this kanji" links={related} />
    </main>
  );
}
