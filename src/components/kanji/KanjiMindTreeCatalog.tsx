"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MindTreeCatalogItem } from "@/lib/kanji/kanjiMindtreeCatalog";
import { filterMindTreeCatalogItems, MINDTREE_CATALOG_FILTERS, type MindTreeCatalogFilter } from "@/lib/kanji/mindtreeCatalogSearch";

export function KanjiMindTreeCatalog({ items, showStudio = false }: { items: MindTreeCatalogItem[]; showStudio?: boolean }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<MindTreeCatalogFilter>("all");
  const filteredItems = useMemo(
    () => filterMindTreeCatalogItems(items, query, level),
    [items, level, query],
  );

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-rose-700">NihongoBridge · Learning Lab</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Kanji MindTree</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Start with a supported kanji, inspect source-annotated strokes, then follow bounded component and reading links. Memory aids are separate from dictionary and visual evidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showStudio ? <Link href="/mindtree/studio" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">Development-only mnemonic studio</Link> : null}
            <Link
              href="/kanji"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
            >
              Existing Kanji tools
            </Link>
          </div>
        </div>

        <section aria-labelledby="catalog-heading" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="catalog-heading" className="text-lg font-extrabold">Supported characters</h2>
              <p className="mt-1 text-sm text-slate-500">{items.length} characters with matching pinned KanjiVG and KANJIDIC2 records.</p>
            </div>
            <p className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800">100-character learning slice</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="sr-only">Search supported kanji</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by kanji, meaning, or reading"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none placeholder:text-slate-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
              />
            </label>
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Filter by JLPT level or school grade</legend>
              {MINDTREE_CATALOG_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={level === item}
                  onClick={() => setLevel(item)}
                  className={`min-h-10 rounded-lg px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 ${
                    level === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item === "all" ? "All" : item}
                </button>
              ))}
            </fieldset>
          </div>

          <p className="mt-4 text-xs font-medium text-slate-500" aria-live="polite">
            Showing {filteredItems.length} of {items.length} characters.
          </p>

          {filteredItems.length > 0 ? (
            <ul className="mt-3 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <li key={item.character}>
                  <Link
                    href={`/mindtree/${encodeURIComponent(item.character)}`}
                    className="group flex min-h-32 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-rose-300 hover:bg-rose-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                  >
                    <span className="font-japanese flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-5xl font-medium text-slate-900 group-hover:bg-white" lang="ja">
                      {item.character}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-extrabold text-slate-900">{item.meaning}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.jlptLevel ?? (item.gradeLevel ? `Grade ${item.gradeLevel}` : "Kanji")}</span>
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-600">
                        {item.readingsKun.length ? `Kun ${item.readingsKun.join(" · ")}` : "No kun reading listed"}
                      </span>
                      <span className="block text-xs leading-5 text-slate-600">
                        {item.readingsOn.length ? `On ${item.readingsOn.join(" · ")}` : "No on reading listed"}
                      </span>
                      <span className="mt-2 block text-[11px] font-semibold text-rose-700">{item.strokeCount} strokes · {item.meaningSourceRef === "first-party:kanji-mindtree:v1" ? "first-party study record" : "KANJIDIC2 facts"} · Open MindTree →</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="font-bold text-slate-800">No supported character matches that search.</p>
              <p className="mt-1 text-sm text-slate-600">Try another kanji, meaning, or reading, or reset the active filter.</p>
              <button type="button" onClick={() => { setQuery(""); setLevel("all"); }} className="mt-3 min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">Clear search and filters</button>
            </div>
          )}
        </section>

        <aside className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
          <strong className="text-slate-800">Evidence note:</strong> strokes and group labels come from KanjiVG; dictionary meanings/readings/grade come from KANJIDIC2; 33 first-party study rows remain, with 31 mnemonic drafts. No mnemonic is currently published, and AI-assisted content stays in an unpublished overlay. These layers are kept distinct; no mnemonic is etymology.
        </aside>
      </div>
    </main>
  );
}
