import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { api } from "../api";
import type { GraphResponse } from "../types";

interface Props {
  patientId: string | null;
  refreshKey: number; // bump this from the parent whenever a fragment is logged
  onSelectNode?: (node: GraphResponse["nodes"][number] | null) => void;
}

const COLORS: Record<string, string> = {
  patient: "#1b2430",
  visit: "#2f6f62",
  fragment: "#8a8275",
};

// Renders the patient/visit/fragment graph with d3-force. New nodes fade and
// spring into place on each refetch, which is the "graph visibly grows when
// Hospital B logs something" demo moment described in the project notes.
export function KnowledgeGraph({ patientId, refreshKey, onSelectNode }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setData(null);
      return;
    }
    api
      .graph(patientId)
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, [patientId, refreshKey]);

  useEffect(() => {
    if (!data || !svgRef.current) return;
    setError(null);

    const width = 760;
    const height = 420;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes = data.nodes.map((n) => ({ ...n }));
    const links = data.edges.map((e) => ({ ...e }));

    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        "link",
        d3
          .forceLink(links as any)
          .id((d: any) => d.id)
          .distance((l: any) => (l.kind === "conflicts_with" ? 90 : 70))
          .strength(0.7)
      )
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(26));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: any) => (d.kind === "conflicts_with" ? "#b33a3a" : "#d8cfc0"))
      .attr("stroke-width", (d: any) => (d.kind === "conflicts_with" ? 2 : 1.4))
      .attr("stroke-dasharray", (d: any) => (d.kind === "conflicts_with" ? "4 3" : "none"));

    const node = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event, d: any) => onSelectNode?.(d))
      .call(
        d3
          .drag<any, any>()
          .on("start", (event, d) => {
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append("circle")
      .attr("r", (d: any) => (d.type === "patient" ? 16 : d.type === "visit" ? 11 : 7))
      .attr("fill", (d: any) => COLORS[d.type])
      .attr("opacity", (d: any) => (d.sensitive ? 0.55 : 1))
      .attr("stroke", (d: any) =>
        d.reviewStatus === "NEEDS_REVIEW"
          ? "#d97706"
          : d.reviewStatus === "UNDER_REVIEW"
            ? "#2563eb"
            : d.synced === false
              ? "#b8842b"
              : "none"
      )
      .attr("stroke-width", 2)
      .style("opacity", 0)
      .transition()
      .duration(500)
      .style("opacity", 1);

    node
      .append("text")
      .text((d: any) => d.label)
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 9.5)
      .attr("fill", "#5a5f6b")
      .attr("x", (d: any) => (d.type === "patient" ? 20 : 13))
      .attr("y", 3);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!patientId) {
    return <p className="text-sm text-slate-400">Select a patient to see their graph.</p>;
  }
  if (error) {
    return <p className="text-sm text-slate-400">Could not load graph: {error}</p>;
  }
  if (!data || data.nodes.length <= 1) {
    return <p className="text-sm text-slate-400">No fragments logged yet — log one from the Dashboard.</p>;
  }

  return <svg ref={svgRef} width={760} height={420} style={{ width: "100%", height: "auto" }} viewBox="0 0 760 420" />;
}
