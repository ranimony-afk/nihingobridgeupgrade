import Link from "next/link";

import { GrammarExplorer } from "@/components/grammar/grammar-explorer";
import { getGrammarCatalog, getGrammarTagCloud, getGrammarOverview } from "@/services/knowledge/grammar";
import { getGrammarLevelSummary } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Grammar explorer | NihongoBridge",
  description:
    "Search, filter and browse every NihongoBridge grammar point through the canonical grammar API.",
};

type SearchParams = Promise<{ q?: string; jlpt?: string; tag?: string; register?: string; sort?: string }>;

export default async function GrammarExplorerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const jlptParam = Number(params.jlpt);
  const jlptLevel = Number.isFinite(jlptParam) && jlptParam >= 1 && jlptParam <= 5 ? jlptParam : null;
  const sortParam = params.sort as
    | "relevance"
    | "level"
    | "order"
    | "title"
    | "examples"
    | undefined;

  const [catalog, tags, levels, stats] = await Promise.all([
    getGrammarCatalog({
      query: params.q ?? "",
      jlptLevel,
      tag: params.tag ?? null,
      register: params.register ?? null,
      sort: sortParam ?? "order",
      limit: 24,
    }),
    getGrammarTagCloud(24),
    getGrammarLevelSummary(),
    getGrammarOverview(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav className="text-xs text-slate-500">
            <Link href="/grammar" className="hover:text-slate-900">
              Grammar
            </Link>
            <span className="px-1">/</span>
            <span className="text-slate-700">Explorer</span>
          </nav>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Grammar explorer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {stats.points} points · {stats.examples} corpus examples. The first page is rendered on
            the server; every filter, search and “load more” goes through{" "}
            <code className="rounded bg-slate-100 px-1">GET /api/grammar</code>.
          </p>
        </div>
        <Link
          href="/grammar/map"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900"
        >
          Open relation map →
        </Link>
      </header>

      <GrammarExplorer
        initial={{
          points: catalog.results,
          total: catalog.total,
          limit: 24,
          offset: 0,
        }}
        tags={tags}
        levels={levels}
      />
    </div>
  );
}
