import Link from "next/link";

import { GrammarMap } from "@/components/grammar/grammar-map";
import { listGrammarPoints } from "@/repositories/grammar";
import { getGrammarMap } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Grammar map | NihongoBridge",
  description: "Relation map of NihongoBridge grammar points built from the grammar relations graph.",
};

type SearchParams = Promise<{ jlpt?: string }>;

export default async function GrammarMapPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const jlptParam = Number(params.jlpt);
  const jlptLevel = Number.isFinite(jlptParam) && jlptParam >= 1 && jlptParam <= 5 ? jlptParam : null;

  const [points, graph] = await Promise.all([
    listGrammarPoints({ jlptLevel, limit: 200, sort: "order" }),
    getGrammarMap({ jlptLevel, limit: 200 }),
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
            <span className="text-slate-700">Map</span>
          </nav>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Grammar map</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Every node is a grammar point and every line a row in{" "}
            <code className="rounded bg-slate-100 px-1">grammar_relations</code>. Rings are JLPT
            levels (N5 innermost). Served by{" "}
            <code className="rounded bg-slate-100 px-1">GET /api/grammar/graph</code>.
          </p>
        </div>
        <Link
          href="/grammar/explorer"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-900"
        >
          Open explorer →
        </Link>
      </header>

      <GrammarMap
        initialNodes={points}
        initialEdges={graph.edges}
        initialLevel={jlptLevel}
      />
    </div>
  );
}
