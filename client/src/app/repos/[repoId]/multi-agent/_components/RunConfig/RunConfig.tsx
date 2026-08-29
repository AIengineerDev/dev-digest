/* RunConfig — pick a PR, pick agents, see the price first (R8/R9).
   design-mocks/src/19-screen_multiagent.jsx:93-149. Container is the design's
   own 720px frame, narrower than the results view on purpose. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon, type DropdownItemDef } from "@devdigest/ui";
import type { Agent, AgentEstimate, PrMeta } from "@devdigest/shared";
import { colorForIndex } from "@/lib/agent-colors";
import { estimateFor } from "../../helpers";
import { PersonaPickCard } from "../PersonaPickCard";
import { s } from "./styles";

export function RunConfig({
  prs,
  selectedPr,
  onSelectPr,
  agents,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
  estimates,
  running,
  onRun,
}: {
  prs: PrMeta[];
  selectedPr: PrMeta | null;
  onSelectPr: (number: number) => void;
  agents: Agent[];
  selected: Set<string>;
  onToggle: (agentId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  estimates: AgentEstimate[];
  running: boolean;
  onRun: () => void;
}) {
  const t = useTranslations("runs");
  const hasPr = selectedPr != null;
  const allOn = agents.length > 0 && selected.size === agents.length;
  const n = selected.size;

  const prItems: DropdownItemDef[] = prs.map((p) => ({
    label: `#${p.number} · ${p.title}`,
    icon: "GitPullRequest" as const,
    onClick: () => onSelectPr(p.number),
  }));

  const { totalTimeS, totalCostUsd, anyHistory } = estimateFor([...selected], estimates);

  return (
    <div style={s.container}>
      <h1 style={s.h1}>{t("page.config.heading")}</h1>
      <p style={s.lead}>{t("page.config.lead")}</p>

      {/* step 1 — PR */}
      <div style={s.stepRow}>
        <span style={s.badge(true)}>1</span>
        <span style={s.stepLabel(true)}>{t("page.config.stepPr")}</span>
      </div>
      <div style={s.stepBody}>
        <Dropdown
          width={420}
          align="left"
          items={prItems}
          trigger={
            <Button kind="secondary" icon="GitPullRequest" iconRight="ChevronDown">
              {selectedPr ? `#${selectedPr.number} · ${selectedPr.title}` : t("page.config.selectPrPlaceholder")}
            </Button>
          }
        />
      </div>

      {/* step 2 — agents (or the dashed placeholder) */}
      <div style={s.stepRow}>
        <span style={s.badge(hasPr)}>2</span>
        <span style={s.stepLabel(hasPr)}>{t("page.config.stepAgents")}</span>
        {hasPr && (
          <button style={s.selectAll} onClick={allOn ? onClearAll : onSelectAll}>
            {allOn ? t("page.config.clearAll") : t("page.config.selectAll")}
          </button>
        )}
      </div>

      {hasPr ? (
        <div style={s.agentList}>
          {agents.map((agent, i) => (
            <PersonaPickCard
              key={agent.id}
              agent={agent}
              color={colorForIndex(i)}
              selected={selected.has(agent.id)}
              estimate={estimates.find((e) => e.agent_id === agent.id)}
              onToggle={() => onToggle(agent.id)}
            />
          ))}
        </div>
      ) : (
        <div style={s.placeholder}>
          <div style={s.placeholderIcon}>
            <Icon.GitPullRequest size={21} style={{ color: "var(--text-muted)" }} />
          </div>
          <div style={s.placeholderTitle}>{t("page.config.noPrTitle")}</div>
          <p style={s.placeholderBody}>{t("page.config.noPrBody")}</p>
        </div>
      )}

      {/* run bar */}
      <div style={s.runBar}>
        <Button kind="primary" icon="Users" disabled={!hasPr || n === 0} onClick={onRun} loading={running}>
          {n > 1
            ? t("page.config.runN", { count: n })
            : n === 1
              ? t("page.config.runOne")
              : t("page.config.selectAgents")}
        </Button>
        {hasPr && n > 0 && anyHistory && (
          <span className="mono" style={s.estimate}>
            {t("page.config.estimate", { time: totalTimeS.toFixed(1), cost: `$${totalCostUsd.toFixed(2)}` })}
          </span>
        )}
      </div>
    </div>
  );
}
