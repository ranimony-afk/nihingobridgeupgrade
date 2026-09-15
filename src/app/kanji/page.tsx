"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Network, Plus, Check, Layers } from "lucide-react";

interface KanjiSummary {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  componentCount: number;
  primaryRadical: { character: string; meaning: string } | null;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  mnemonic: string | null;
}

interface ElementSummary {
  id: string;
  character: string;
  meaning: string;
  category: string;
  strokeCount: number;
  altForms: string[];
  usedInCount: number;
}

const LEVEL_TONE: Record<string, string> = {
  N5: "bg-emerald-100 text-emerald-700",
  N4: "bg-sky-100 text-sky-700",
  N3: "bg-indigo-100 text-indigo-700",
  N2: "bg-violet-100 text-violet-700",
  N1: "bg-rose-100 text-rose-700",
};

export default function KanjiPage() {
  const [kanji, setKanji] = useState<KanjiSummary[]>([]);
  const [elements, setElements] = useState<ElementSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [level, setLevel] = useState<string>("all");
  const [elementFilter, setElementFilter] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (level !== "all") params.set("level", level);
      if (elementFilter) params.set("elementId", elementFilter);
      if (keyword.trim()) params.set("q", keyword.trim());
      params.set("includeElements", "1");

      const res = await fetch(`/api/kanji?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setKanji(json.kanji);
        setTotal(json.total);
        setElements(json.elements ?? []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [level, elementFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const addToSrs = async (character: string) => {
    setBusy(character);
    setNotice(null);
    try {
      const res = await fetch("/api/knowledge/srs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "kanji", character }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice(
          json.created
            ? `${character} added to ${json.deckId}.`
            : `${character} is already in ${json.deckId}.`
        );
      } else setNotice(json.error);
    } finally {
      setBusy(null);
    }
  };

  const addToSrsBulk = async () => {
    setBusy("__bulk__");
    setNotice(null);
    try {
      const results = await Promise.all(
        kanji.map((k) =>
          fetch("/api/knowledge/srs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "kanji", character: k.character }),
          }).then((r) => r.json())
        )
      );
      const created = results.filter((r) => r.success && r.created).length;
      setNotice(`${created} kanji card(s) added to your Mind Tree deck.`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Assembling kanji mind tree…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Knowledge Layer
              </span>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                Kanji Mind Tree
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              漢字マインドツリー — Component Mind Tree
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {total} kanji · {elements.length} elements · decompose any kanji into parts, then jump to
              the family of kanji sharing them
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addToSrsBulk}
              disabled={busy !== null || kanji.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "__bulk__" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add all {kanji.length} to SRS
            </button>
            <Link
              href="/kana"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Kana Chart
            </Link>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900">
            {notice}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-1.5">
            {["all", "N5", "N4", "N3", "N2", "N1"].map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLevel(l);
                  setElementFilter(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  level === l
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {l === "all" ? "All levels" : l}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            className="ml-auto"
          >
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search kanji or meaning…"
              className="w-52 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium focus:border-red-500 focus:bg-white focus:outline-none"
            />
          </form>

          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {elementFilter && (
          <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs font-semibold text-indigo-900">
            <Network className="h-4 w-4" />
            Filtered to kanji containing the selected element.
            <button
              onClick={() => setElementFilter(null)}
              className="ml-auto rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200"
            >
              Clear
            </button>
          </div>
        )}

        {/* Element palette — the entry point into the tree */}
        {elements.length > 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Network className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Elements</h3>
              <span className="text-[10px] text-slate-400">
                click one to see every kanji built from it
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {elements.map((el) => (
                <button
                  key={el.id}
                  onClick={() => setElementFilter(elementFilter === el.id ? null : el.id)}
                  title={`${el.meaning} · ${el.strokeCount} strokes · used in ${el.usedInCount} kanji`}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all ${
                    elementFilter === el.id
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                      : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <span className="font-japanese text-lg font-bold text-slate-900">{el.character}</span>
                  {el.altForms.length > 0 && (
                    <span className="font-japanese text-[10px] text-slate-400">{el.altForms[0]}</span>
                  )}
                  <span className="text-[9px] font-semibold text-slate-500">{el.usedInCount}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Kanji grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {kanji.map((k) => (
            <div
              key={k.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/kanji/${encodeURIComponent(k.character)}`}
                    className="font-japanese text-5xl font-bold leading-none text-slate-900 transition-colors hover:text-red-700"
                  >
                    {k.character}
                  </Link>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${LEVEL_TONE[k.jlptLevel] ?? "bg-slate-100 text-slate-600"}`}>
                    {k.jlptLevel}
                  </span>
                </div>

                <p className="mt-2 text-xs font-bold text-slate-900">{k.meaning}</p>

                <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
                  {k.readingsOn.length > 0 && (
                    <p>
                      <span className="font-semibold text-slate-500">ON</span>{" "}
                      <span className="font-japanese">{k.readingsOn.join("、")}</span>
                    </p>
                  )}
                  {k.readingsKun.length > 0 && (
                    <p>
                      <span className="font-semibold text-slate-500">KUN</span>{" "}
                      <span className="font-japanese">{k.readingsKun.join("、")}</span>
                    </p>
                  )}
                </div>

                {k.primaryRadical && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5">
                    <span className="font-japanese text-base font-bold text-slate-900">
                      {k.primaryRadical.character}
                    </span>
                    <span className="text-[10px] text-slate-500">{k.primaryRadical.meaning}</span>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">
                    {k.strokeCount} strokes
                  </span>
                  <Link
                    href={`/kanji/${encodeURIComponent(k.character)}`}
                    className="flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Network className="h-2.5 w-2.5" /> {k.componentCount} parts
                  </Link>
                </div>

                {k.vocabulary.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {k.vocabulary.slice(0, 2).map((v) => (
                      <p key={v.word} className="text-[10px] text-slate-600">
                        <span className="font-japanese font-bold text-slate-900">{v.word}</span>{" "}
                        <span className="font-japanese text-slate-500">({v.reading})</span> — {v.meaning}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                <Link
                  href={`/kanji/${encodeURIComponent(k.character)}`}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-white hover:bg-slate-800"
                >
                  <Network className="h-3 w-3" /> Mind Tree
                </Link>
                <button
                  onClick={() => addToSrs(k.character)}
                  disabled={busy !== null}
                  title="Add to SRS"
                  className="flex items-center justify-center rounded-xl border border-slate-200 px-2.5 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === k.character ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {kanji.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Layers className="mx-auto mb-2 h-9 w-9 text-slate-300" />
            <p className="text-sm font-bold text-slate-800">No kanji match this filter</p>
          </div>
        )}
      </div>
    </main>
  );
}
