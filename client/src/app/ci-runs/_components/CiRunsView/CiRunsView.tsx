/* /ci-runs — every agent review that ran inside someone's CI, not in the studio.

   Two honest gaps against the design mock (`design-mocks/src/23-screen_cizruns.jsx`),
   both because the data does not exist rather than because the screen is
   unfinished:

   - The mock shows a per-severity findings breakdown (CRITICAL / WARNING /
     SUGGESTION counts). `ci_runs` stores a single `findings_count`, so this
     renders the total. Splitting it would mean inventing three numbers from one.
   - The mock's filter chips (period, agent, repo, status, source) are not here.
     Filters over an endpoint that returns every row are a client-side illusion;
     they arrive with server-side filtering or not at all.

   Rows are written by the runner reporting back from CI, so every column but
   the id is nullable — a run that crashed mid-report still has a row, and a
   dash is the correct rendering of "it never said". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useCiRuns } from "../../../../lib/hooks/ci";
import { s } from "./styles";

const STATUS: Record<string, { color: string; key: string }> = {
  succeeded: { color: "var(--ok)", key: "succeeded" },
  no_findings: { color: "var(--text-secondary)", key: "noFindings" },
  failed: { color: "var(--crit)", key: "failed" },
  running: { color: "var(--warn)", key: "running" },
};

function when(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data, isLoading, isError, refetch } = useCiRuns();

  if (isLoading) {
    return (
      <AppShell>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("ciRuns.title")}</h1>
            <p style={s.subtitle}>{t("ciRuns.subtitle")}</p>
          </div>
        </div>
        <div style={s.table}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: "14px 16px" }}>
              <Skeleton height={16} />
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <div style={{ padding: "48px 28px" }}>
          <ErrorState
            title={t("ciRuns.loadError")}
            body={t("ciRuns.loadErrorBody")}
            onRetry={() => refetch()}
          />
        </div>
      </AppShell>
    );
  }

  const runs: CiRun[] = data ?? [];

  if (runs.length === 0) {
    return (
      <AppShell>
        <div style={{ padding: "48px 28px" }}>
          <EmptyState
            icon="Workflow"
            title={t("ciRuns.empty")}
            body={t("ciRuns.emptyBody")}
          />
        </div>
      </AppShell>
    );
  }

  const cols = [
    t("ciRuns.col.timestamp"),
    t("ciRuns.col.pullRequest"),
    t("ciRuns.col.agent"),
    t("ciRuns.col.source"),
    t("ciRuns.col.findings"),
    t("ciRuns.col.cost"),
    t("ciRuns.col.status"),
  ];

  return (
    <AppShell>
      <div style={s.head}>
        <div>
          <h1 style={s.title}>{t("ciRuns.title")}</h1>
          <p style={s.subtitle}>{t("ciRuns.subtitle")}</p>
        </div>
        <div style={s.refresh}>
          <span style={s.live}>
            <span style={s.dot} />
            {t("ciRuns.autoRefresh")}
          </span>
        </div>
      </div>

      <div style={s.table}>
        <div style={{ display: "grid", gridTemplateColumns: s.grid, ...s.headRow }}>
          {cols.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
        {runs.map((r, i) => {
          const st = r.status ? STATUS[r.status] : undefined;
          return (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: s.grid,
                ...s.row,
                borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <span className="mono" style={s.ts}>
                {when(r.ran_at) ?? "—"}
              </span>
              <div style={{ minWidth: 0 }}>
                {r.pr_number === null ? (
                  <span style={s.muted}>—</span>
                ) : r.github_url ? (
                  <a className="mono" style={s.prNum} href={r.github_url} target="_blank" rel="noreferrer">
                    #{r.pr_number}
                  </a>
                ) : (
                  <span className="mono" style={s.prNum}>
                    #{r.pr_number}
                  </span>
                )}
              </div>
              <span style={s.agent}>
                <Icon.Cpu size={13} style={{ color: "var(--text-muted)" }} />
                {r.agent ?? "—"}
              </span>
              <span style={s.num}>{r.source ?? "—"}</span>
              <span className="tnum" style={s.num}>
                {r.findings_count ?? "—"}
              </span>
              <span className="mono tnum" style={s.num}>
                {r.cost_usd === null ? "—" : `$${r.cost_usd.toFixed(2)}`}
              </span>
              {st ? (
                <Badge color={st.color} dot>
                  {t(`ciRuns.status.${st.key}`)}
                </Badge>
              ) : (
                <span style={s.muted}>—</span>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
