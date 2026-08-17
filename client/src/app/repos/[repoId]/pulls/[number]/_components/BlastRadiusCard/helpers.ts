/** Pure derivations behind BlastRadiusCard. No React, no fetching. */

import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { GRAPH_HEIGHT, GRAPH_ORBIT, GRAPH_WIDTH } from "./constants";

export interface BlastTotals {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * The three numbers in the card header.
 *
 * Callers are counted as *rows*, endpoints and crons as a **deduplicated set**:
 * two symbols reaching `POST /webhooks` is one endpoint at risk, not two, and
 * summing would inflate the scariest number on the card. Callers are not
 * deduplicated, because the same function calling two changed symbols really is
 * two things to check.
 */
export function totals(blast: BlastRadius): BlastTotals {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** True when the index found nothing to say — the card renders its empty state
 *  rather than a row of zeros, which reads as a measurement. */
export function isEmpty(blast: BlastRadius): boolean {
  return blast.changed_symbols.length === 0 && blast.downstream.length === 0;
}

/** File name without its directory, for a caller row that has no room for the path. */
export function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

// ---- graph ---------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  kind: "changed" | "caller" | "endpoint";
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Deterministic radial layout: changed symbols spread along the horizontal
 * midline, their callers and endpoints on a ring around each.
 *
 * Deliberately not a force simulation. A force layout settles somewhere
 * different on every open, which makes the picture impossible to talk about
 * ("the node on the left" stops meaning anything) and would need a random seed
 * — and randomness is exactly what a reviewer comparing two runs cannot have.
 */
export function layout(blast: BlastRadius): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const withImpact = blast.downstream.filter(
    (d) => d.callers.length > 0 || d.endpoints_affected.length > 0,
  );
  const roots: DownstreamImpact[] = withImpact.length > 0 ? withImpact : blast.downstream;
  if (roots.length === 0) return { nodes, edges };

  const columnWidth = GRAPH_WIDTH / roots.length;

  roots.forEach((d, i) => {
    const cx = columnWidth * (i + 0.5);
    const cy = GRAPH_HEIGHT / 2;
    const rootId = `s:${d.symbol}`;
    nodes.push({ id: rootId, label: d.symbol, kind: "changed", x: cx, y: cy });

    const satellites = [
      ...d.callers.map((c) => ({ id: `c:${d.symbol}:${c.file}:${c.line}`, label: c.name, kind: "caller" as const })),
      ...d.endpoints_affected.map((e) => ({ id: `e:${d.symbol}:${e}`, label: e, kind: "endpoint" as const })),
    ];

    satellites.forEach((sat, j) => {
      // Start at -90° so the first satellite sits above its root rather than
      // to its right, where the next column's label would collide with it.
      const angle = (2 * Math.PI * j) / satellites.length - Math.PI / 2;
      // Keep the orbit inside its column so neighbouring clusters never overlap.
      const orbit = Math.min(GRAPH_ORBIT, columnWidth / 2 - 24);
      nodes.push({
        ...sat,
        x: cx + orbit * Math.cos(angle),
        y: cy + orbit * Math.sin(angle),
      });
      edges.push({ from: rootId, to: sat.id });
    });
  });

  return { nodes, edges };
}
