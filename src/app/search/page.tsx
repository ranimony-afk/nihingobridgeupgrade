import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { search } from "@/lib/search/service";
import { isKind, type SearchKind } from "@/lib/search/query";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

const KIND_COLORS: Record<string, string> = {
  lexeme: "#1cb0f6",
  kanji: "#ff9600",
  sentence: "#58cc02",
  grammar: "#ce82ff",
  idiom: "#ff4b4b",
  collocation: "#ffc800",
  post: "#9aa4b2",
  course: "#58a700",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; jlpt?: string }>;
}) {
  await seedReady();
  const { q = "", type = "", jlpt = "" } = await searchParams;
  const kinds = type
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is SearchKind => isKind(value));

  const results = await search(q, {
    limit: 30,
    filters: { kinds, jlpt: jlpt ? jlpt.toUpperCase() : undefined },
  });

  function href(next: { type?: string; jlpt?: string }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const nextType = next.type ?? type;
    const nextJlpt = next.jlpt ?? jlpt;
    if (nextType) params.set("type", nextType);
    if (nextJlpt) params.set("jlpt", nextJlpt);
    return `/search?${params.toString()}`;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1cb0f6]">Search</p>
      <h1 className="text-3xl font-black">Everything, ranked</h1>
      <p className="mt-2 text-sm text-[#777]">
        Full text + fuzzy across vocabulary, kanji, sentences, grammar, idioms, and articles. Try
        <code className="ml-1 rounded bg-[#f7f7f7] px-1">type:kanji jlpt:n5</code>.
      </p>

      <div className="mt-5">
        <SearchBox initial={q} autoFocus={!q} />
      </div>

      {q ? (
        <p className="mt-4 text-sm font-bold text-[#777]">
          {results.total} result{results.total === 1 ? "" : "s"} in {results.tookMs}ms
        </p>
      ) : null}

      {results.didYouMean && results.suggestion ? (
        <p className="mt-3 rounded-2xl bg-[#fff2d0] px-4 py-3 font-bold text-[#d68b00]">
          No matches. Did you mean{" "}
          <Link href={`/search?q=${encodeURIComponent(results.suggestion)}`} className="underline">
            {results.suggestion}
          </Link>
          ?
        </p>
      ) : null}

      {q && Object.keys(results.facets.kind).length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-extrabold uppercase">
          <Link
            href={href({ type: "" })}
            className={`rounded-full px-3 py-1 ${type ? "bg-[#f7f7f7] text-[#777]" : "bg-[#3c3c3c] text-white"}`}
          >
            All {results.total}
          </Link>
          {Object.entries(results.facets.kind)
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => (
              <Link
                key={kind}
                href={href({ type: kind })}
                className="rounded-full px-3 py-1 text-white"
                style={{ background: type === kind ? "#3c3c3c" : KIND_COLORS[kind] ?? "#9aa4b2" }}
              >
                {kind} {count}
              </Link>
            ))}
          {Object.entries(results.facets.jlpt)
            .filter(([level]) => level !== "none")
            .sort()
            .map(([level, count]) => (
              <Link
                key={level}
                href={href({ jlpt: jlpt === level ? "" : level })}
                className={`rounded-full px-3 py-1 ${
                  jlpt === level ? "bg-[#3c3c3c] text-white" : "bg-[#ddf4ff] text-[#1cb0f6]"
                }`}
              >
                {level} {count}
              </Link>
            ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {results.hits.map((hit) => (
          <Link key={hit.id} href={hit.href} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="ja text-xl font-black">{hit.title}</p>
                <p className="truncate text-sm text-[#777]">{hit.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-black uppercase text-white"
                  style={{ background: KIND_COLORS[hit.kind] ?? "#9aa4b2" }}
                >
                  {hit.kind}
                </span>
                <p className="mt-1 text-[10px] font-bold text-[#afafaf]">
                  {hit.jlpt ? `${hit.jlpt} · ` : ""}score {hit.score}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {q && results.hits.length === 0 && !results.didYouMean ? (
          <p className="text-[#777]">Nothing matched. Try a shorter query.</p>
        ) : null}
        {!q ? <p className="text-[#777]">Start typing to see suggestions.</p> : null}
      </div>
    </main>
  );
}
