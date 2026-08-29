/* AgentColumn — one card per agent in the Columns view (R5/R6).
   design-mocks/src/19-screen_multiagent.jsx:12-20,57-63. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Icon, MonoLink, SEV } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { s } from "./styles";

export function AgentColumn({
  run,
  findings,
  color,
  onViewTrace,
  onRetry,
}: {
  run: RunSummary;
  findings: FindingRecord[];
  color: string;
  onViewTrace: () => void;
  /** Retries this agent alone — the failure stays local (R6). */
  onRetry?: () => void;
}) {
  const t = useTranslations("runs");
  const durationS = run.duration_ms != null ? (run.duration_ms / 1000).toFixed(1) : "—";
  const cost = run.cost_usd != null ? run.cost_usd.toFixed(2) : "—";

  return (
    <div style={s.card(color)}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <div style={s.iconTile(color)}>
            <Icon.Cpu size={16} />
          </div>
          <div style={s.name}>{run.agent_name ?? run.agent_id ?? "—"}</div>
          <div className="mono tnum" style={s.meta}>
            {durationS}s · ${cost}
          </div>
          <CircularScore score={run.score ?? 0} size={32} stroke={3.5} />
        </div>
      </div>

      {run.status === "failed" ? (
        <div style={s.errorBox}>
          <div>{run.error ?? "Run failed."}</div>
          {onRetry && (
            <Button kind="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          )}
        </div>
      ) : (
        <div style={s.body}>
          {findings.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("column.noFindings")}</span>
          ) : (
            findings.map((f) => {
              const sev = SEV[f.severity];
              return (
                <div key={f.id} style={s.findingRow(sev.c)}>
                  <div style={s.findingTitleRow}>
                    <Icon.AlertTriangle size={12} style={{ color: sev.c, flexShrink: 0 }} />
                    <span style={s.findingTitle}>{f.title}</span>
                  </div>
                  <div className="mono" style={s.findingLoc}>
                    {f.file}:{f.start_line}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <div style={s.footer}>
        <MonoLink onClick={onViewTrace}>{t("viewTrace")}</MonoLink>
        <span style={s.footerCount}>{t("column.findingsCount", { count: findings.length })}</span>
      </div>
    </div>
  );
}
