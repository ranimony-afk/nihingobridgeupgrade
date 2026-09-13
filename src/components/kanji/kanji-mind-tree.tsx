"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { MindTree, MindTreeNode, MindTreeNodeKind } from "@/types/knowledge";

const COL = 232;
const GAP = 14;

const NODE_HEIGHT: Record<MindTreeNodeKind, number> = {
  kanji: 92,
  radical: 78,
  component: 78,
  vocabulary: 84,
};

const KIND_STYLE: Record<
  MindTreeNodeKind,
  { ring: string; chip: string; label: string; dot: string; stroke: string }
> = {
  kanji: {
    ring: "border-indigo-300 bg-indigo-50/90 hover:border-indigo-500",
    chip: "bg-indigo-100 text-indigo-700",
    label: "kanji",
    dot: "bg-indigo-500",
    stroke: "#6366f1",
  },
  radical: {
    ring: "border-amber-300 bg-amber-50/90 hover:border-amber-500",
    chip: "bg-amber-100 text-amber-700",
    label: "radical",
    dot: "bg-amber-500",
    stroke: "#f59e0b",
  },
  component: {
    ring: "border-emerald-300 bg-emerald-50/90 hover:border-emerald-500",
    chip: "bg-emerald-100 text-emerald-700",
    label: "component",
    dot: "bg-emerald-500",
    stroke: "#10b981",
  },
  vocabulary: {
    ring: "border-rose-300 bg-rose-50/90 hover:border-rose-500",
    chip: "bg-rose-100 text-rose-700",
    label: "vocabulary",
    dot: "bg-rose-500",
    stroke: "#f43f5e",
  },
};

type BranchKey = "radical" | "component" | "vocabulary" | "derived";

const BRANCHES: Array<{ key: BranchKey; label: string; kinds: MindTreeNodeKind[] }> = [
  { key: "radical", label: "Radicals", kinds: ["radical"] },
  { key: "component", label: "Components", kinds: ["component"] },
  { key: "vocabulary", label: "Vocabulary", kinds: ["vocabulary"] },
  { key: "derived", label: "Used in", kinds: ["kanji"] },
];

interface Placed {
  node: MindTreeNode;
  depth: number;
  x: number;
  y: number;
}

export function KanjiMindTree({ literal, initialTree }: { literal: string; initialTree: MindTree }) {
  const [tree, setTree] = useState<MindTree>(initialTree);
  const [depth, setDepth] = useState(initialTree.depth);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<BranchKey>>(new Set());
  const [vocabularyLimit, setVocabularyLimit] = useState(12);

  const load = useCallback(
    async (nextDepth: number, nextVocabulary: number) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/kanji/${encodeURIComponent(literal)}/mind-tree?depth=${nextDepth}&vocabulary=${nextVocabulary}&derivatives=8`,
        );
        if (response.ok) {
          const data = (await response.json()) as MindTree;
          setTree(data);
          setCollapsed(new Set());
        }
      } finally {
        setLoading(false);
      }
    },
    [literal],
  );

  // The page mounts this component with `key={literal}`, so a new kanji always
  // produces a fresh instance and the server-rendered tree is the initial state.

  const childrenMap = useMemo(() => {
    const map = new Map<string, MindTreeNode[]>();
    for (const node of tree.nodes) {
      if (!node.parent) continue;
      const bucket = map.get(node.parent) ?? [];
      bucket.push(node);
      map.set(node.parent, bucket);
    }
    return map;
  }, [tree]);

  const visibleNodes = useMemo(() => {
    const keep = (node: MindTreeNode): boolean => {
      if (node.depth === 0) return true;
      const branch = BRANCHES.find((item) => item.kinds.includes(node.kind));
      if (!branch) return true;
      return !hidden.has(branch.key);
    };
    const accepted = new Set<string>();
    const visit = (node: MindTreeNode) => {
      accepted.add(node.key);
      if (collapsed.has(node.key)) return;
      for (const child of childrenMap.get(node.key) ?? []) {
        if (keep(child)) visit(child);
      }
    };
    const root = tree.nodes.find((node) => node.depth === 0);
    if (root) visit(root);
    return accepted;
  }, [tree, childrenMap, hidden, collapsed]);

  const layout = useMemo(() => {
    const placed: Placed[] = [];
    const root = tree.nodes.find((node) => node.depth === 0);
    if (!root) return { placed, width: 0, height: 0 };

    let cursor = 0;
    const walk = (node: MindTreeNode, depth: number): Placed => {
      const kids = (childrenMap.get(node.key) ?? []).filter((child) => visibleNodes.has(child.key));
      const placedChildren = kids.map((child) => walk(child, depth + 1));
      const height = NODE_HEIGHT[node.kind];
      let y: number;
      if (placedChildren.length === 0) {
        y = cursor + height / 2;
        cursor += height + GAP;
      } else {
        y = (placedChildren[0].y + placedChildren[placedChildren.length - 1].y) / 2;
      }
      const entry: Placed = { node, depth, x: depth * COL, y };
      placed.push(entry);
      return entry;
    };
    walk(root, 0);

    const width = Math.max(...placed.map((item) => item.x)) + 260;
    const height = Math.max(...placed.map((item) => item.y + NODE_HEIGHT[item.node.kind] / 2)) + 40;
    return { placed, width, height };
  }, [tree, childrenMap, visibleNodes]);

  const positions = useMemo(() => {
    const map = new Map<string, Placed>();
    for (const item of layout.placed) map.set(item.node.key, item);
    return map;
  }, [layout]);

  const edges = useMemo(
    () =>
      tree.edges
        .map((edge) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + (from.depth === 0 ? 128 : 156);
          const y1 = from.y;
          const x2 = to.x;
          const y2 = to.y;
          const mid = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
          return { key: `${edge.from}->${edge.to}`, d, stroke: KIND_STYLE[to.node.kind].stroke };
        })
        .filter((edge): edge is { key: string; d: string; stroke: string } => edge !== null),
    [tree.edges, positions],
  );

  const selected = useMemo(
    () => tree.nodes.find((node) => node.key === selectedKey) ?? null,
    [tree.nodes, selectedKey],
  );

  const toggleCollapse = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBranch = (key: BranchKey) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Kanji Mind Tree</h2>
          <p className="text-xs text-slate-500">
            Generated from database relationships · {tree.nodes.length} nodes · depth {tree.depth}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => {
                setDepth(level);
                void load(level, vocabularyLimit);
              }}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                depth === level
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              depth {level}
            </button>
          ))}
          <select
            value={vocabularyLimit}
            onChange={(event) => {
              const value = Number(event.target.value);
              setVocabularyLimit(value);
              void load(depth, value);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            aria-label="Vocabulary nodes"
          >
            {[6, 12, 24, 36].map((value) => (
              <option key={value} value={value}>
                {value} words
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
        {BRANCHES.map((branch) => {
          const count =
            branch.key === "radical"
              ? tree.counts.radicals
              : branch.key === "component"
                ? tree.counts.components
                : branch.key === "vocabulary"
                  ? tree.counts.vocabulary
                  : tree.nodes.filter((node) => node.relation === "used-in").length;
          const active = !hidden.has(branch.key);
          return (
            <button
              key={branch.key}
              type="button"
              onClick={() => toggleBranch(branch.key)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? "border-slate-300 bg-white text-slate-800"
                  : "border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${active ? KIND_STYLE[branch.kinds[0]].dot : "bg-slate-300"}`}
              />
              {branch.label}
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{count}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCollapsed(new Set());
            setHidden(new Set());
            setSelectedKey(null);
          }}
          className="ml-auto rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
        >
          Reset view
        </button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="thin-scroll relative overflow-auto bg-slate-50/60 p-4" style={{ maxHeight: 760 }}>
          <div className="mind-canvas relative rounded-2xl" style={{ width: layout.width, height: Math.max(layout.height, 320) }}>
            <svg
              className="pointer-events-none absolute inset-0"
              width={layout.width}
              height={Math.max(layout.height, 320)}
              aria-hidden
            >
              {edges.map((edge) => (
                <path
                  key={edge.key}
                  d={edge.d}
                  fill="none"
                  stroke={edge.stroke}
                  strokeWidth={1.6}
                  strokeOpacity={0.55}
                />
              ))}
            </svg>

            {layout.placed.map(({ node, depth: nodeDepth, x, y }) => {
              const style = KIND_STYLE[node.kind];
              const hasChildren = (childrenMap.get(node.key) ?? []).length > 0;
              const isCollapsed = collapsed.has(node.key);
              const isSelected = selectedKey === node.key;
              const width = nodeDepth === 0 ? 128 : 156;
              return (
                <div
                  key={node.key}
                  className="absolute"
                  style={{ left: x, top: y, transform: "translateY(-50%)", width }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedKey(node.key)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left shadow-sm transition ${style.ring} ${
                      isSelected ? "ring-2 ring-slate-900/70" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`jp-glyph ${nodeDepth === 0 ? "text-4xl" : "text-2xl"} text-slate-900`}
                      >
                        {node.label}
                      </span>
                      {hasChildren ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCollapse(node.key);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.stopPropagation();
                              toggleCollapse(node.key);
                            }
                          }}
                          className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-[11px] text-slate-600"
                        >
                          {isCollapsed ? "+" : "−"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-[11px] font-medium text-slate-600">
                      {node.meanings.slice(0, 2).join(", ") || node.subLabel || style.label}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-slate-400">
                      {node.subLabel ?? style.label}
                    </div>
                  </button>
                </div>
              );
            })}
            {loading ? (
              <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm text-slate-500">
                Loading graph…
              </div>
            ) : null}
          </div>
        </div>

        <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
          {selected ? (
            <NodeInspector node={selected} literal={literal} />
          ) : (
            <div className="text-sm text-slate-500">
              <p className="font-medium text-slate-700">Inspector</p>
              <p className="mt-2">
                Select any node in the mind tree to inspect its radical, component or vocabulary
                data. Every value shown is read from the knowledge graph.
              </p>
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                <li>· Radicals — Kangxi + decomposition groups</li>
                <li>· Components — recursive KRADFILE decomposition</li>
                <li>· Vocabulary — JMdict entries using this kanji</li>
                <li>· Used in — kanji containing this glyph</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-3 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">Provenance</span>
        {tree.provenance.map((source) => (
          <span key={source.code} className="rounded-full bg-slate-100 px-2 py-0.5">
            {source.name}
            {source.version ? ` ${source.version}` : ""} · {source.license}
          </span>
        ))}
      </footer>
    </section>
  );
}

function NodeInspector({ node, literal }: { node: MindTreeNode; literal: string }) {
  const style = KIND_STYLE[node.kind];
  const metaEntries = Object.entries(node.meta).filter(([, value]) => value !== null && value !== "");

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`jp-glyph block text-5xl text-slate-900`}>{node.label}</span>
          {node.subLabel ? <p className="mt-1 text-sm text-slate-600">{node.subLabel}</p> : null}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.chip}`}>
          {node.kind}
        </span>
      </div>

      {node.meanings.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Meanings</p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {node.meanings.map((meaning) => (
              <li key={meaning}>· {meaning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {metaEntries.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {metaEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-50 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">{key}</dt>
              <dd className="text-slate-700">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-4 space-y-2 text-xs">
        <p className="text-slate-500">Relation to parent: {node.relation}</p>
        {node.href ? (
          <Link
            href={node.href}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:border-slate-900 hover:text-slate-900"
          >
            Open {node.kind === "vocabulary" ? "in dictionary" : `${node.kind} page`} →
          </Link>
        ) : (
          <p className="text-slate-400">
            This glyph is a radical variant without its own kanji entry.
          </p>
        )}
        {node.kind === "component" ? (
          <p className="text-slate-400">
            Increase the tree depth to decompose this component further via kanji_components.
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-[11px] text-slate-400">Root kanji: {literal}</p>
    </div>
  );
}
