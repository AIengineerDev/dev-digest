/* Multi-Agent Review — /repos/:repoId/multi-agent (R8/R9/R10).
   Two-phase screen: arriving with an existing run shows that run's results
   (by redirecting into the PR-nested results route — the one place Columns/
   Tabs render, per Phase 8's decision); with no run yet, or `?phase=config`,
   it shows the Configure run picker instead. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { usePulls } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentEstimates, useLatestMultiAgentRun, useRunReview } from "@/lib/hooks/reviews";
import { RunConfig } from "./_components/RunConfig";

export default function MultiAgentConfigPage() {
  const params = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("runs");
  const { repoId } = params;

  const phase = search.get("phase");
  const prParam = search.get("pr");

  const { data: latest, isLoading: latestLoading } = useLatestMultiAgentRun(repoId);
  const { data: pulls } = usePulls(repoId);
  const { data: agents } = useAgents();
  const { data: estimates } = useAgentEstimates();
  const run = useRunReview();

  const enabledAgents = React.useMemo(() => (agents ?? []).filter((a) => a.enabled), [agents]);
  const openPrs = React.useMemo(() => (pulls ?? []).filter((p) => p.status !== "stale"), [pulls]);

  const [prNumber, setPrNumber] = React.useState<number | null>(prParam ? Number(prParam) : null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const selectedPr = openPrs.find((p) => p.number === prNumber) ?? null;
  const prId = selectedPr ? (pulls ?? []).find((p) => p.number === selectedPr.number)?.id ?? null : null;

  const showConfig = phase === "config" || (!latestLoading && !latest);

  // R8: arriving with an existing run renders that run's results, not a form.
  // Nested under the PR route (spec C2) — this route never renders Columns/Tabs
  // itself, so there is exactly one place that does.
  React.useEffect(() => {
    if (!showConfig && latest) {
      router.replace(`/repos/${repoId}/pulls/${latest.prNumber}/multi-agent/${latest.id}`);
    }
  }, [showConfig, latest, repoId, router]);

  function toggle(agentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  async function onRun() {
    if (!prId || selected.size === 0) return;
    const res = await run.mutateAsync({ prId, agentIds: [...selected] });
    if (res.multi_agent_run_id) {
      router.push(`/repos/${repoId}/pulls/${prNumber}/multi-agent/${res.multi_agent_run_id}`);
    }
  }

  const crumb = [{ label: t("page.crumb") }, ...(phase === "config" ? [{ label: t("page.configureRun") }] : [])];

  if (latestLoading || !showConfig) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ padding: "24px 28px", maxWidth: 720, margin: "0 auto" }}>
          <Skeleton height={28} width={320} />
          <Skeleton height={160} style={{ marginTop: 16 }} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <RunConfig
        prs={openPrs}
        selectedPr={selectedPr}
        onSelectPr={(number) => {
          setPrNumber(number);
          setSelected(new Set());
        }}
        agents={enabledAgents}
        selected={selected}
        onToggle={toggle}
        onSelectAll={() => setSelected(new Set(enabledAgents.map((a) => a.id)))}
        onClearAll={() => setSelected(new Set())}
        estimates={estimates ?? []}
        running={run.isPending}
        onRun={() => void onRun()}
      />
    </AppShell>
  );
}
