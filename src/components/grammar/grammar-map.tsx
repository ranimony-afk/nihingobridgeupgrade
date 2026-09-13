"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { GrammarPointSummary } from "@/types/grammar";

interface GraphEdge {
  from: string;
  to: string;
  relation: string;
}

interface GraphNode {
  id: number;
  slug: string;
  title: string;
  jlptLevel: number | null;
  depth: number;
}

const RELATION_COLORS: Record<string, string> = {
  prerequisite: "#6366f1",
  similar: "#10b981",
  contrast: "#f43f5e",
  related: "#94a3b8",
  variant: "#f59e0b",
};

const WIDTH = 760;
const HEIGHT = 620;

/**
 * Grammar relation map.
 *
 * Nodes = grammar points (ring per JLPT level), edges = `grammar_relations`
 * served by `GET /api/grammar/graph`. Layout is deterministic (rings), so the
 * map is stable between renders and needs no physics simulation.
 */
export function GrammarMap({
  initialNodes,
  initialEdges,
  initialLevel,
}: {
  initialNodes: GrammarPointSummary[];
  initialEdges: GraphEdge[];
  initialLevel: number | null;
}) {
  const [level, setLevel] = useState<number | null>(initialLevel);
  const [nodes, setNodes] = useState<GrammarPointSummary[]>(initialNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(initialEdges);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const [pointsResponse, graphResponse] = await Promise.all([
          fetch(`/api/grammar?limit=200${level ? `&jlpt=${level}` : ""}`, {
            signal: controller.signal,
          }),
          fetch(`/api/grammar/graph?limit=200${level ? `&jlpt=${level}` : ""}`, {
            signal: controller.signal,
          }),
        ]);
        if (!pointsResponse.ok || !graphResponse.ok) return;
        const pointsBody = (await pointsResponse.json()) as { data: { points: GrammarPointSummary[] } };
        const graphBody = (await graphResponse.json()) as {
          data: { nodes: GraphNode[]; edges: GraphEdge[] };
        };
        if (cancelled) return;
        setNodes(pointsBody.data.points);
        setEdges(graphBody.data.edges);
      } catch {
        /* aborted or offline — keep the previous map */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      setLoading(true);
      void run();
    }, 0);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [level]);

  const positions = useMemo(() => {
    const byLevel = new Map<number | string, GrammarPointSummary[]>();
    for (const point of nodes) {
      const key = point.jlptLevel ?? "other";
      const bucket = byLevel.get(key) ?? [];
      bucket.push(point);
      byLevel.set(key, bucket);
    }
    const rings = [...byLevel.entries()].sort((a, b) => {
      if (a[0] === "other") return 1;
      if (b[0] === "other") return -1;
      return Number(b[0]) - Number(a[0]); // N5 inner ring
    });

    const map = new Map<string, { x: number; y: number; label: string; level: number | null }>();
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;

    rings.forEach(([levelKey, points], ringIndex) => {
      const radius = 90 + ringIndex * 105;
      points.forEach((point, index) => {
        const angle = (index / Math.max(points.length, 1)) * Math.PI * 2 - Math.PI / 2;
        map.set(point.slug, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius * 0.82,
          label: point.patterns[0] ?? point.title,
          level: point.jlptLevel,
        });
      });
    });
    return { map, rings: rings.map(([key]) => key) };
  }, [nodes]);

  const neighbours = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (const edge of edges) {
      if (edge.from === selected) set.add(edge.to);
      if (edge.to === selected) set.add(edge.from);
    }
    return set;
  }, [edges, selected]);

  const selectedPoint = nodes.find((point) => point.slug === selected) ?? null;
  const selectedEdges = selected
    ? edges.filter((edge) => edge.from === selected || edge.to === selected)
    : [];

  return (
    <div className="space-y-4" data-testid="grammar-map">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[5, 4, 3, 2, 1].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLevel(level === value ? null : value)}
            className={`rounded-full border px-3 py-1 transition ${
              level === value
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            }`}
          >
            N{value}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setLevel(null)}
          className={`rounded-full border px-3 py-1 transition ${
            level === null
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
          }`}
        >
          All levels
        </button>
        <span className="ml-auto text-slate-400">
          {nodes.length} nodes · {edges.length} edges {loading ? "· loading…" : ""}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="thin-scroll overflow-auto rounded-3xl border border-slate-200 bg-white p-3">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[560px] w-full" role="img" aria-label="Grammar relation map">
            {[0, 1, 2, 3].map((ring) => (
              <circle
                key={ring}
                cx={WIDTH / 2}
                cy={HEIGHT / 2}
                r={90 + ring * 105}
                fill="none"
                stroke="#e2e8f0"
                strokeDasharray="3 6"
              />
            ))}

            {edges.map((edge, index) => {
              const from = positions.map.get(edge.from);
              const to = positions.map.get(edge.to);
              if (!from || !to) return null;
              const active = selected === edge.from || selected === edge.to;
              return (
                <line
                  key={`${edge.from}-${edge.to}-${edge.relation}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={RELATION_COLORS[edge.relation] ?? "#94a3b8"}
                  strokeWidth={active ? 2.2 : 1}
                  strokeOpacity={selected ? (active ? 0.85 : 0.12) : 0.35}
                />
              );
            })}

            {[...positions.map.entries()].map(([slug, position]) => {
              const isSelected = slug === selected;
              const isNeighbour = neighbours.has(slug);
              const dim = selected !== null && !isSelected && !isNeighbour;
              return (
                <g
                  key={slug}
                  onClick={() => setSelected(isSelected ? null : slug)}
                  className="cursor-pointer"
                  opacity={dim ? 0.35 : 1}
                >
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={isSelected ? 20 : 15}
                    fill={isSelected ? "#4f46e5" : "#ffffff"}
                    stroke={isSelected ? "#312e81" : "#cbd5e1"}
                    strokeWidth={2}
                  />
                  <text
                    x={position.x}
                    y={position.y + 4}
                    textAnchor="middle"
                    fontSize={isSelected ? 12 : 11}
                    fill={isSelected ? "#ffffff" : "#0f172a"}
                  >
                    {position.label.replace(/^〜/, "").slice(0, 5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5">
          {selectedPoint ? (
            <div>
              <p className="jp text-2xl text-slate-900">{selectedPoint.title}</p>
              {selectedPoint.titleEn ? (
                <p className="mt-1 text-sm font-medium text-slate-700">{selectedPoint.titleEn}</p>
              ) : null}
              {selectedPoint.summary ? (
                <p className="mt-2 text-xs text-slate-600">{selectedPoint.summary}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-1">
                {selectedPoint.patterns.map((pattern) => (
                  <span
                    key={pattern}
                    className="jp rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
                  >
                    {pattern}
                  </span>
                ))}
              </div>

              <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Relations ({selectedEdges.length})
              </h3>
              <ul className="mt-2 space-y-1 text-xs">
                {selectedEdges.map((edge, index) => {
                  const other = edge.from === selected ? edge.to : edge.from;
                  return (
                    <li key={`${other}-${index}`} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: RELATION_COLORS[edge.relation] ?? "#94a3b8" }}
                      />
                      <button
                        type="button"
                        onClick={() => setSelected(other)}
                        className="truncate text-slate-700 hover:text-indigo-700 hover:underline"
                      >
                        {other}
                      </button>
                      <span className="ml-auto text-[10px] text-slate-400">{edge.relation}</span>
                    </li>
                  );
                })}
              </ul>

              <Link
                href={`/grammar/${encodeURIComponent(selectedPoint.slug)}`}
                className="mt-4 inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-900"
              >
                Open grammar point →
              </Link>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              <p className="font-medium text-slate-700">Grammar map</p>
              <p className="mt-2">
                Each ring is a JLPT level (N5 innermost). Click a node to see its patterns and
                relations — the edges come straight from <code>grammar_relations</code>.
              </p>
              <ul className="mt-3 space-y-1">
                {Object.entries(RELATION_COLORS).map(([relation, color]) => (
                  <li key={relation} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {relation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
