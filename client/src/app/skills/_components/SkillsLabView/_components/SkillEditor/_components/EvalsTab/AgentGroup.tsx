"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { EvalCaseWithOwner } from "@devdigest/shared";
import * as React from "react";
import { Badge, Button } from "@devdigest/ui";
import type { EvalCase } from "@devdigest/shared";
import { EvalCaseEditor } from "@/components/EvalCaseEditor";
import { EvalCaseList } from "@/components/EvalCaseList";
import { useAgentEvalRuns, useRunEvals } from "@/lib/hooks";
import { s } from "./styles";

/** One linking agent: its latest score, its run button, and its cases. */
export function AgentGroup({
  agentId,
  name,
  cases,
}: {
  agentId: string;
  name: string;
  cases: EvalCaseWithOwner[];
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const runs = useAgentEvalRuns(agentId);
  const run = useRunEvals();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<EvalCase | null>(null);
  // Only a finished run may be the HEADLINE — a partial one reports means over
  // a subset and reads better than it is. But a partial run is still a run:
  // falling back to null made the badge say "never run" for an agent with 19
  // of them, because `complete` compares each past run against the CURRENT
  // case count, so adding one case blanks the whole history.
  const groups = runs.data ?? [];
  const complete = groups.find((g) => g.complete) ?? null;
  const latest = complete ?? groups[0] ?? null;
  const partial = latest !== null && complete === null;

  return (
    <div style={s.group}>
      <div style={s.groupHead}>
        <span style={s.groupName}>{name}</span>
        {latest ? (
          <Badge
            color={
              partial
                ? "var(--text-muted)"
                : latest.passed === latest.cases_total
                  ? "var(--ok)"
                  : "var(--warn)"
            }
          >
            {partial
              ? t("evals.partial", { covered: latest.cases_total, total: cases.length })
              : t("evals.passing", { passed: latest.passed, total: latest.cases_total })}
          </Badge>
        ) : (
          <Badge color="var(--text-muted)">{t("evals.neverRun")}</Badge>
        )}
        <span style={s.groupCount}>{t("evals.caseCount", { n: cases.length })}</span>
        <div style={s.groupActions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            disabled={run.isPending}
            onClick={() => run.mutate(agentId)}
          >
            {run.isPending ? t("evals.running") : t("evals.runThrough")}
          </Button>
          {/* Owned by the AGENT, not the skill: a skill-owned case cannot be
              run, and an unrunnable case in a set is dead weight. */}
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
            {t("evals.newCase")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="ChevronRight"
            onClick={() => router.push(`/evals/${agentId}`)}
          >
            {t("evals.openAgent")}
          </Button>
        </div>
      </div>
      {/* Same component the agent editor uses, so Run / Edit / Delete behave
          identically in both places rather than drifting apart. */}
      {creating && (
        <EvalCaseEditor
          source={{ kind: "manual", ownerKind: "agent", ownerId: agentId }}
          agentId={agentId}
          onClose={() => setCreating(false)}
        />
      )}
      {/* Edit opens HERE now. Run and Delete already worked in place; sending
          only Edit to another page was the odd one out. */}
      {editing && (
        <EvalCaseEditor
          source={{ kind: "edit", evalCase: editing }}
          agentId={agentId}
          onClose={() => setEditing(null)}
        />
      )}
      <EvalCaseList cases={cases} latest={latest} agentId={agentId} onEdit={setEditing} />
    </div>
  );
}
