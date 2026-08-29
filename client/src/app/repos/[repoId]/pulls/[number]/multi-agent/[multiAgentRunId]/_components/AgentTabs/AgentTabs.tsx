/* AgentTabs — one tab per agent, full FindingCards + accept/dismiss (R5/R6).
   design-mocks/src/19-screen_multiagent.jsx:67-90. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { CircularScore, Icon, MonoLink } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord, RunSummary } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { s } from "./styles";

export interface AgentTabEntry {
  run: RunSummary;
  findings: FindingRecord[];
  color: string;
}

export function AgentTabs({
  entries,
  prId,
  multiAgentRunId,
  repoFullName,
  onViewTrace,
}: {
  entries: AgentTabEntry[];
  prId: string;
  multiAgentRunId: string;
  repoFullName?: string | null;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const qc = useQueryClient();
  const action = useFindingAction();
  const [selected, setSelected] = React.useState(0);
  const entry = entries[Math.min(selected, entries.length - 1)];

  function act(findingId: string, kind: FindingActionKind) {
    action.mutate(
      { findingId, action: kind, prId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["multi-agent-run", prId, multiAgentRunId] });
        },
      },
    );
  }

  if (!entry) return null;
  const { run, findings, color } = entry;
  const scoreColor = (run.score ?? 0) >= 70 ? "var(--ok)" : (run.score ?? 0) >= 50 ? "var(--warn)" : "var(--crit)";

  return (
    <div>
      <div style={s.bar}>
        {entries.map((e, i) => {
          const active = i === selected;
          return (
            <button key={e.run.run_id} onClick={() => setSelected(i)} style={s.tab(active, e.color)}>
              <Icon.Cpu size={15} style={{ color: active ? e.color : "var(--text-muted)" }} />
              <span style={s.tabName(active)}>{e.run.agent_name ?? e.run.agent_id ?? "—"}</span>
              <span
                className="tnum"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color:
                    (e.run.score ?? 0) >= 70 ? "var(--ok)" : (e.run.score ?? 0) >= 50 ? "var(--warn)" : "var(--crit)",
                }}
              >
                {e.run.score ?? "—"}
              </span>
            </button>
          );
        })}
      </div>

      <div style={s.body}>
        {run.status === "failed" ? (
          <div style={s.errorBanner}>{run.error ?? "Run failed."}</div>
        ) : (
          <div style={s.banner(color)}>
            <CircularScore score={run.score ?? 0} size={44} />
            <div>
              <div style={s.bannerName(scoreColor)}>{run.agent_name ?? run.agent_id ?? "—"}</div>
              <p style={s.bannerSummary}>{t("tabs.noSummary")}</p>
            </div>
            <div style={s.bannerAside}>
              <MonoLink onClick={() => onViewTrace(run.run_id)}>{t("viewTrace")}</MonoLink>
              <span className="mono tnum" style={s.bannerMeta}>
                {run.duration_ms != null ? (run.duration_ms / 1000).toFixed(1) : "—"}s · $
                {run.cost_usd != null ? run.cost_usd.toFixed(2) : "—"}
              </span>
            </div>
          </div>
        )}

        <div style={s.findingsList}>
          {findings.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              defaultExpanded={i === 0}
              repoFullName={repoFullName}
              headSha={run.head_sha}
              agentId={run.agent_id}
              pending={action.isPending}
              onAction={(kind) => act(f.id, kind)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
