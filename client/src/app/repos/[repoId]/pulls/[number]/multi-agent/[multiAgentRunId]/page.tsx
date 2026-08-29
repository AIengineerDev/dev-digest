/* Multi-Agent Review results — /repos/:repoId/pulls/:number/multi-agent/:id
   (R5/R6). One fetch (`useMultiAgentRun`) backs both Columns and Tabs; the
   view choice lives in the URL so a shared link opens what the sender saw. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { usePulls, usePullDetail } from "@/lib/hooks";
import { useMultiAgentRun, useRunEvents, useRunReview } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import type { RunSummary } from "@devdigest/shared";
import { AgentColumn } from "./_components/AgentColumn";
import { AgentTabs } from "./_components/AgentTabs";
import { ConflictsSection } from "./_components/ConflictsSection";
import { colorForIndex, findingsForAgent, totalCostUsd, totalDurationMs } from "./helpers";
import { s } from "./styles";

export default function MultiAgentResultsPage() {
  const params = useParams<{ repoId: string; number: string; multiAgentRunId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("runs");
  const { repoId, number, multiAgentRunId } = params;
  const { activeRepo } = useActiveRepo();

  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr } = usePullDetail(prId);

  const {
    data: view,
    isLoading: runLoading,
    isError,
    error,
    refetch,
  } = useMultiAgentRun(prId, multiAgentRunId);
  const retry = useRunReview();
  const [retried, setRetried] = React.useState<{ run_id: string; agent_name: string | null } | null>(
    null,
  );

  const runs = view?.runs ?? [];
  const groups = view?.groups ?? [];
  // Live status per run — one subscription for every member, reused by both
  // Columns and Tabs (they read the same query, not a per-column EventSource).
  const runIds = runs.map((r) => r.run_id);
  useRunEvents(runIds);

  const viewMode = search.get("view") === "tabs" ? "tabs" : "columns";
  const traceRunId = search.get("trace");

  const buildParams = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(search.toString());
    for (const [key, val] of Object.entries(patch)) {
      if (val == null) sp.delete(key);
      else sp.set(key, val);
    }
    const qs = sp.toString();
    return `/repos/${repoId}/pulls/${number}/multi-agent/${multiAgentRunId}${qs ? `?${qs}` : ""}`;
  };
  const setParam = (key: string, val: string | null) => router.replace(buildParams({ [key]: val }));

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true, href: `/repos/${repoId}/pulls/${number}` },
    { label: t("page.title") },
  ];

  const isLoading = pullsLoading || runLoading;

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={28} width={420} />
          <Skeleton height={200} style={{ marginTop: 16 }} />
        </div>
      </AppShell>
    );
  }

  if (isError || !view) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this multi-agent run"
          body={error instanceof ApiError ? error.message : "This run could not be loaded."}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const entries = runs.map((run, i) => ({
    run,
    findings: findingsForAgent(groups, run.agent_id ?? `deleted-agent:${run.run_id}`),
    color: colorForIndex(i),
  }));

  const totalTimeS = totalDurationMs(runs) / 1000;
  const totalCost = totalCostUsd(runs);

  async function onRetry(run: RunSummary) {
    if (!prId || !run.agent_id || retry.isPending) return; // one at a time; a deleted agent cannot be retried
    const res = await retry.mutateAsync({ prId, agentIds: [run.agent_id] });
    const newRunId = res.runs[0]?.run_id;
    if (!newRunId) return;
    // Single target ⇒ res.multi_agent_run_id is null and the run is NOT in this
    // group (service.ts:139-140). Nothing to navigate to; show it in place.
    setRetried({ run_id: newRunId, agent_name: run.agent_name ?? null });
    setParam("trace", newRunId);
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <button
          style={s.configureButton}
          title="Change PR or agents"
          onClick={() => router.push(`/repos/${repoId}/multi-agent?phase=config&pr=${number}`)}
        >
          <Icon.Settings size={14} />
          {t("page.configureRun")}
        </button>
        <h1 style={s.h1}>{t("page.title")}</h1>
        <span style={s.subtitle}>{t("page.selectedAgents", { count: runs.length })}</span>
        <div style={s.viewSwitch}>
          {(["columns", "tabs"] as const).map((k) => (
            <button key={k} style={s.viewButton(viewMode === k)} onClick={() => setParam("view", k)}>
              {t(`page.view.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div style={s.metaRow}>
        <span className="mono" style={s.prNumber}>
          #{pr?.number ?? number}
        </span>
        <span style={s.prTitle}>{pr?.title ?? ""}</span>
        <span style={s.metaRight}>
          <Icon.Cpu size={14} style={{ color: "var(--accent)" }} />
          {t("page.meta", { count: runs.length, duration: totalTimeS.toFixed(1), cost: `$${totalCost.toFixed(2)}` })}
        </span>
      </div>

      {viewMode === "columns" ? (
        <div style={s.columnsBody}>
          <div style={s.columnsGrid(entries.length)}>
            {entries.map((e) => (
              <AgentColumn
                key={e.run.run_id}
                run={e.run}
                findings={e.findings}
                color={e.color}
                onViewTrace={() => setParam("trace", e.run.run_id)}
                onRetry={e.run.agent_id ? () => void onRetry(e.run) : undefined}
              />
            ))}
          </div>
          <ConflictsSection groups={groups} />
        </div>
      ) : (
        <div>
          <AgentTabs
            entries={entries}
            prId={prId ?? ""}
            multiAgentRunId={multiAgentRunId}
            repoFullName={activeRepo?.full_name ?? null}
            onViewTrace={(runId) => setParam("trace", runId)}
          />
          <div style={{ padding: "0 28px" }}>
            <ConflictsSection groups={groups} />
          </div>
        </div>
      )}

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr?.number}
          findings={entries.find((e) => e.run.run_id === traceRunId)?.findings ?? []}
          agentName={
            runs.find((r) => r.run_id === traceRunId)?.agent_name ??
            (retried?.run_id === traceRunId ? retried.agent_name : null)
          }
          running={
            runs.find((r) => r.run_id === traceRunId)?.status === "running" ||
            retried?.run_id === traceRunId
          }
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
