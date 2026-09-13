import Link from "next/link";

import { UnifiedSearch } from "@/components/search/unified-search";
import { getSearchHealth, searchKnowledge } from "@/services/search/postgres-search";
import type { SearchEntityType, SearchMode } from "@/types/search";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search | NihongoBridge",
  description:
    "Search Japanese kanji, dictionary, grammar, sentences, courses and lessons with PostgreSQL exact, full-text and fuzzy search.",
};

type SearchParams = Promise<{
  q?: string;
  mode?: string;
  types?: string;
  jlpt?: string;
}>;

const VALID_MODES = new Set<SearchMode>(["auto", "exact", "full_text", "fuzzy"]);
const VALID_TYPES = new Set<SearchEntityType>(["kanji", "dictionary", "grammar", "sentence", "course", "lesson"]);

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const mode = VALID_MODES.has(params.mode as SearchMode)
    ? (params.mode as SearchMode)
    : "auto";
  const types = (params.types ?? "dictionary,kanji,grammar,sentence,course,lesson")
    .split(",")
    .map((type) => type.trim())
    .filter((type): type is SearchEntityType => VALID_TYPES.has(type as SearchEntityType));
  const jlptParam = Number(params.jlpt);
  const jlptLevel = Number.isInteger(jlptParam) && jlptParam >= 1 && jlptParam <= 5 ? jlptParam : null;

  const [result, stats] = await Promise.all([
    query
      ? searchKnowledge({ query, mode, types, jlptLevel, limit: 24 })
      : Promise.resolve({
          query: "",
          normalizedQuery: "",
          mode,
          types,
          hits: [],
          total: 0,
          facets: { kanji: 0, dictionary: 0, grammar: 0, sentence: 0, course: 0, lesson: 0 },
          limit: 24,
          offset: 0,
          hasMore: false,
          nextOffset: null,
          tookMs: 0,
        }),
    getSearchHealth(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Search</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            One PostgreSQL index across kanji, JMdict dictionary, grammar, sentences, courses and lessons. Exact and prefix
            matches rank first, followed by GIN full-text and <code>pg_trgm</code> fuzzy matches.
          </p>
        </div>
        <Link
          href="/api/search/stats"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-slate-900"
        >
          {stats.active.toLocaleString("en-US")} indexed · health →
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.byType.map((type) => (
          <div key={type.entityType} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{type.entityType}</p>
            <p className="text-xl font-semibold text-slate-900">
              {type.active.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </div>

      <UnifiedSearch
        initial={{
          query,
          mode,
          types: types.length > 0 ? types : ["kanji", "dictionary", "grammar", "sentence", "course", "lesson"],
          hits: result.hits,
          facets: result.facets,
          total: result.total,
          limit: 24,
        }}
      />

      <footer className="rounded-3xl border border-slate-200 bg-white/70 p-5 text-xs text-slate-500">
        <strong className="text-slate-700">PostgreSQL only.</strong> No Meilisearch, Elasticsearch or
        hosted search API is used. Full-text index: {stats.fullTextIndex ? "ready" : "missing"} ·
        pg_trgm: {stats.pgTrgm ? "ready" : "missing"} · trigram indexes: {stats.trigramIndexes}.
      </footer>
    </div>
  );
}
