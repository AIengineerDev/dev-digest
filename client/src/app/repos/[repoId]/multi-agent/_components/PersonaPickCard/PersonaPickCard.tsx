/* PersonaPickCard — one card per enabled agent in the Configure run picker (R8/R9).
   design-mocks/src/19-screen_multiagent.jsx:93-105. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent, AgentEstimate } from "@devdigest/shared";
import { s } from "./styles";

export function PersonaPickCard({
  agent,
  color,
  selected,
  estimate,
  onToggle,
}: {
  agent: Agent;
  color: string;
  selected: boolean;
  /** Undefined/null median fields render `no estimate yet` — never `~0s · $0.00`. */
  estimate?: AgentEstimate;
  onToggle: () => void;
}) {
  const t = useTranslations("runs");
  const hasEstimate = estimate?.median_duration_ms != null && estimate?.median_cost_usd != null;

  return (
    <button onClick={onToggle} style={s.card(color, selected)}>
      <span style={s.checkbox(color, selected)}>{selected && <Icon.Check size={12} style={{ color: "#fff" }} />}</span>
      <span style={s.iconTile(color)}>
        <Icon.Cpu size={16} />
      </span>
      <span style={s.body}>
        <div style={s.name}>{agent.name}</div>
        <div style={s.summary}>{agent.description}</div>
      </span>
      <span className="mono" style={s.estimate}>
        {hasEstimate
          ? `${(estimate!.median_duration_ms! / 1000).toFixed(1)}s · $${estimate!.median_cost_usd!.toFixed(2)}`
          : t("page.config.noEstimateYet")}
      </span>
    </button>
  );
}
