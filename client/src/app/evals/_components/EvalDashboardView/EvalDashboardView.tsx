/* /evals — Eval Dashboard (spec 13, R8).

   One row per agent with the metrics of its LATEST run, plus the workspace's
   recent runs. An agent that has never been evaluated reads "never run", not
   0.00: a zero and an absence are different claims, and reporting the first
   for the second is how a dashboard starts lying. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import type { EvalAgentSummary } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useEvalDashboard } from "../../../../lib/hooks/evals";
import { s } from "./styles";

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 100)}%`);

export function EvalDashboardView() {
  const router = useRouter();
  const t = useTranslations("eval");
  const { data, isLoading, isError, error } = useEvalDashboard();

  return (
    <AppShell
      crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}
    >
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("dashboard.title")}</h1>
          <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
        </div>

        {isError ? (
          <ErrorState title={t("dashboard.loadFailed")} body={String(error)} />
        ) : isLoading ? (
          <Skeleton height={180} />
        ) : (data?.agents.length ?? 0) === 0 ? (
          <EmptyState icon="Cpu" title={t("dashboard.noAgents")} />
        ) : (
          <div style={s.card}>
            <div style={s.headRow}>
              <div>{t("dashboard.agentsTable.agent")}</div>
              <div style={s.num}>{t("dashboard.agentsTable.cases")}</div>
              <div style={s.num}>{t("dashboard.agentsTable.recall")}</div>
              <div style={s.num}>{t("dashboard.agentsTable.precision")}</div>
              <div style={s.num}>{t("dashboard.agentsTable.citation")}</div>
              <div style={s.num}>{t("dashboard.agentsTable.passed")}</div>
              <div>{t("dashboard.agentsTable.lastRun")}</div>
            </div>
            {data!.agents.map((a, i) => (
              <AgentRow
                key={a.agent_id}
                a={a}
                last={i === data!.agents.length - 1}
                onOpen={() => router.push(`/evals/${a.agent_id}`)}
              />
            ))}
          </div>
        )}

        <div style={s.sectionHead}>
          <span style={s.sectionLabel}>{t("dashboard.recentRuns")}</span>
        </div>
        {(data?.recent_runs.length ?? 0) === 0 ? (
          <div style={s.emptyRuns}>
            <Icon.History size={15} style={s.emptyIcon} />
            <div>
              <div>{t("dashboard.noRuns")}</div>
              <div style={s.emptyNote}>{t("dashboard.runsPending")}</div>
            </div>
          </div>
        ) : (
          <div style={s.card}>
            <div style={s.runHeadRow}>
              <div>{t("dashboard.table.ranAt")}</div>
              <div>{t("dashboard.table.recall")}</div>
              <div>{t("dashboard.table.precision")}</div>
              <div>{t("dashboard.table.citation")}</div>
              <div>{t("dashboard.table.pass")}</div>
              <div>{t("dashboard.table.cost")}</div>
            </div>
            {data!.recent_runs.map((r) => (
              <div key={r.id} style={s.runRow}>
                <div style={s.mono}>{new Date(r.ran_at).toLocaleString()}</div>
                <div style={s.num}>{pct(r.recall) ?? "—"}</div>
                <div style={s.num}>{pct(r.precision) ?? "—"}</div>
                <div style={s.num}>{pct(r.citation_accuracy) ?? "—"}</div>
                <div>
                  {r.pass === null ? (
                    "—"
                  ) : r.pass ? (
                    <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                      {t("dashboard.pass")}
                    </Badge>
                  ) : (
                    <Badge color="var(--crit)" bg="var(--crit-bg)" icon="X">
                      {t("dashboard.fail")}
                    </Badge>
                  )}
                </div>
                <div style={s.num}>{r.cost_usd === null ? "—" : `$${r.cost_usd.toFixed(2)}`}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({
  a,
  last,
  onOpen,
}: {
  a: EvalAgentSummary;
  last: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("eval");
  const neverRun = a.last_run_at === null;
  return (
    // The row IS the way into the agent's dashboard — its metric cards, trend
    // and run comparison live there and are reachable from nowhere else.
    <div
      style={s.row(last)}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
    >
      <div style={s.agentCell}>
        <Icon.Cpu size={13} style={s.agentIcon} />
        {a.agent_name ?? a.agent_id.slice(0, 8)}
      </div>
      <div style={s.num}>{a.cases_total === 0 ? t("dashboard.noCases") : a.cases_total}</div>
      {neverRun ? (
        // One "never run" spanning the metric columns, rather than four dashes
        // that read like four measured zeros.
        <div style={s.neverRun}>{t("dashboard.neverRun")}</div>
      ) : (
        <>
          <div style={s.num}>{pct(a.recall)}</div>
          <div style={s.num}>{pct(a.precision)}</div>
          <div style={s.num}>{pct(a.citation_accuracy)}</div>
          <div style={s.num}>{`${a.passed}/${a.total}`}</div>
        </>
      )}
      <div style={s.mono}>{neverRun ? "—" : new Date(a.last_run_at!).toLocaleString()}</div>
      <Icon.ChevronRight size={14} style={s.chevron} />
    </div>
  );
}
