/* BlastGraph — the impact map as a picture: each changed symbol at the centre
   of a ring of its callers and endpoints.

   Inline SVG rather than a graph library: the layout is deterministic and
   already computed in helpers.ts, so all that is left is drawing, and a
   dependency would cost more than the forty lines below. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { GRAPH_COLOR, GRAPH_HEIGHT, GRAPH_WIDTH } from "./constants";
import { layout } from "./helpers";
import { s, legendDot } from "./styles";

export function BlastGraph({ blast }: { blast: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges } = React.useMemo(() => layout(blast), [blast]);
  const byId = React.useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (nodes.length === 0) return <p style={s.empty}>{t("graph.empty")}</p>;

  return (
    <>
      <div style={s.graphWrap}>
        <svg
          role="img"
          aria-label={t("graph.ariaLabel")}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          style={{ width: "100%", minWidth: 480, height: "auto", display: "block" }}
        >
          {edges.map((e) => {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${e.from}->${e.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--border)"
                strokeWidth={1}
              />
            );
          })}
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={n.kind === "changed" ? 9 : 5} fill={GRAPH_COLOR[n.kind]} />
              <text
                x={n.x}
                y={n.y + (n.kind === "changed" ? 24 : 17)}
                textAnchor="middle"
                fontSize={n.kind === "changed" ? 12 : 10}
                fill={n.kind === "changed" ? "var(--text-primary)" : "var(--text-muted)"}
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={s.legend}>
        <span style={s.legendItem}>
          <i style={legendDot(GRAPH_COLOR.changed)} /> {t("legend.changed")}
        </span>
        <span style={s.legendItem}>
          <i style={legendDot(GRAPH_COLOR.caller)} /> {t("legend.caller")}
        </span>
        <span style={s.legendItem}>
          <i style={legendDot(GRAPH_COLOR.endpoint)} /> {t("legend.endpoint")}
        </span>
      </div>
    </>
  );
}
