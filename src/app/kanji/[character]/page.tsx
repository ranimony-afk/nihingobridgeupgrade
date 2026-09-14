"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Layers, Loader2, Network, Plus, Volume2, ArrowLeft, GitBranch } from "lucide-react";

interface MindNode {
  id: string;
  character: string;
  label: string;
  kind: "kanji" | "radical" | "primitive";
  meaning: string;
  strokeCount: number;
  role?: string;
  renderedAs?: string;
  position?: string | null;
  depth: number;
  jlptLevel?: string;
  isJlpt: boolean;
}

interface MindEdge {
  from: string;
  to: string;
  role: string;
  renderedAs: string;
}

interface MindTree {
  centre: MindNode;
  nodes: MindNode[];
  edges: MindEdge[];
  rings: Array<{ depth: number; label: string; nodes: MindNode[] }>;
  stats: {
    components: number;
    familySize: number;
    phoneticComponents: string[];
    semanticComponents: string[];
  };
}

interface DetailResponse {
  success: boolean;
  kanji: {
    character: string;
    meaning: string;
    readingsKun: string[];
    readingsOn: string[];
    strokeCount: number;
    jlptLevel: string;
    gradeLevel: number | null;
    mnemonic: string | null;
    vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  };
  tree: MindTree;
  profile: Array<{
    id: string;
    role: string;
    position: string | null;
    renderedAs: string;
    element: {
      character: string;
      meaning: string;
      readingKun: string | null;
      readingOn: string | null;
      strokeCount: number;
      category: string;
      mnemonic: string | null;
    } | null;
  }>;
}

const ROLE_META: Record<string, { label: string; tone: string; hint: string }> = {
  semantic: {
    label: "meaning",
    tone: "bg-emerald-100 text-emerald-800",
    hint: "carries part of the kanji's sense",
  },
  phonetic: {
    label: "sound",
    tone: "bg-sky-100 text-sky-800",
    hint: "supplies (part of) the on-yomi reading",
  },
  positional: { label: "frame", tone: "bg-amber-100 text-amber-800", hint: "positions or encloses the rest" },
  structural: { label: "shape", tone: "bg-slate-100 text-slate-700", hint: "fills out the form" },
};

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.85;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith("ja"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

export default function KanjiMindTreePage() {
  const params = useParams<{ character: string }>();
  const character = decodeURIComponent(params.character);

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/kanji/${encodeURIComponent(character)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success) setData(j);
        else setError(j.error || "Not found");
      })
      .catch(() => alive && setError("Failed to load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [character]);

  const addToSrs = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge/srs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "kanji", character }),
      });
      const json = await res.json();
      if (json.success) {
        setAdded(true);
        setNotice(
          json.created
            ? `Added to ${json.deckId} — find it under SRS Review.`
            : `Already in ${json.deckId}.`
        );
      } else setNotice(json.error);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-red-600" />
        <p className="text-sm font-semibold text-slate-600">Growing the mind tree…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Network className="mx-auto mb-3 h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-900">Kanji not in the mind tree</h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          href="/kanji"
          className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          Browse all kanji
        </Link>
      </div>
    );
  }

  const { kanji, tree, profile } = data;

  /* Radial layout: centre + two rings of nodes. */
  const RADII = [0, 190, 340];
  const layout = tree.nodes.map((node) => {
    if (node.depth === 0) return { node, x: 0, y: 0 };
    const siblings = tree.nodes.filter((n) => n.depth === node.depth);
    const idx = siblings.findIndex((n) => n.id === node.id);
    const count = siblings.length;
    const angle = (idx / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    const r = RADII[Math.min(node.depth, RADII.length - 1)];
    return { node, x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });

  const posById = new Map(layout.map((l) => [l.node.id, l]));

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/kanji"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> All kanji
        </Link>

        {notice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900">
            {notice}
          </div>
        )}

        {/* Header card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <button
                onClick={() => speak(kanji.character)}
                className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-lg transition-transform hover:scale-105"
              >
                <span className="font-japanese text-6xl font-bold text-white">{kanji.character}</span>
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {kanji.jlptLevel}
                  </span>
                  {kanji.gradeLevel && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      grade {kanji.gradeLevel}
                    </span>
                  )}
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {kanji.strokeCount} strokes
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{kanji.meaning}</h1>
                <div className="mt-2 space-y-0.5 text-xs">
                  {kanji.readingsOn.length > 0 && (
                    <p className="text-slate-700">
                      <span className="mr-1.5 font-bold text-slate-500">音読み</span>
                      <span className="font-japanese font-semibold">{kanji.readingsOn.join("、")}</span>
                    </p>
                  )}
                  {kanji.readingsKun.length > 0 && (
                    <p className="text-slate-700">
                      <span className="mr-1.5 font-bold text-slate-500">訓読み</span>
                      <span className="font-japanese font-semibold">{kanji.readingsKun.join("、")}</span>
                    </p>
                  )}
                </div>
                {kanji.mnemonic && (
                  <p className="mt-2.5 max-w-lg rounded-xl bg-amber-50 p-2.5 text-[11px] italic leading-relaxed text-amber-900">
                    {kanji.mnemonic}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 space-y-2">
              <button
                onClick={addToSrs}
                disabled={busy}
                className={`flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-50 ${
                  added ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-700 shadow-red-500/20"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : added ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {added ? "In your deck" : "Add to SRS"}
              </button>
              <div className="flex items-center justify-center gap-3 text-[10px] font-semibold text-slate-500">
                <span>{tree.stats.components} components</span>
                <span>·</span>
                <span>{tree.stats.familySize} family</span>
              </div>
            </div>
          </div>

          {kanji.vocabulary.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Vocabulary using this kanji
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {kanji.vocabulary.map((v) => (
                  <button
                    key={v.word}
                    onClick={() => speak(v.word)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-400"
                  >
                    <span className="font-japanese text-base font-bold text-slate-900">{v.word}</span>
                    <span className="font-japanese text-[11px] text-slate-500">{v.reading}</span>
                    <span className="text-[10px] text-slate-600">{v.meaning}</span>
                    <Volume2 className="h-3 w-3 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mind tree graph */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">Component Tree</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-900" /> this kanji
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> components
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> family kanji
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div
              className="relative mx-auto"
              style={{ width: 760, height: 760, minWidth: 760, minHeight: 760 }}
            >
              {/* Edges */}
              <svg className="absolute inset-0 h-full w-full" style={{ left: 380, top: 0 }}>
                <g transform="translate(0,0)">
                  {tree.edges.map((e, i) => {
                    const a = posById.get(e.from);
                    const b = posById.get(e.to);
                    if (!a || !b) return null;
                    const x1 = a.x + 380;
                    const y1 = a.y + 380;
                    const x2 = b.x + 380;
                    const y2 = b.y + 380;
                    const fromCentre = a.node.depth === 0;
                    return (
                      <line
                        key={i}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={fromCentre ? "#6366f1" : "#a3e635"}
                        strokeWidth={fromCentre ? 2 : 1.25}
                        strokeDasharray={fromCentre ? "none" : "4 3"}
                        opacity={fromCentre ? 0.65 : 0.45}
                      />
                    );
                  })}
                </g>
              </svg>

              {/* Nodes */}
              {layout.map(({ node, x, y }) => {
                const isCentre = node.depth === 0;
                const isComponent = node.depth === 1;
                const size = isCentre ? 108 : isComponent ? 84 : 66;
                const ring = isCentre
                  ? "bg-slate-900 text-white ring-4 ring-slate-200"
                  : isComponent
                  ? "bg-white text-slate-900 border-2 border-indigo-400 ring-2 ring-indigo-100"
                  : "bg-white text-slate-800 border-2 border-emerald-300 hover:border-emerald-500";

                return (
                  <div
                    key={node.id}
                    className="absolute flex flex-col items-center justify-center rounded-2xl text-center shadow-md transition-transform hover:scale-105"
                    style={{
                      left: x + 380 - size / 2,
                      top: y + 380 - size / 2,
                      width: size,
                      height: size,
                    }}
                  >
                    {isCentre ? (
                      <button
                        onClick={() => speak(node.character)}
                        className={`flex h-full w-full flex-col items-center justify-center rounded-2xl font-bold ${ring}`}
                      >
                        <span className="font-japanese text-5xl leading-none">{node.character}</span>
                        <span className="mt-1 max-w-[92px] truncate px-1 text-[9px] opacity-80">
                          {node.meaning}
                        </span>
                      </button>
                    ) : node.kind === "kanji" ? (
                      <Link
                        href={`/kanji/${encodeURIComponent(node.character)}`}
                        className={`flex h-full w-full flex-col items-center justify-center rounded-2xl ${ring}`}
                      >
                        <span className="font-japanese text-2xl font-bold leading-none">
                          {node.character}
                        </span>
                        <span className="mt-0.5 max-w-[58px] truncate px-1 text-[8px] text-slate-500">
                          {node.meaning}
                        </span>
                        {node.jlptLevel && (
                          <span className="mt-0.5 rounded bg-emerald-50 px-1 text-[7px] font-bold text-emerald-700">
                            {node.jlptLevel}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <button
                        onClick={() => speak(node.label)}
                        title={`${node.label} — ${node.meaning} (${node.role})`}
                        className={`flex h-full w-full flex-col items-center justify-center rounded-2xl ${ring}`}
                      >
                        <span className="font-japanese text-2xl font-bold leading-none">
                          {node.character}
                        </span>
                        <span className="mt-0.5 max-w-[58px] truncate px-1 text-[8px] text-slate-500">
                          {node.meaning}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Composition legend with roles */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              How {kanji.character} is built
            </span>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profile.map((p) => {
                const meta = ROLE_META[p.role] ?? ROLE_META.structural;
                return (
                  <div
                    key={p.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                      <span className="font-japanese text-2xl font-bold text-slate-900">
                        {p.renderedAs}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-japanese text-sm font-bold text-slate-900">
                          {p.element?.character ?? p.renderedAs}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${meta.tone}`}>
                          {meta.label}
                        </span>
                        {p.position && (
                          <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 ring-1 ring-slate-200">
                            {p.position}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-600">
                        {p.element?.meaning ?? "component"}
                        {p.element?.readingOn ? ` · ${p.element.readingOn}` : ""}
                        {p.element?.strokeCount ? ` · ${p.element.strokeCount} strokes` : ""}
                      </p>
                      <p className="text-[9px] italic text-slate-400">{meta.hint}</p>
                      {p.element?.mnemonic && (
                        <p className="mt-1 text-[9px] italic leading-snug text-slate-500">
                          {p.element.mnemonic}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Family list */}
        {tree.rings.find((r) => r.depth === 2) && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Network className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">
                Kanji family ({tree.stats.familySize})
              </h2>
              <span className="text-[10px] text-slate-400">
                shares at least one component with {kanji.character}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(tree.rings.find((r) => r.depth === 2)?.nodes ?? []).map((n) => (
                <Link
                  key={n.id}
                  href={`/kanji/${encodeURIComponent(n.character)}`}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 transition-all hover:border-emerald-400 hover:bg-emerald-50"
                >
                  <span className="font-japanese text-2xl font-bold text-slate-900">{n.character}</span>
                  <span className="text-[10px] text-slate-600">{n.meaning}</span>
                  {n.jlptLevel && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                      {n.jlptLevel}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/kana"
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <Layers className="h-3.5 w-3.5" /> Back to kana chart
          </Link>
        </div>
      </div>
    </main>
  );
}
