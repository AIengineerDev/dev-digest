/* EvalsTab — the agent's regression set and its run history (spec 13, R7).

   Two lists, deliberately: the cases are what the agent is measured against,
   the runs are the measurements. Keeping them on one tab is what makes the
   question "did my prompt edit help" answerable without leaving the editor. */
"use client";

import * as React from "react";
import type { EvalCase } from "@devdigest/shared";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useAgentEvalCases, useAgentEvalRuns, useRunEvals } from "@/lib/hooks";
import { runLevelError } from "./helpers";
import { MetricTiles } from "./_components/MetricTiles";
import { EvalCaseList } from "@/components/EvalCaseList";
import { EvalCaseEditor } from "@/components/EvalCaseEditor";
import { RunHistory } from "./_components/RunHistory";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const cases = useAgentEvalCases(agentId);
  const runs = useAgentEvalRuns(agentId);
  const run = useRunEvals();
  const [editing, setEditing] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);

  if (cases.isLoading || runs.isLoading) return <Skeleton />;
  if (cases.isError) return <ErrorState title={t("evals.loadFailed")} body={String(cases.error)} />;

  const caseRows = cases.data ?? [];
  const runGroups = runs.data ?? [];
  const latest = runGroups[0] ?? null;

  return (
    <div style={s.wrap}>
      {/* Design: design-mocks/src/17-screen_agents.jsx:135 — title, a pass
          badge, then the run action pushed to the right. */}
      <div style={s.header}>
        <h2 style={s.h2}>{t("evals.title")}</h2>
        {latest ? (
          <Badge
            color={latest.passed === latest.cases_total ? "var(--ok)" : "var(--warn)"}
            {...(latest.passed === latest.cases_total ? { bg: "var(--ok-bg)" } : {})}
          >
            {t("evals.passing", { passed: latest.passed, total: latest.cases_total })}
          </Badge>
        ) : (
          <Badge color="var(--text-muted)">{t("evals.neverRun")}</Badge>
        )}
        <Button
          kind="secondary"
          size="sm"
          icon="Play"
          style={{ marginLeft: "auto" }}
          // Running with no cases is a 422 from the server; not offering the
          // click is friendlier than explaining the error afterwards.
          disabled={caseRows.length === 0 || run.isPending}
          onClick={() => run.mutate(agentId)}
        >
          {run.isPending ? t("evals.running") : t("evals.runAll")}
        </Button>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
          {t("evals.newCase")}
        </Button>
      </div>

      {run.isError && <ErrorState title={t("evals.runFailed")} body={String(run.error)} />}

      {/* Every case failed the same way: the provider never answered. Showing
          the metric tiles here would report a measurement that did not happen. */}
      {runLevelError(latest) ? (
        <ErrorState title={t("evals.providerFailed")} body={runLevelError(latest)!} />
      ) : (
        <MetricTiles latest={latest} previous={runGroups[1] ?? null} history={runGroups} />
      )}

      {caseRows.length === 0 ? (
        <EmptyState
          icon="FlaskConical"
          title={t("evals.noCases")}
          body={t("evals.noCasesBody")}
        />
      ) : (
        <EvalCaseList
          cases={caseRows}
          latest={latest}
          agentId={agentId}
          onEdit={setEditing}
        />
      )}

      <RunHistory groups={runGroups} />

      {creating && (
        <EvalCaseEditor
          source={{ kind: "manual", ownerKind: "agent", ownerId: agentId }}
          agentId={agentId}
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <EvalCaseEditor
          source={{ kind: "edit", evalCase: editing }}
          agentId={agentId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
