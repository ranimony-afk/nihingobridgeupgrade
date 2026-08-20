"use client";

import { useEffect, useRef } from "react";
import type { MindNode } from "@/lib/kanji/tree";

export function KanjiRadial({
  data,
  onSelect,
}: {
  data: MindNode;
  onSelect: (character: string) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    void import("d3").then((d3: typeof import("d3")) => {
      if (cancelled || !ref.current) return;
      const svg = d3.select(ref.current);
      svg.selectAll("*").remove();
      const width = 720;
      const height = 720;
      const rootG = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
      const root = d3.hierarchy(data);
      d3.tree().size([2 * Math.PI, 260])(root);

      rootG
        .selectAll("path.link")
        .data(root.links())
        .join("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#38bdf8")
        .attr("stroke-opacity", 0.55)
        .attr("d", (link: { source: { x: number; y: number }; target: { x: number; y: number } }) =>
          d3.linkRadial()
            .angle((node: { x: number }) => node.x)
            .radius((node: { y: number }) => node.y)(link),
        );

      const node = rootG
        .selectAll("g.node")
        .data(root.descendants())
        .join("g")
        .attr("class", "node")
        .attr("transform", (d: { x: number; y: number }) => `rotate(${(d.x * 180) / Math.PI - 90}) translate(${d.y},0)`);

      node
        .append("circle")
        .attr("r", (d: { data: MindNode }) => (d.data.character ? 16 : 10))
        .attr("fill", (d: { data: MindNode }) => (d.data.character ? "#14532d" : "#1e293b"))
        .attr("stroke", "#86efac")
        .style("cursor", "pointer")
        .on("click", (_event: unknown, d: { data: MindNode }) => {
          if (d.data.character) onSelect(d.data.character);
        });

      node
        .append("text")
        .attr("dy", "0.32em")
        .attr("x", (d: { x: number }) => (d.x < Math.PI ? 22 : -22))
        .attr("text-anchor", (d: { x: number }) => (d.x < Math.PI ? "start" : "end"))
        .attr("transform", (d: { x: number }) => (d.x >= Math.PI ? "rotate(180)" : ""))
        .attr("fill", "white")
        .style("font-size", "14px")
        .style("font-weight", "800")
        .text((d: { data: MindNode }) => d.data.name);

      svg.call(
        d3.zoom().scaleExtent([0.4, 5]).on("zoom", (event: { transform: { toString: () => string } }) => {
          rootG.attr("transform", event.transform.toString());
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [data, onSelect]);

  return <svg ref={ref} viewBox="0 0 720 720" className="h-[min(82vh,740px)] w-full rounded-[32px] bg-[#0f172a]" />;
}
